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

| Env var                  | Meaning                                                 | Default                          |
| ------------------------ | ------------------------------------------------------- | -------------------------------- |
| `MCP_EVAL_BEARER`        | OAuth 2.1 access token → `Authorization: Bearer`        | —                                |
| `MCP_EVAL_TOKEN`         | Terminal49 API key → `Authorization: Token`             | —                                |
| `MCP_EVAL_ENDPOINT`      | Gateway `/mcp` URL                                      | `https://mcp.terminal49.com/mcp` |
| `MCP_EVAL_ENABLE_WRITE`  | Opt in to `track_container` and the write evals         | unset (skipped)                  |
| `MCP_EVAL_ALLOW_SPARSE`  | Allow detail cases to skip when the account has no data | unset (strict)                   |
| `MCP_EVAL_SANDBOX_TOKEN` | API key of the sandbox account for the write evals      | unset (write evals skipped)      |

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

`track_container` — the only mutating tool — is **skipped by default**. Set
`MCP_EVAL_ENABLE_WRITE=1` to include it: it is driven with an already-tracked
number so it takes the idempotent search-match path and asserts
`tracking_request_created === false`. Only enable it against an account you know
already tracks the discovered container, since on an arbitrary account the call
could create a real tracking request.

## Write evals

[`writes.eval.ts`](./writes.eval.ts) runs the write tools against a dedicated
sandbox account. It runs only when `MCP_EVAL_ENABLE_WRITE=1` and
`MCP_EVAL_SANDBOX_TOKEN` are both set, and it uses that token, never
`MCP_EVAL_TOKEN`. Each case except the document case is a round trip that
leaves the record as it found it. The document case only previews. The cases:

- stop a shipment with a confirmed preview, then resume it;
- refuse a stop with an edited confirmation token;
- add a reference number to a shipment, then remove it with a confirmed
  preview;
  with a confirmed preview.
- preview a `reextract` of the first document with `update_document`, without
  confirming it, so it changes nothing. A document fix cannot be undone
  exactly, so the case never confirms one. `relink_document` has no live case,
  because a relink repeats Terminal49's matching and can add shipment or
  container links that nothing removes; its fixture tests cover it. The case
  depends on the `documents_write` toolset, not `operations`. It skips when
  the gateway does not list `update_document` or the account has no
  document.

Every other case skips when the gateway does not list the write tools, which
happens when its toolsets leave out `operations`, or when the sandbox account
has no shipment. The two stop cases also skip when the sandbox key cannot stop
tracking (`FeatureNotEnabled`) or the first shipment is already stopped. The
reference number case does not check either, so it runs on a stopped shipment
too.
If an assertion fails after a change, the case still undoes the change before
it ends. `cancel_tracking_request` has no live
case: a cancel cannot be undone and each run would need a new, billable
tracking request. Fixture tests cover it.

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

## Not covered here: subjective quality

This suite grades the deterministic contract. It does **not** judge whether a
tool's output makes an LLM agent _answer well_ — that is a separate concern best
handled by an LLM-as-judge harness such as
[`vitest-evals`](https://github.com/getsentry/vitest-evals), which runs an agent
wired to this MCP server over realistic tasks and scores the transcript. That
layer needs an LLM provider key and is intentionally kept out of this
credential-free, deterministic suite.
