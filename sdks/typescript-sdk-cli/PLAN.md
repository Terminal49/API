# Terminal49 CLI — Implementation Plan

> CLI built on top of `@terminal49/sdk` for LLM agents, chat interfaces, and human developers.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Architecture](#2-architecture)
3. [Command Surface](#3-command-surface)
4. [Output Modes](#4-output-modes)
5. [Authentication & Configuration](#5-authentication--configuration)
6. [LLM Agent & Chat Interface Design](#6-llm-agent--chat-interface-design)
7. [Error Handling](#7-error-handling)
8. [Project Structure](#8-project-structure)
9. [Technology Choices](#9-technology-choices)
10. [Implementation Phases](#10-implementation-phases)
11. [Test Plan & Coverage](#11-test-plan--coverage)

---

## 1. Design Principles

Sourced from the [Node.js CLI Apps Best Practices](https://github.com/lirantal/nodejs-cli-apps-best-practices) and adapted for dual-consumer (LLM + human) use.

### 1.1 Command-Line Experience

| Principle | Rationale |
|---|---|
| **Respect POSIX args** | `--flag value`, `-f`, `--no-color` — predictable for scripts and LLMs |
| **Zero-config startup** | `T49_API_TOKEN` env var + sensible defaults — no wizard needed |
| **Stateful config** | `t49 config set token <tok>` persists to `~/.config/terminal49/config.json` |
| **Enable composability** | Pipe-friendly: `t49 containers list --json \| jq '.items[].number'` |
| **Actionable errors** | Every error has a code, human message, and a JSON detail block |
| **Graceful shutdown** | Handle SIGINT/SIGTERM — cancel in-flight requests, print partial results |

### 1.2 Dual-Consumer Design (LLM Agent + Human)

| Consumer | Need | CLI Feature |
|---|---|---|
| LLM agent | Structured, parseable output | `--json` flag (default when stdout is not a TTY) |
| LLM agent | Deterministic, scriptable | Stable exit codes, no interactive prompts unless `--interactive` |
| LLM agent | Discoverability | `--help` with structured metadata, `t49 commands` listing |
| Human | Readable output | Table/colored output when TTY detected |
| Human | Progressive disclosure | Short help by default, `--help --verbose` for full docs |
| Chat interface | Streaming at scale | `--stream` for long-running list/poll operations |

### 1.3 POSIX Compliance

- Exit `0` on success, `1` on general error, `2` on usage error
- Map SDK errors to specific exit codes (see [Section 7](#7-error-handling))
- `stdout` for data, `stderr` for diagnostics/progress
- Support `--` to end option parsing
- Respect `NO_COLOR`, `FORCE_COLOR`, `TERM`

---

## 2. Architecture

```
┌──────────────────────────────────────────┐
│              CLI Entry (bin/t49)          │
│  - arg parsing (Commander.js)            │
│  - config loading                        │
│  - output formatting                     │
└────────────────┬─────────────────────────┘
                 │
┌────────────────▼─────────────────────────┐
│          Command Layer                    │
│  src/commands/{resource}.ts               │
│  - validates CLI-specific args            │
│  - maps flags → SDK method params         │
│  - calls SDK, formats output              │
└────────────────┬─────────────────────────┘
                 │
┌────────────────▼─────────────────────────┐
│        @terminal49/sdk                    │
│  Terminal49Client                          │
│  - typed HTTP, retry, error hierarchy     │
└──────────────────────────────────────────┘
```

The CLI is a **thin presentation layer** over the SDK. Business logic stays in `@terminal49/sdk`.

---

## 3. Command Surface

All commands follow `t49 <resource> <action> [args] [flags]`.

### 3.1 Shipments

```
t49 shipments get <id>               # Get a shipment by ID
t49 shipments list                   # List shipments
  --status <status>                  # Filter by status
  --port <locode>                    # Filter by port of discharge LOCODE
  --carrier <scac>                   # Filter by shipping line SCAC
  --updated-after <ISO-date>         # Filter by updated_at
  --no-containers                    # Exclude container includes
  --page <n>  --page-size <n>        # Pagination
t49 shipments update <id>            # Update shipment attributes
  --attrs '{"customer_name":"Acme"}' # JSON attributes
t49 shipments stop-tracking <id>     # Stop tracking
t49 shipments resume-tracking <id>   # Resume tracking
```

### 3.2 Containers

```
t49 containers get <id>              # Get a container by ID
  --include shipment,pod_terminal    # Customize includes
t49 containers list                  # List containers
  --status <status>
  --port <locode>
  --carrier <scac>
  --updated-after <ISO-date>
  --page <n>  --page-size <n>
t49 containers events <id>           # Transport events
t49 containers route <id>            # Vessel routing
t49 containers raw-events <id>       # Raw events
t49 containers refresh <id>          # Force refresh from carrier
t49 containers demurrage <id>        # Demurrage info
t49 containers rail <id>             # Rail milestones
```

### 3.3 Tracking Requests

```
t49 track <number>                   # Smart track — auto-detect carrier + type
  --scac <scac>                      # Override carrier
  --type container|bill_of_lading|booking_number
  --ref <ref1> --ref <ref2>          # Reference numbers
  --tag <tag>                        # Shipment tags
t49 tracking-requests list           # List all tracking requests
  --page <n>  --page-size <n>
t49 tracking-requests get <id>       # Get a tracking request
t49 tracking-requests create         # Create manually
  --type <type>
  --number <number>
  --scac <scac>
t49 tracking-requests update <id>    # Update
  --attrs '{...}'
t49 tracking-requests infer <number> # Infer number type + carrier
```

### 3.4 Shipping Lines

```
t49 shipping-lines list              # List all shipping lines
  --search <term>                    # Filter by name/SCAC
```

### 3.5 Search

```
t49 search <query>                   # Global search
```

### 3.6 Config

```
t49 config set token <value>         # Store API token
t49 config set base-url <url>        # Override base URL
t49 config get <key>                 # Read a config value
t49 config list                      # Show all config
t49 config path                      # Print config file path
```

### 3.7 Meta

```
t49 --version                        # Print version
t49 --help                           # Top-level help
t49 commands                         # List all commands (for LLM discovery)
  --json                             # Machine-readable command listing
t49 completions                      # Generate shell completions
  --shell bash|zsh|fish
```

---

## 4. Output Modes

### 4.1 Auto-Detection

```
if (process.stdout.isTTY) → table/human output
else → JSON output (for piping / LLM consumption)
```

### 4.2 Flags

| Flag | Effect |
|---|---|
| `--json` | Force JSON output (one document per stdout) |
| `--table` | Force table output (human-readable) |
| `--raw` | Return raw JSON:API document (no deserialization) |
| `--format mapped` | Return deserialized plain objects (default) |
| `--format both` | Return `{raw, mapped}` |
| `--compact` | Minimal JSON (no whitespace) — optimized for LLM token usage |
| `--fields id,number,status` | Select specific fields (reduce output for agents) |
| `--no-color` | Disable color (or respect `NO_COLOR` env) |
| `--quiet` / `-q` | Suppress non-data output |
| `--verbose` / `-v` | Verbose diagnostics to stderr |

### 4.3 LLM-Optimized JSON Envelope

When `--json` is active, every response follows a predictable envelope:

```json
{
  "ok": true,
  "command": "containers.get",
  "data": { ... },
  "pagination": { "page": 1, "pageSize": 25, "hasNext": true },
  "meta": { "requestId": "...", "duration_ms": 340 }
}
```

Error responses:

```json
{
  "ok": false,
  "command": "containers.get",
  "error": {
    "code": "NOT_FOUND",
    "message": "Container abc123 not found",
    "status": 404,
    "details": { ... }
  }
}
```

This predictable structure lets LLM agents parse results without brittle string matching.

---

## 5. Authentication & Configuration

### 5.1 Token Resolution Order

1. `--token <value>` flag (highest priority)
2. `T49_API_TOKEN` environment variable
3. `~/.config/terminal49/config.json` → `token` key
4. Error with actionable message

### 5.2 Config File

Location: `$XDG_CONFIG_HOME/terminal49/config.json` or `~/.config/terminal49/config.json`

```json
{
  "token": "your-api-token",
  "baseUrl": "https://api.terminal49.com/v2",
  "defaultFormat": "mapped",
  "defaultOutput": "json",
  "maxRetries": 2,
  "color": true
}
```

### 5.3 Environment Variables

| Variable | Maps to |
|---|---|
| `T49_API_TOKEN` | API token |
| `T49_BASE_URL` | API base URL |
| `T49_FORMAT` | Default response format (`raw`/`mapped`/`both`) |
| `T49_OUTPUT` | Default output mode (`json`/`table`) |
| `NO_COLOR` | Disable color |

---

## 6. LLM Agent & Chat Interface Design

This is the key differentiator — the CLI is designed to be a **tool** that LLM agents call.

### 6.1 Machine-Readable Command Discovery

```bash
$ t49 commands --json
{
  "commands": [
    {
      "name": "containers.get",
      "syntax": "t49 containers get <id> [--include <resources>]",
      "args": [{"name": "id", "required": true, "type": "string"}],
      "flags": [{"name": "--include", "type": "string", "default": "shipment,pod_terminal"}],
      "description": "Retrieve a single container by ID with optional related resources"
    },
    ...
  ]
}
```

An LLM agent can call `t49 commands --json` once, then construct any subsequent call with full type information.

### 6.2 Non-Interactive by Default

- No prompts. All required args must be provided as flags.
- Exit with code `2` and a clear error message on missing required args.
- `--interactive` flag explicitly opts in to prompts (human use only).

### 6.3 Token-Efficient Output

The `--compact` flag removes all whitespace from JSON and the `--fields` flag selects only needed fields. Example for an agent that only needs container numbers and statuses:

```bash
t49 containers list --json --compact --fields number,status
```

### 6.4 Structured Error Codes

Every error maps to a stable string code that an LLM can switch on:

| Code | HTTP | Meaning |
|---|---|---|
| `AUTH_MISSING` | 401 | No token provided |
| `AUTH_INVALID` | 401 | Token rejected |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `FEATURE_NOT_ENABLED` | 403 | Feature not on plan |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `VALIDATION_ERROR` | 400/422 | Invalid input |
| `RATE_LIMITED` | 429 | Too many requests |
| `UPSTREAM_ERROR` | 5xx | API server error |
| `NETWORK_ERROR` | — | Connection/timeout failure |
| `USAGE_ERROR` | — | Invalid CLI usage |

### 6.5 Pagination for Scale

List commands support automatic page iteration for chat interfaces processing large datasets:

```bash
# Single page (default)
t49 containers list --page 1 --page-size 100

# All pages (streams NDJSON lines — one JSON object per line)
t49 containers list --all --json
```

The `--all` flag iterates through all pages, emitting one JSON line per item (NDJSON format), suitable for streaming into LLM context windows or processing pipelines.

### 6.6 Polling & Webhooks

```bash
# Poll a container until status changes (for agent workflows)
t49 containers get <id> --poll --interval 60 --until "status=arrived"
```

---

## 7. Error Handling

### 7.1 Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | General / API error |
| `2` | Usage / argument error |
| `3` | Authentication error |
| `4` | Authorization / feature error |
| `5` | Not found |
| `6` | Validation error |
| `7` | Rate limited |
| `8` | Upstream / server error |
| `9` | Network / connection error |

### 7.2 Error Output

Errors always go to `stderr` (human mode) or as the JSON envelope (JSON mode).

Human mode:
```
Error [NOT_FOUND]: Container abc123 not found (HTTP 404)
  Hint: Verify the container ID with `t49 containers list`
```

JSON mode:
```json
{"ok":false,"error":{"code":"NOT_FOUND","message":"Container abc123 not found","status":404}}
```

### 7.3 SDK Error → CLI Error Mapping

```typescript
function mapSdkError(err: Terminal49Error): CliError {
  if (err instanceof AuthenticationError) return { code: 'AUTH_INVALID', exit: 3 };
  if (err instanceof FeatureNotEnabledError) return { code: 'FEATURE_NOT_ENABLED', exit: 4 };
  if (err instanceof AuthorizationError) return { code: 'FORBIDDEN', exit: 4 };
  if (err instanceof NotFoundError) return { code: 'NOT_FOUND', exit: 5 };
  if (err instanceof ValidationError) return { code: 'VALIDATION_ERROR', exit: 6 };
  if (err instanceof RateLimitError) return { code: 'RATE_LIMITED', exit: 7 };
  if (err instanceof UpstreamError) return { code: 'UPSTREAM_ERROR', exit: 8 };
  return { code: 'UNKNOWN', exit: 1 };
}
```

---

## 8. Project Structure

```
sdks/typescript-sdk-cli/
├── bin/
│   └── t49.ts                          # Entry point with shebang
├── src/
│   ├── index.ts                        # Program setup, global flags
│   ├── client-factory.ts               # Creates SDK client from config/flags
│   ├── config.ts                       # Config file read/write (~/.config/terminal49/)
│   ├── output/
│   │   ├── formatter.ts                # Output dispatcher (json/table/raw)
│   │   ├── json.ts                     # JSON envelope formatter
│   │   ├── table.ts                    # Table renderer (for TTY)
│   │   └── fields.ts                   # --fields projection
│   ├── errors.ts                       # CLI error mapping, exit codes
│   ├── commands/
│   │   ├── shipments.ts                # t49 shipments *
│   │   ├── containers.ts              # t49 containers *
│   │   ├── tracking-requests.ts       # t49 tracking-requests *
│   │   ├── track.ts                   # t49 track (smart shortcut)
│   │   ├── shipping-lines.ts          # t49 shipping-lines *
│   │   ├── search.ts                  # t49 search
│   │   ├── config.ts                  # t49 config *
│   │   └── commands.ts                # t49 commands (discovery)
│   └── util/
│       ├── pagination.ts              # --all page iteration
│       ├── polling.ts                 # --poll implementation
│       └── tty.ts                     # TTY detection, color support
├── test/
│   ├── unit/
│   │   ├── commands/
│   │   │   ├── shipments.test.ts
│   │   │   ├── containers.test.ts
│   │   │   ├── tracking-requests.test.ts
│   │   │   ├── track.test.ts
│   │   │   ├── shipping-lines.test.ts
│   │   │   ├── search.test.ts
│   │   │   ├── config.test.ts
│   │   │   └── commands.test.ts
│   │   ├── output/
│   │   │   ├── formatter.test.ts
│   │   │   ├── json.test.ts
│   │   │   ├── table.test.ts
│   │   │   └── fields.test.ts
│   │   ├── errors.test.ts
│   │   ├── config.test.ts
│   │   └── client-factory.test.ts
│   ├── integration/
│   │   ├── cli-exec.test.ts           # Spawn CLI process, assert stdout/stderr/exit
│   │   ├── shipments.integration.test.ts
│   │   ├── containers.integration.test.ts
│   │   └── tracking-requests.integration.test.ts
│   ├── e2e/
│   │   └── smoke.test.ts             # Live API tests (requires T49_API_TOKEN)
│   └── fixtures/
│       ├── mock-responses/            # Reuse SDK fixtures
│       └── expected-output/           # Snapshot of expected CLI output
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── biome.json
└── README.md
```

---

## 9. Technology Choices

| Concern | Choice | Rationale |
|---|---|---|
| **Arg parsing** | [Commander.js](https://github.com/tj/commander.js) | De facto standard (25M+ weekly downloads), git-style subcommands, auto-help, TypeScript types |
| **Table output** | [cli-table3](https://github.com/cli-table/cli-table3) | Lightweight, no deps, customizable columns |
| **Colors** | [chalk](https://github.com/chalk/chalk) | Respects `NO_COLOR`, wide adoption |
| **Config** | [conf](https://github.com/sindresorhus/conf) or custom JSON | XDG-compliant, simple key-value |
| **Testing** | Vitest | Matches existing SDK, fast, built-in coverage |
| **Coverage** | v8 via `@vitest/coverage-v8` | Matches SDK config, accurate for Node.js |
| **Linting** | Biome | Matches SDK config |
| **Build** | `tsc` | Matches SDK, simple |
| **Package** | `@terminal49/cli` | Scoped to org, installable via `npx @terminal49/cli` |

### 9.1 Dependencies (Production)

```json
{
  "@terminal49/sdk": "workspace:*",
  "commander": "^13.0.0",
  "chalk": "^5.4.0",
  "cli-table3": "^0.6.5",
  "conf": "^13.0.0"
}
```

### 9.2 Dependencies (Dev)

```json
{
  "typescript": "^5.6.3",
  "vitest": "^4.0.13",
  "@vitest/coverage-v8": "^4.0.18",
  "@biomejs/biome": "^1.9.4",
  "@types/node": "^20.19.0"
}
```

---

## 10. Implementation Phases

### Phase 1 — Foundation (scaffold + core commands)

1. **Project scaffolding** — `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`
2. **Entry point** — `bin/t49.ts` with Commander program setup, global flags (`--json`, `--token`, `--verbose`, `--quiet`, `--no-color`)
3. **Client factory** — Resolves token from flag → env → config file, creates `Terminal49Client`
4. **Config module** — Read/write `~/.config/terminal49/config.json`
5. **Output module** — JSON envelope formatter, basic table formatter, TTY detection
6. **Error module** — SDK error → CLI error mapping, exit codes
7. **Commands: `config`** — `set`, `get`, `list`, `path`
8. **Commands: `containers`** — `get`, `list`, `events`, `route`, `raw-events`, `refresh`, `demurrage`, `rail`
9. **Commands: `shipments`** — `get`, `list`, `update`, `stop-tracking`, `resume-tracking`
10. **Tests for Phase 1** — Unit tests for all modules, integration tests for CLI execution

### Phase 2 — Full Command Coverage

11. **Commands: `tracking-requests`** — `list`, `get`, `create`, `update`, `infer`
12. **Commands: `track`** — Smart auto-detect shortcut
13. **Commands: `shipping-lines`** — `list`
14. **Commands: `search`** — Global search
15. **Commands: `commands`** — Machine-readable command discovery
16. **`--fields` projection** — Select specific output fields
17. **Tests for Phase 2** — Unit + integration for new commands

### Phase 3 — Agent & Scale Features

18. **`--all` pagination** — Auto-iterate pages, NDJSON streaming
19. **`--compact` output** — Token-efficient JSON for LLMs
20. **`--poll` support** — Polling with `--interval` and `--until`
21. **Shell completions** — `t49 completions --shell bash|zsh|fish`
22. **`--interactive` mode** — Inquirer.js prompts for human use
23. **Tests for Phase 3** — Unit + integration for streaming, polling, completions

### Phase 4 — Polish & Distribution

24. **README & docs** — Usage guide, examples for LLM agents, examples for humans
25. **CI/CD pipeline** — GitHub Actions: test, lint, build, publish to npm
26. **Docker image** — `ghcr.io/terminal49/cli` for environments without Node.js
27. **npx support** — `npx @terminal49/cli containers list`
28. **Final coverage audit** — Ensure ≥90% line coverage, 100% on error paths

---

## 11. Test Plan & Coverage

### 11.1 Testing Strategy

```
                    ┌───────────────┐
                    │   E2E / Smoke │  Live API (CI optional, manual)
                    │    5 tests    │
                    ├───────────────┤
                    │  Integration  │  Spawn CLI process, mock API
                    │   ~30 tests   │
                    ├───────────────┤
                    │     Unit      │  Functions in isolation
                    │  ~120 tests   │
                    └───────────────┘
```

### 11.2 Unit Tests — Detailed Breakdown

#### 11.2.1 Config Module (`test/unit/config.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Reads existing config file | Config file parsing |
| 2 | Returns defaults when no config file exists | Graceful missing file |
| 3 | Writes token to config file | Persistence |
| 4 | Writes arbitrary key to config file | Key-value storage |
| 5 | Reads XDG_CONFIG_HOME override | XDG compliance |
| 6 | Handles corrupted config file gracefully | Error resilience |
| 7 | Config path returns correct location | Path resolution |

**Coverage target: 100%**

#### 11.2.2 Client Factory (`test/unit/client-factory.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Uses `--token` flag when provided | Flag priority |
| 2 | Falls back to `T49_API_TOKEN` env var | Env var resolution |
| 3 | Falls back to config file token | Config resolution |
| 4 | Throws `AUTH_MISSING` when no token found | Error handling |
| 5 | Passes `--base-url` override to SDK | URL customization |
| 6 | Uses default base URL when none provided | Default behavior |
| 7 | Passes `maxRetries` from config | Config propagation |
| 8 | Sets `defaultFormat` from flag/env/config | Format resolution |

**Coverage target: 100%**

#### 11.2.3 Error Mapping (`test/unit/errors.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Maps `AuthenticationError` → exit 3, code `AUTH_INVALID` | Error mapping |
| 2 | Maps `AuthorizationError` → exit 4, code `FORBIDDEN` | Error mapping |
| 3 | Maps `FeatureNotEnabledError` → exit 4, code `FEATURE_NOT_ENABLED` | Error mapping |
| 4 | Maps `NotFoundError` → exit 5, code `NOT_FOUND` | Error mapping |
| 5 | Maps `ValidationError` → exit 6, code `VALIDATION_ERROR` | Error mapping |
| 6 | Maps `RateLimitError` → exit 7, code `RATE_LIMITED` | Error mapping |
| 7 | Maps `UpstreamError` → exit 8, code `UPSTREAM_ERROR` | Error mapping |
| 8 | Maps generic `Terminal49Error` → exit 1, code `UNKNOWN` | Fallback |
| 9 | Maps non-SDK error → exit 1, code `UNKNOWN` | Unexpected errors |
| 10 | Maps network/fetch error → exit 9, code `NETWORK_ERROR` | Network failures |
| 11 | Formats human-readable error with hint | Human output |
| 12 | Formats JSON error envelope | JSON output |

**Coverage target: 100%**

#### 11.2.4 Output — JSON Formatter (`test/unit/output/json.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Wraps success data in `{ok: true}` envelope | Envelope structure |
| 2 | Wraps error in `{ok: false}` envelope | Error envelope |
| 3 | Includes command name in envelope | Command tracking |
| 4 | Includes pagination when present | Pagination metadata |
| 5 | Includes meta/duration when present | Performance metadata |
| 6 | `--compact` removes whitespace | Token efficiency |
| 7 | Pretty-prints by default when not compact | Readability |

**Coverage target: 100%**

#### 11.2.5 Output — Table Formatter (`test/unit/output/table.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Renders container list as table with correct columns | Column mapping |
| 2 | Renders shipment list as table | Resource-specific columns |
| 3 | Renders tracking request list as table | Resource-specific columns |
| 4 | Handles empty list gracefully | Edge case |
| 5 | Truncates long values in columns | Display limits |
| 6 | Respects `NO_COLOR` | Color compliance |

**Coverage target: 100%**

#### 11.2.6 Output — Fields Projection (`test/unit/output/fields.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Projects single field from object | Basic projection |
| 2 | Projects multiple fields | Multi-field |
| 3 | Projects nested field with dot notation | Nested access |
| 4 | Returns undefined for missing field | Missing field handling |
| 5 | Projects fields from array items | Array projection |

**Coverage target: 100%**

#### 11.2.7 Output — Formatter Dispatcher (`test/unit/output/formatter.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Selects JSON when `--json` flag set | Explicit JSON |
| 2 | Selects table when `--table` flag set | Explicit table |
| 3 | Auto-selects JSON when stdout is not TTY | TTY detection |
| 4 | Auto-selects table when stdout is TTY | TTY detection |
| 5 | `--quiet` suppresses non-data output | Quiet mode |
| 6 | `--verbose` adds diagnostics to stderr | Verbose mode |
| 7 | Applies `--fields` projection before output | Field filtering |
| 8 | `--raw` outputs raw JSON:API document | Raw mode |

**Coverage target: 100%**

#### 11.2.8 Commands — Containers (`test/unit/commands/containers.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `get` calls `client.containers.get(id)` with correct args | SDK delegation |
| 2 | `get --include` passes custom includes | Include override |
| 3 | `list` calls `client.containers.list()` with no filters | Default list |
| 4 | `list --status` passes status filter | Filter mapping |
| 5 | `list --port` passes port filter | Filter mapping |
| 6 | `list --carrier` passes carrier filter | Filter mapping |
| 7 | `list --updated-after` passes date filter | Filter mapping |
| 8 | `list --page --page-size` passes pagination | Pagination mapping |
| 9 | `events` calls `client.containers.events(id)` | SDK delegation |
| 10 | `route` calls `client.containers.route(id)` | SDK delegation |
| 11 | `raw-events` calls `client.containers.rawEvents(id)` | SDK delegation |
| 12 | `refresh` calls `client.containers.refresh(id)` | SDK delegation |
| 13 | `demurrage` calls `client.getDemurrage(id)` | SDK delegation |
| 14 | `rail` calls `client.getRailMilestones(id)` | SDK delegation |
| 15 | Missing `<id>` on `get` exits with code 2 | Usage validation |

**Coverage target: 95%+**

#### 11.2.9 Commands — Shipments (`test/unit/commands/shipments.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `get` calls `client.shipments.get(id, true)` | SDK delegation |
| 2 | `get --no-containers` calls with `false` | Flag negation |
| 3 | `list` with all filter combinations | Filter mapping |
| 4 | `list --page --page-size` | Pagination |
| 5 | `update --attrs '{...}'` calls `client.shipments.update` | Update delegation |
| 6 | `update` with invalid JSON attrs exits 2 | Input validation |
| 7 | `stop-tracking` calls `client.shipments.stopTracking` | SDK delegation |
| 8 | `resume-tracking` calls `client.shipments.resumeTracking` | SDK delegation |
| 9 | Missing `<id>` exits 2 | Usage validation |

**Coverage target: 95%+**

#### 11.2.10 Commands — Tracking Requests (`test/unit/commands/tracking-requests.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `list` calls `client.trackingRequests.list()` | SDK delegation |
| 2 | `list --page --page-size` | Pagination |
| 3 | `get <id>` calls `client.trackingRequests.get(id)` | SDK delegation |
| 4 | `create --type --number --scac` | Creation args |
| 5 | `create` missing `--type` exits 2 | Validation |
| 6 | `create` missing `--number` exits 2 | Validation |
| 7 | `update <id> --attrs '{...}'` | Update delegation |
| 8 | `infer <number>` calls `client.trackingRequests.inferNumber` | SDK delegation |

**Coverage target: 95%+**

#### 11.2.11 Commands — Track (Smart) (`test/unit/commands/track.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `track <number>` calls `createFromInfer` | Auto-detect flow |
| 2 | `track <number> --scac` overrides carrier | SCAC override |
| 3 | `track <number> --type` overrides type | Type override |
| 4 | `track <number> --ref A --ref B` passes refs | Multi-value flag |
| 5 | `track` with no number exits 2 | Usage validation |
| 6 | Handles `ValidationError` from infer gracefully | Error propagation |

**Coverage target: 95%+**

#### 11.2.12 Commands — Shipping Lines (`test/unit/commands/shipping-lines.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `list` calls `client.shippingLines.list()` | SDK delegation |
| 2 | `list --search term` passes search param | Search filter |

**Coverage target: 100%**

#### 11.2.13 Commands — Search (`test/unit/commands/search.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `search <query>` calls `client.search(query)` | SDK delegation |
| 2 | Missing `<query>` exits 2 | Usage validation |

**Coverage target: 100%**

#### 11.2.14 Commands — Config (`test/unit/commands/config.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `config set token <val>` writes token | Token persistence |
| 2 | `config get token` reads token | Token retrieval |
| 3 | `config list` shows all config | Full listing |
| 4 | `config path` prints file path | Path display |
| 5 | `config set base-url <url>` writes URL | URL persistence |
| 6 | `config set` with unknown key warns | Unknown key handling |

**Coverage target: 100%**

#### 11.2.15 Commands — Discovery (`test/unit/commands/commands.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `commands` lists all available commands | Completeness |
| 2 | `commands --json` returns structured JSON | Machine-readable |
| 3 | Each command has name, syntax, args, flags, description | Schema validation |

**Coverage target: 100%**

#### 11.2.16 Util — Pagination (`test/unit/util/pagination.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Iterates all pages when `--all` specified | Multi-page iteration |
| 2 | Stops when `links.next` is null | Termination |
| 3 | Emits NDJSON (one JSON per line) | Stream format |
| 4 | Handles empty first page | Edge case |

**Coverage target: 100%**

#### 11.2.17 Util — TTY (`test/unit/util/tty.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | Detects TTY when `process.stdout.isTTY` is true | TTY detection |
| 2 | Detects non-TTY when piped | Pipe detection |
| 3 | Respects `NO_COLOR` env var | Color compliance |
| 4 | Respects `FORCE_COLOR` env var | Color override |

**Coverage target: 100%**

### 11.3 Integration Tests — Detailed Breakdown

Integration tests spawn the actual CLI binary and assert on stdout, stderr, and exit code.

#### 11.3.1 CLI Process Execution (`test/integration/cli-exec.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `t49 --version` prints version and exits 0 | Basic execution |
| 2 | `t49 --help` prints help text and exits 0 | Help output |
| 3 | `t49 unknown-command` exits 2 with error | Unknown command |
| 4 | `t49 containers get` (no id) exits 2 | Missing required arg |
| 5 | `t49 containers list --json` (no token) exits 3 | Auth error |
| 6 | `t49 config path` prints a file path | Config path |

**Coverage target: 100%**

#### 11.3.2 Commands with Mocked API (`test/integration/containers.integration.test.ts`)

Uses a local HTTP mock server (e.g. `msw` or `nock`) to simulate API responses.

| # | Test Case | Validates |
|---|---|---|
| 1 | `containers list --json` returns JSON envelope with items | Full flow |
| 2 | `containers get <id> --json` returns single container | Get flow |
| 3 | `containers list --table` renders a table | Table rendering |
| 4 | `containers events <id> --json` returns events | Events flow |
| 5 | `containers list --json --fields number,status` projects fields | Field projection |
| 6 | `containers list --json --compact` outputs minified JSON | Compact mode |
| 7 | API returns 404 → exit 5 with `NOT_FOUND` error | Error mapping |
| 8 | API returns 429 → exit 7 with `RATE_LIMITED` error | Rate limit |
| 9 | API returns 500 → exit 8 with `UPSTREAM_ERROR` error | Server error |

**Coverage target: 90%+**

#### 11.3.3 Shipments Integration (`test/integration/shipments.integration.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `shipments list --json` with filters | Filter passthrough |
| 2 | `shipments get <id> --json` | Get flow |
| 3 | `shipments update <id> --attrs '...' --json` | Update flow |
| 4 | `shipments stop-tracking <id>` | Stop tracking flow |
| 5 | `shipments resume-tracking <id>` | Resume tracking flow |

**Coverage target: 90%+**

#### 11.3.4 Tracking Requests Integration (`test/integration/tracking-requests.integration.test.ts`)

| # | Test Case | Validates |
|---|---|---|
| 1 | `tracking-requests create --type container --number X --scac Y` | Create flow |
| 2 | `tracking-requests infer <number> --json` | Infer flow |
| 3 | `track <number> --json` end-to-end | Smart track flow |
| 4 | `tracking-requests list --page 1 --page-size 5` | Paginated list |

**Coverage target: 90%+**

### 11.4 E2E / Smoke Tests (`test/e2e/smoke.test.ts`)

Runs against the live Terminal49 API. Requires `T49_API_TOKEN`. Gated in CI behind a flag.

| # | Test Case | Validates |
|---|---|---|
| 1 | `t49 containers list --json --page-size 1` returns valid JSON | Live API |
| 2 | `t49 shipments list --json --page-size 1` returns valid JSON | Live API |
| 3 | `t49 shipping-lines list --json` returns list | Live API |
| 4 | `t49 search "test" --json` returns results | Live API |
| 5 | `t49 tracking-requests list --json --page-size 1` returns valid JSON | Live API |

**Coverage: Not tracked (live API)**

### 11.5 Coverage Targets & Tracking

| Layer | Target | Measured By |
|---|---|---|
| **Unit tests** | ≥ 90% lines, ≥ 85% branches | `vitest --coverage` |
| **Integration tests** | ≥ 80% lines | `vitest --coverage` with integration suite |
| **Combined** | ≥ 90% lines, ≥ 85% branches | Merged coverage report |
| **Error paths** | 100% | Manual audit of error mapping module |
| **Command registration** | 100% | Every SDK method has a corresponding CLI command |

### 11.6 Coverage Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: ['dist/**', 'test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'bin/**'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
        statements: 90,
      },
    },
  },
});
```

### 11.7 Coverage Tracking in CI

```yaml
# .github/workflows/test-cli.yml
- name: Run tests with coverage
  run: npx vitest run --coverage
- name: Check coverage thresholds
  run: npx vitest run --coverage --reporter=json
  # Fails CI if below thresholds defined in vitest.config.ts
- name: Upload coverage to Codecov (optional)
  uses: codecov/codecov-action@v4
  with:
    file: coverage/lcov.info
    flags: cli
```

### 11.8 Test Execution Commands

```bash
# All unit tests
npm test

# Unit tests with coverage
npm run test:coverage

# Integration tests only
npm run test:integration

# E2E smoke tests (requires T49_API_TOKEN)
npm run test:e2e

# Watch mode during development
npm run test:watch

# Single command test
npx vitest run test/unit/commands/containers.test.ts
```

### 11.9 Test Dependencies

```json
{
  "devDependencies": {
    "vitest": "^4.0.13",
    "@vitest/coverage-v8": "^4.0.18",
    "msw": "^2.7.0",
    "execa": "^9.5.0"
  }
}
```

- **msw** (Mock Service Worker): Intercepts HTTP requests at the network level for integration tests. No changes to SDK code needed.
- **execa**: Spawns CLI process for integration tests, captures stdout/stderr/exitCode.

### 11.10 Total Test Count Summary

| Category | Test Count |
|---|---|
| Unit — Config | 7 |
| Unit — Client Factory | 8 |
| Unit — Errors | 12 |
| Unit — Output (JSON) | 7 |
| Unit — Output (Table) | 6 |
| Unit — Output (Fields) | 5 |
| Unit — Output (Formatter) | 8 |
| Unit — Cmd: Containers | 15 |
| Unit — Cmd: Shipments | 9 |
| Unit — Cmd: Tracking Requests | 8 |
| Unit — Cmd: Track | 6 |
| Unit — Cmd: Shipping Lines | 2 |
| Unit — Cmd: Search | 2 |
| Unit — Cmd: Config | 6 |
| Unit — Cmd: Commands | 3 |
| Unit — Util: Pagination | 4 |
| Unit — Util: TTY | 4 |
| **Unit Total** | **~112** |
| Integration — CLI Exec | 6 |
| Integration — Containers | 9 |
| Integration — Shipments | 5 |
| Integration — Tracking Requests | 4 |
| **Integration Total** | **~24** |
| E2E — Smoke | 5 |
| **Grand Total** | **~141** |

---

## Appendix A: CLI Best Practices Checklist

Based on [Node.js CLI Apps Best Practices](https://github.com/lirantal/nodejs-cli-apps-best-practices):

- [x] Respect POSIX args conventions
- [x] Provide `--help` and `--version`
- [x] Use `stdout` for data, `stderr` for messages
- [x] Provide exit codes per POSIX conventions
- [x] Respect `NO_COLOR` and `FORCE_COLOR`
- [x] Graceful shutdown on SIGINT/SIGTERM
- [x] Zero-config with env vars
- [x] Stateful config for API tokens
- [x] Actionable error messages with hints
- [x] Shell completions (bash, zsh, fish)
- [x] Machine-readable output (`--json`)
- [x] Non-interactive by default (critical for LLM agents)
- [x] Composable with pipes
- [x] Installable via npx / npm global

## Appendix B: LLM Agent Integration Examples

### Example: OpenAI Function Calling Tool Definition

```json
{
  "type": "function",
  "function": {
    "name": "terminal49_cli",
    "description": "Query Terminal49 container tracking API via CLI",
    "parameters": {
      "type": "object",
      "properties": {
        "command": {
          "type": "string",
          "description": "Full t49 command, e.g. 'containers list --status active --json --compact'"
        }
      },
      "required": ["command"]
    }
  }
}
```

### Example: Claude MCP Tool

```json
{
  "name": "t49",
  "description": "Terminal49 container tracking CLI. Use 't49 commands --json' to discover all available commands.",
  "input_schema": {
    "type": "object",
    "properties": {
      "args": {
        "type": "array",
        "items": {"type": "string"},
        "description": "CLI arguments, e.g. ['containers', 'list', '--status', 'active', '--json']"
      }
    }
  }
}
```

### Example: Agent Workflow

```bash
# Step 1: Agent discovers available commands
t49 commands --json

# Step 2: Agent tracks a container
t49 track MSCU1234567 --json --compact

# Step 3: Agent checks container status
t49 containers get abc-123 --json --compact --fields number,status,location

# Step 4: Agent lists all active shipments
t49 shipments list --status active --json --compact --fields id,billOfLading,shippingLineScac
```
