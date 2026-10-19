# MCP tool eval suite

A live, opt-in eval that exercises every registered Terminal49 MCP tool against a
deployed gateway and scores each response on its **objective contract** — no LLM
required. It answers: _do the tools work, return well-shaped data, handle errors
sanely, respond quickly, and omit the runtime steering metadata removed from the
public tool contract?_

## Run it

The suite is **skipped unless auth is configured**, so the default unit-test run
(`npm run test`) never touches the network.

```sh
# Against production (default endpoint) with an OAuth access token:
MCP_EVAL_BEARER="<oauth access token>" npm run eval --workspace @terminal49/mcp

# ...or with a Terminal49 API key (Token passthrough scheme):
MCP_EVAL_TOKEN="<terminal49 api key>" npm run eval --workspace @terminal49/mcp

# Against a local gateway (vercel dev) or any other deployment:
MCP_EVAL_ENDPOINT="http://localhost:4000/mcp" \
MCP_EVAL_TOKEN="<key>" npm run eval --workspace @terminal49/mcp
```

| Env var                   | Meaning                                                                       | Default                           |
| ------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| `MCP_EVAL_BEARER`         | OAuth 2.1 access token → `Authorization: Bearer`                              | —                                 |
| `MCP_EVAL_TOKEN`          | Terminal49 API key → `Authorization: Token`                                   | —                                 |
| `MCP_EVAL_ENDPOINT`       | Gateway `/mcp` URL                                                            | `https://mcp.terminal49.com/mcp`  |
| `MCP_EVAL_ENABLE_WRITE`   | Opt in to `track_container` and the write evals                               | unset (skipped)                   |
| `MCP_EVAL_ALLOW_SPARSE`   | Allow cases to skip when the account has no data or the gateway lacks tools   | unset (strict)                    |
| `MCP_EVAL_SANDBOX_TOKEN`  | API key of the sandbox account for the write evals                            | unset (write evals skipped)       |
| `MCP_EVAL_SANDBOX_BEARER` | OAuth access token of a sandbox account user, for the custom field write eval | unset (custom field case skipped) |

> OAuth access tokens are short-lived (~5 min). For repeatable/CI runs, prefer a
> `MCP_EVAL_TOKEN` API key — it does not expire.

Typecheck the suite without running it: `tsc --noEmit -p tsconfig.eval.json`.

## What it checks

`beforeAll` discovers real ids (via `list_shipments` / `list_containers`) and
feeds them to the detail tools. **Discovery is strict by default**: if the
account yields no shipment/container fixtures, the run fails instead of letting
the detail cases silently skip and report a hollow "pass". Set
`MCP_EVAL_ALLOW_SPARSE=1` to permit skipping on a genuinely empty account.

Each case is scored by [`quality.ts`](./quality.ts). **Contract checks** must
all pass (`contractPass`) — a single failure fails the test:

- transport `200`, correct tool-error semantics (`isError`)
- primary payload parses as JSON and carries the required keys
- per-tool shape predicates (e.g. `total_lines === shipping_lines.length`, id
  round-trips, `timeline` is an array)
- removed runtime steering fields are absent from every JSON content block:
  `_agent_steering`, `presentation_guidance`, `suggested_follow_ups`, and
  `suggested_tools`

**Latency** is a _soft_ check: recorded in the score and the report, but a slow
response alone never fails the suite.

The webhook read cases check that `list_webhooks` returns no secret, header
value, or URL query string, and that `list_webhook_notifications` returns
delivery rows. Both skip when the gateway does not list the opt-in `developer`
toolset.

Negative cases assert error behavior: an unknown id and a missing required
argument must produce tool errors, while a gibberish search must return an empty
result set (not an error).

`track_container` is the only mutating tool that `tools.eval.ts` calls, and it
is **skipped by default**. The other write tools run in the
[write evals](#write-evals). Set `MCP_EVAL_ENABLE_WRITE=1` to include it: it is driven with an already-tracked
number so it takes the idempotent search-match path and asserts
`tracking_request_created === false`. Only enable it against an account you know
already tracks the discovered container, since on an arbitrary account the call
could create a real tracking request.

## Write evals

[`writes.eval.ts`](./writes.eval.ts) runs the write tools against the sandbox
account. It runs only when `MCP_EVAL_ENABLE_WRITE=1` and
`MCP_EVAL_SANDBOX_TOKEN` are both set, and it uses that token, never
`MCP_EVAL_TOKEN`.

The sandbox account also holds demo data, so the suite changes only three
eval fixtures. [`write-fixtures.ts`](./write-fixtures.ts) names them and picks
each one by exact match:

- the one shipment whose reference numbers include `MCP-EVAL-FIXTURE`;
- the party named `MCP Eval (do not use)`;
- the shipment custom field with API slug `mcp_eval_fixture` and type
  `short_text`.

A case skips when its fixture is missing. It never falls back to another
record. Unit tests in [`write-fixtures.test.ts`](./write-fixtures.test.ts)
check that each selector refuses a near match, such as another reference
number, another party name, or another custom field.

### One-time setup

Do these steps once in the sandbox account before the first run:

1. Add the reference number `MCP-EVAL-FIXTURE` to one demo shipment. Pick a
   shipment that is still tracked. Do not add it to a second shipment. The
   suite skips when two shipments carry it.
2. Create a shipment custom field with the API slug `mcp_eval_fixture` and the
   type short text. Use it for nothing else.

You do not need to create the party. The first run creates
`MCP Eval (do not use)` with `assign_party`, and later runs find it by name.
Do not rename it or use it on other records.

### Cases

Each case is a round trip on the fixtures. It undoes its write in a `finally`
block, so the change is undone even when an assertion fails:

- stop the fixture shipment with a confirmed preview, then resume it;
- refuse a stop with an edited confirmation token;
- add a reference number to the fixture shipment, then remove it with a
  confirmed preview;
- assign the eval party as `notify_party` on the fixture shipment, then
  unassign it with a confirmed preview. When the case fails, it reads the
  shipment's party roles and unassigns every eval party role it finds, so a
  role whose assign response was lost is removed too;
- set `mcp_eval_fixture` on the fixture shipment, then overwrite it and clear
  it with confirmed previews. Terminal49 accepts custom field changes only
  from a signed-in user, never from an API key. So this case runs as the user
  in `MCP_EVAL_SANDBOX_BEARER` and skips when it is unset. That token is
  short-lived, so set it just before the run. Before it writes, the case
  calls `whoami` with both credentials and fails when the bearer's account is
  not the `MCP_EVAL_SANDBOX_TOKEN` account. The case always clears the field
  when it ends.
- preview a `reextract` with `update_document` on a document attached to the
  fixture shipment, without confirming it. Nothing is written. The case
  finds the document by the fixture shipment's bill of lading and skips when
  none is attached.

The write suite is strict too. Its `beforeAll` fails when the gateway does not
list every default write tool, so a gateway that lost `operations` or
`documents_write` cannot pass with every case skipped.
`MCP_EVAL_ALLOW_SPARSE=1` turns that failure into skips. The two stop cases
also skip when the sandbox key cannot stop tracking (`FeatureNotEnabled`) or
the fixture shipment is already stopped. The custom field case skips when the
field already has a value, and its cleanup removes that value for the next
run.

`cancel_tracking_request` and `relink_document` have no live case. A cancel
cannot be undone, and each run would need a new, billable tracking request. A
relink can add shipment or container links that nothing removes. Fixture
tests cover both.

## Output

A terminal scorecard (one line per case, with failed checks expanded) plus a
JSON artifact under `eval/reports/` (gitignored) for diffing runs over time.

## CI

On pull requests, the `MCP preview` job runs this suite against the PR's Vercel
preview, so new cases exercise the code under review. On pushes to `main`, the
`mcp` job runs it against production as a deployed-state check. Both pass
`MCP_EVAL_TOKEN: ${{ secrets.MCP_EVAL_TOKEN }}` with the `Token` scheme, and the
`mcp` job always runs `eval:check` to typecheck the suite. OAuth bearer tokens expire in minutes, so CI uses a **long-lived
Terminal49 API key** stored as the `MCP_EVAL_TOKEN` repo secret.

> Add a **non-admin** account's API key as the `MCP_EVAL_TOKEN` repo secret
> (admin data skews latency/shape). Until the secret is set the step **skips and
> exits 0** — CI stays green, so forks and unconfigured repos are unaffected. The
> mutating `track_container` case stays off (no `MCP_EVAL_ENABLE_WRITE`).

On pushes to `main`, the `mcp-sandbox-write-eval` job runs only
`eval/writes.eval.ts` against production after the `mcp` job passes. It first
waits until Vercel reports a successful production deployment of the pushed
commit, so it never tests the build that production served before the push.
Its concurrency group lets only one run edit the sandbox account at a time. It sets `MCP_EVAL_ENABLE_WRITE=1` and
passes `MCP_EVAL_SANDBOX_TOKEN: ${{ secrets.MCP_EVAL_SANDBOX_TOKEN }}`. Store
the sandbox account's API key in that secret, never a customer
account's key. Until the secret is set, the write suite skips and the step
exits 0. CI does not set `MCP_EVAL_SANDBOX_BEARER`, because OAuth tokens expire
in minutes, so the custom field case skips there. Run it by hand with a fresh
token.

`resolveSandboxConfig` in [`client.ts`](./client.ts) decides whether the write
suite runs. Unit tests in [`sandbox-config.test.ts`](./sandbox-config.test.ts)
check that it skips unless both settings are present, and that it never uses
`MCP_EVAL_TOKEN` or `MCP_EVAL_BEARER`.

## Not covered here: subjective quality

This suite grades the deterministic contract. It does **not** judge whether a
tool's output makes an LLM agent _answer well_ — that is a separate concern best
handled by an LLM-as-judge harness such as
[`vitest-evals`](https://github.com/getsentry/vitest-evals), which runs an agent
wired to this MCP server over realistic tasks and scores the transcript. That
layer needs an LLM provider key and is intentionally kept out of this
credential-free, deterministic suite.
