# MCP tool eval suite

A live, opt-in eval that exercises every registered Terminal49 MCP tool against a
deployed gateway and scores each response on its **objective contract** — no LLM
required. It answers: *do the tools work, return well-shaped data, handle errors
sanely, respond quickly, and ship the `_agent_steering` guidance the server
promises?*

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

| Env var | Meaning | Default |
| --- | --- | --- |
| `MCP_EVAL_BEARER` | OAuth 2.1 access token → `Authorization: Bearer` | — |
| `MCP_EVAL_TOKEN` | Terminal49 API key → `Authorization: Token` | — |
| `MCP_EVAL_ENDPOINT` | Gateway `/mcp` URL | `https://mcp.terminal49.com/mcp` |
| `MCP_EVAL_ENABLE_WRITE` | Opt in to the mutating `track_container` case | unset (skipped) |
| `MCP_EVAL_ALLOW_SPARSE` | Allow detail cases to skip when the account has no data | unset (strict) |

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
- an `_agent_steering` block is present and suggests follow-ups

**Latency** is a *soft* check: recorded in the score and the report, but a slow
response alone never fails the suite.

Negative cases assert error behavior: an unknown id and a missing required
argument must produce tool errors, while a gibberish search must return an empty
result set (not an error).

`track_container` — the only mutating tool — is **skipped by default**. Set
`MCP_EVAL_ENABLE_WRITE=1` to include it: it is driven with an already-tracked
number so it takes the idempotent search-match path and asserts
`tracking_request_created === false`. Only enable it against an account you know
already tracks the discovered container, since on an arbitrary account the call
could create a real tracking request.

## Output

A terminal scorecard (one line per case, with failed checks expanded) plus a
JSON artifact under `eval/reports/` (gitignored) for diffing runs over time.

## CI

The `mcp` job in `.github/workflows/ci.yml` runs this suite on every push/PR via
`npm run eval` (plus `eval:check` to typecheck it). It passes
`MCP_EVAL_TOKEN: ${{ secrets.MCP_EVAL_TOKEN }}` and hits production with the
`Token` scheme. OAuth bearer tokens expire in minutes, so CI uses a **long-lived
Terminal49 API key** stored as the `MCP_EVAL_TOKEN` repo secret.

> Add a **non-admin** account's API key as the `MCP_EVAL_TOKEN` repo secret
> (admin data skews latency/shape). Until the secret is set the step **skips and
> exits 0** — CI stays green, so forks and unconfigured repos are unaffected. The
> mutating `track_container` case stays off (no `MCP_EVAL_ENABLE_WRITE`).

## Not covered here: subjective quality

This suite grades the deterministic contract. It does **not** judge whether a
tool's output makes an LLM agent *answer well* — that is a separate concern best
handled by an LLM-as-judge harness such as
[`vitest-evals`](https://github.com/getsentry/vitest-evals), which runs an agent
wired to this MCP server over realistic tasks and scores the transcript. That
layer needs an LLM provider key and is intentionally kept out of this
credential-free, deterministic suite.
