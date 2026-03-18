# Terminal49 CLI — Implementation Plan

## Context

The CLI at `sdks/typescript-sdk-cli/` has been scaffolded (19 stub files, all empty TODOs) with a detailed PLAN.md spec. The TypeScript SDK at `sdks/typescript-sdk/src/client.ts` is mature, covering ~20 of 39 API endpoints. The MCP server at `packages/mcp/` uses token auth only today; OAuth is planned but unbuilt. The goal is a high-quality CLI with full API coverage, dual auth (token + OAuth), usable by both humans and LLM agents.

## Key Architectural Decisions

### 1. SDK-First: Extend the SDK, not the CLI
The CLI stays a thin presentation layer. Missing endpoint methods get added to `Terminal49Client` in the SDK, following existing `execute()` patterns. This keeps business logic in one place and makes new endpoints available to both CLI and MCP server.

### 2. Auth Strategy: Token-Only (OAuth Deferred)
Token auth only for now. OAuth (device code flow) deferred until Terminal49 ships an authorization server.

Token resolution order:
1. `--token <value>` flag
2. `T49_API_TOKEN` env var
3. `~/.config/terminal49/config.json` → `token`
4. Error with actionable message

### 3. Dependency: Use workspace SDK reference
Change `"@terminal49/sdk": "^0.1.0"` → `"@terminal49/sdk": "workspace:*"` (or `file:../typescript-sdk`) so CLI uses the local SDK with new methods during development.

---

## Phase 1: Foundation (Infrastructure + Core Commands)

### 1a. Infrastructure modules

| File | What |
|------|------|
| `src/util/tty.ts` | TTY detection, `NO_COLOR`/`FORCE_COLOR` support |
| `src/config.ts` | Read/write `~/.config/terminal49/config.json` (XDG-compliant, plain `node:fs`, atomic writes) |
| `src/client-factory.ts` | Token resolution chain → creates `Terminal49Client` |
| `src/errors.ts` | SDK error → CLI error mapping, exit codes 0-9, `withErrorHandling()` wrapper |
| `src/output/fields.ts` | `--fields` projection with dot-notation |
| `src/output/json.ts` | JSON envelope `{ok, command, data, pagination?, meta?}`, `--compact` |
| `src/output/table.ts` | Table renderer via `cli-table3`, resource-specific column defs |
| `src/output/formatter.ts` | Dispatcher: selects json/table from flags+TTY, applies fields projection |

### 1b. Core commands (use existing SDK methods)

| File | Commands | SDK Methods |
|------|----------|-------------|
| `src/commands/config.ts` | `set`, `get`, `list`, `path` | None (pure config) |
| `src/commands/containers.ts` | `get`, `list`, `events`, `route`, `raw-events`, `refresh`, `demurrage`, `rail` | `containers.*`, `getDemurrage`, `getRailMilestones` |
| `src/commands/shipments.ts` | `get`, `list`, `update`, `stop-tracking`, `resume-tracking` | `shipments.*` |
| `src/index.ts` | Register commands into Commander program | — |

### 1c. Tests
Unit tests for all modules + integration tests (spawn CLI binary, assert stdout/stderr/exit code). Target: ~80 tests.

---

## Phase 2: Remaining Existing-SDK Commands

| File | Commands | SDK Methods |
|------|----------|-------------|
| `src/commands/tracking-requests.ts` | `list`, `get`, `create`, `update`, `infer` | `trackingRequests.*` |
| `src/commands/track.ts` | `<number> [--scac] [--type]` | `trackingRequests.createFromInfer` |
| `src/commands/shipping-lines.ts` | `list [--search]` | `shippingLines.list` |
| `src/commands/search.ts` | `<query>` | `client.search()` |
| `src/commands/commands.ts` | `[--json]` — machine-readable command discovery | Introspects Commander tree |

Tests: ~40 more tests.

---

## Phase 3: SDK Extension + New CLI Commands

### 3a. Extend SDK (`sdks/typescript-sdk/src/client.ts`)

Add new resource namespaces following existing patterns:

| Namespace | Methods | API Endpoints |
|-----------|---------|---------------|
| `webhooks` | `list`, `get`, `create`, `update`, `delete`, `getIps` | `/webhooks`, `/webhooks/{id}`, `/webhooks/ips` |
| `webhookNotifications` | `list`, `get`, `getExamples` | `/webhook_notifications`, `/webhook_notifications/{id}`, `/webhook_notifications/examples` |
| `vessels` | `get`, `getByImo`, `futurePositions`, `futurePositionsWithCoords` | `/vessels/{id}`, `/vessels/{imo}`, `/vessels/{id}/future_positions*` |
| `ports` | `get` | `/ports/{id}` |
| `terminals` | `get` | `/terminals/{id}` |
| `parties` | `list`, `get` | `/parties`, `/parties/{id}` |
| `metroAreas` | `get` | `/metro_areas/{id}` |
| `customFieldDefinitions` | `list`, `get`, `create`, `update`, `delete` | `/custom_field_definitions*` |
| `customFieldOptions` | `list`, `get`, `create`, `update`, `delete` | `/custom_field_definitions/{id}/options*` |
| `customFields` | `list`, `get`, `create`, `update`, `delete` | `/custom_fields*` |

Also add: `containers.mapGeojson(id)` and entity-scoped custom fields on `shipments`/`containers`.

### 3b. New CLI command files

| File | Commands |
|------|----------|
| `src/commands/webhooks.ts` | `list`, `get`, `create`, `update`, `delete`, `ips` |
| `src/commands/webhook-notifications.ts` | `list`, `get`, `examples` |
| `src/commands/vessels.ts` | `get`, `get-by-imo`, `future-positions`, `future-positions-coords` |
| `src/commands/ports.ts` | `get <id-or-locode>` |
| `src/commands/terminals.ts` | `get <id>` |
| `src/commands/parties.ts` | `list`, `get` |
| `src/commands/metro-areas.ts` | `get <id-or-locode>` |
| `src/commands/custom-fields.ts` | `list`, `get`, `create`, `update`, `delete` |
| `src/commands/custom-field-definitions.ts` | `list`, `get`, `create`, `update`, `delete` |
| `src/commands/custom-field-options.ts` | `list <def-id>`, `get`, `create`, `update`, `delete` |

Update `containers.ts` and `shipments.ts` with `map`, `custom-fields`, `set-custom-field` subcommands.

Tests: ~80 more tests.

---

## Phase 4: Agent & Scale Features

| Feature | File |
|---------|------|
| `--all` pagination with NDJSON streaming | `src/util/pagination.ts` |
| `--poll` support with `--interval` / `--until` | `src/util/polling.ts` |
| Shell completions (bash/zsh/fish) | `src/commands/completions.ts` |

---

## Phase 5: Distribution & Polish

| Feature | File |
|---------|------|
| README with examples for humans + LLM agents | `README.md` |
| CI/CD (GitHub Actions: test, lint, build, publish to npm) | `.github/workflows/test-cli.yml` |
| npx support, Docker image | — |
| Final coverage audit (≥90% lines, ≥85% branches) | — |

---

## Full Command Surface (39 endpoints + composed commands)

```
t49 shipments list|get|update|stop-tracking|resume-tracking|custom-fields|set-custom-field
t49 containers list|get|events|route|raw-events|refresh|demurrage|rail|map|custom-fields|set-custom-field
t49 tracking-requests list|get|create|update|infer
t49 track <number>
t49 shipping-lines list
t49 webhooks list|get|create|update|delete|ips
t49 webhook-notifications list|get|examples
t49 vessels get|get-by-imo|future-positions|future-positions-coords
t49 ports get
t49 terminals get
t49 parties list|get
t49 metro-areas get
t49 custom-fields list|get|create|update|delete
t49 custom-field-definitions list|get|create|update|delete
t49 custom-field-options list|get|create|update|delete
t49 search <query>
t49 config set|get|list|path
t49 commands [--json]
```

---

## Command Pattern (all commands follow this)

```typescript
export function registerXxxCommand(program: Command): void {
  const cmd = program.command('xxx').description('...');
  cmd.command('get <id>')
    .option('--include <resources>')
    .action(withErrorHandling('xxx.get', async (id, opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const client = createClient(globalOpts);
      const formatter = createFormatter(globalOpts);
      const data = await client.xxx.get(id, { format: globalOpts.format });
      formatter.output('xxx.get', data);
    }));
}
```

---

## Verification Plan

1. **Unit tests**: `npm test` — ~200+ tests covering all modules
2. **Integration tests**: `npm run test:integration` — spawn CLI binary with mocked HTTP (msw)
3. **E2E smoke**: `npm run test:e2e` — live API with `T49_API_TOKEN`
4. **Manual verification**: Run each command group against live API
5. **Coverage**: `npm run test:coverage` — enforce ≥90% lines, ≥85% branches
6. **Lint**: `npm run lint` — biome check

---

## Critical Files

| File | Why |
|------|-----|
| `sdks/typescript-sdk/src/client.ts` | SDK client — must be extended for ~19 missing endpoints |
| `sdks/typescript-sdk-cli/src/errors.ts` | Every command depends on `withErrorHandling()` |
| `sdks/typescript-sdk-cli/src/output/formatter.ts` | Every command depends on the output dispatcher |
| `sdks/typescript-sdk-cli/src/client-factory.ts` | Every command needs an authenticated SDK client |
| `sdks/typescript-sdk-cli/src/index.ts` | All commands registered here |
| `sdks/typescript-sdk-cli/package.json` | SDK dependency must be changed to workspace reference |
