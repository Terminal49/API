# Terminal49 CLI — Merged Implementation Plan

## Context

Two plans exist: **PLAN-v2** (my prior plan) and **CLI_GA_PLAN** (other agent). Both target the same goal — production-grade CLI for humans and agents — but differ on scope, auth strategy, and phase ordering. This document merges the best of both after detailed comparison.

---

## Plan Comparison Summary

| Dimension | PLAN-v2 | CLI_GA_PLAN | Merged |
|-----------|---------|-------------|--------|
| **API coverage** | All 39 endpoints (17 command groups) | ~20 endpoints (7 command groups, SDK parity only) | All 39 endpoints |
| **Auth** | Token-only (per user decision) | Dual: token + OAuth PKCE | Token-only now, SDK prepped for Bearer |
| **SDK extension** | Explicit plan to add 10 new namespaces | Not addressed — CLI only wraps existing SDK | Extend SDK |
| **Phase ordering** | Infra → commands → SDK extension → agent features | Workspace → SDK auth → OAuth → commands → output → tests | Workspace fix → infra+output → commands → SDK extension → agent features |
| **Output/errors before commands?** | Yes (Phase 1a) | No (Phase 4, after commands) | Yes — commands depend on formatters |
| **Tests alongside code?** | Yes (co-located per phase) | No (separate Phase 5) | Yes |
| **Workspace/CI fix** | Mentioned dependency change only | Explicit Phase 0 with lockfile + CI | Phase 0 included |
| **Config hardening** | XDG + atomic writes | Schema versioning + `0600` permissions | All of the above |
| **`commands --json` contract** | Listed as a command | Schema versioning + contract testing | Contract tested |

### What CLI_GA_PLAN gets right that PLAN-v2 missed

1. **Phase 0: Workspace baseline** — root `package.json` has `"workspaces": ["packages/*", "sdks/*"]` so `sdks/typescript-sdk-cli` IS included, but CI (`ci.yml`) has no CLI job and lockfile may not resolve CLI deps. Must fix before anything else.
2. **SDK `Token`/`Bearer` scheme** — `buildFetch()` in `sdks/typescript-sdk/src/client.ts:643` hardcodes `Token ${this.apiToken}`. Even without OAuth, supporting explicit `Bearer` prepares for future auth modes and is a small, backward-compatible change.
3. **Config file `0600` permissions** — tokens stored in plaintext need restricted file perms.
4. **Config schema versioning** — `{ "version": 1, ... }` allows safe future migrations.
5. **Non-interactive enforcement** — `--json` mode should never prompt; missing auth in non-interactive context exits with hint.
6. **Current state evaluation** — build/type-check currently fail, zero tests, no CI job.

### What PLAN-v2 gets right that CLI_GA_PLAN missed

1. **Full 39-endpoint coverage** — CLI_GA_PLAN only covers ~20 endpoints (existing SDK methods). Missing: webhooks, webhook-notifications, vessels, ports, terminals, parties, metro-areas, custom-fields (3 groups), containers.mapGeojson, entity-scoped custom fields.
2. **SDK extension strategy** — 10 new namespaces with exact method signatures, following existing `execute()` patterns.
3. **Correct dependency ordering** — output/errors BEFORE commands (commands call `formatter.output()` and `withErrorHandling()`).
4. **Concrete command pattern** — code template showing every command follows `registerXxxCommand()` → `withErrorHandling()` → `createClient()` → `createFormatter()` → `formatter.output()`.
5. **Agent features** — `--all` (NDJSON pagination), `--poll`, shell completions.
6. **Composed commands** — `demurrage`, `rail`, `map` (not just raw API wrappers).

### Where CLI_GA_PLAN is wrong

1. **Phase ordering**: Output/errors in Phase 4, AFTER commands in Phase 3. Commands can't be implemented without the formatter and error handler.
2. **Tests as separate phase**: Phase 5 is "High-Coverage Test Suite." Tests should accompany implementation, not come after. Otherwise you build everything, then discover bugs.
3. **OAuth scope**: User explicitly chose "Token-only for now." GA plan treats OAuth as in-scope for V1, which contradicts the user's direction.
4. **Coverage claim**: Says "Full SDK parity" but the SDK only covers ~20 of 39 endpoints. True full coverage requires extending the SDK.

---

## Merged Implementation Plan

### Phase 0: Workspace & CI Baseline

Fixes build/install before any code is written.

| Task | File |
|------|------|
| Ensure `npm ci` at root resolves CLI workspace deps | `package-lock.json` (regenerate) |
| Add CLI job to CI workflow | `.github/workflows/ci.yml` |
| Add placeholder `README.md` (required by `files` in package.json) | `sdks/typescript-sdk-cli/README.md` |
| Change SDK dependency to workspace reference | `sdks/typescript-sdk-cli/package.json`: `"@terminal49/sdk": "workspace:*"` |
| Verify `npm run build --workspace @terminal49/cli` passes | — |

### Phase 1: Foundation (Infrastructure + Core Commands + Tests)

Infrastructure first, then the two most-used command groups, with tests alongside.

**1a. SDK auth prep** (small, backward-compatible)

Add optional `authScheme` to `Terminal49ClientConfig` in `sdks/typescript-sdk/src/client.ts`:
```typescript
export interface Terminal49ClientConfig {
  apiToken: string;
  authScheme?: 'Token' | 'Bearer';  // NEW — defaults to 'Token' for backward compat
  // ...existing fields
}
```
Update `buildFetch()` (line 643) to use `this.authScheme ?? 'Token'`. Existing callers are unaffected.

**1b. CLI infrastructure modules**

| File | What |
|------|------|
| `src/util/tty.ts` | TTY detection, `NO_COLOR`/`FORCE_COLOR` |
| `src/config.ts` | XDG-compliant config with schema versioning `{"version":1,...}`, `0600` file perms, atomic writes |
| `src/client-factory.ts` | Token resolution: flag → env → config → error. Creates `Terminal49Client`. Non-interactive enforcement. |
| `src/errors.ts` | SDK error → CLI error mapping, exit codes 0-9, `withErrorHandling()` wrapper |
| `src/output/fields.ts` | `--fields` projection with dot-notation |
| `src/output/json.ts` | JSON envelope `{ok, command, data, pagination?, meta?}`, `--compact`, no ANSI in JSON mode |
| `src/output/table.ts` | Table renderer via `cli-table3`, resource-specific column defs |
| `src/output/formatter.ts` | Dispatcher: selects json/table from flags+TTY, applies fields projection |

**1c. Core commands**

| File | Commands | SDK Methods |
|------|----------|-------------|
| `src/commands/config.ts` | `set`, `get`, `list`, `path` | None (pure config) |
| `src/commands/containers.ts` | `get`, `list`, `events`, `route`, `raw-events`, `refresh`, `demurrage`, `rail` | `containers.*`, `getDemurrage`, `getRailMilestones` |
| `src/commands/shipments.ts` | `get`, `list`, `update`, `stop-tracking`, `resume-tracking` | `shipments.*` |
| `src/index.ts` | Register commands into Commander program | — |

**1d. Phase 1 tests**: ~80 unit + integration tests.

### Phase 2: Remaining Existing-SDK Commands + Tests

| File | Commands | SDK Methods |
|------|----------|-------------|
| `src/commands/tracking-requests.ts` | `list`, `get`, `create`, `update`, `infer` | `trackingRequests.*` |
| `src/commands/track.ts` | `<number> [--scac] [--type]` | `trackingRequests.createFromInfer` |
| `src/commands/shipping-lines.ts` | `list [--search]` | `shippingLines.list` |
| `src/commands/search.ts` | `<query>` | `client.search()` |
| `src/commands/commands.ts` | `[--json]` — versioned schema, contract-tested | Introspects Commander tree |

Tests: ~40 more tests, including contract test for `t49 commands --json` schema.

### Phase 3: SDK Extension + New CLI Commands + Tests

**3a. Extend SDK** (`sdks/typescript-sdk/src/client.ts`)

| Namespace | Methods | API Endpoints |
|-----------|---------|---------------|
| `webhooks` | `list`, `get`, `create`, `update`, `delete`, `getIps` | `/webhooks*`, `/webhooks/ips` |
| `webhookNotifications` | `list`, `get`, `getExamples` | `/webhook_notifications*` |
| `vessels` | `get`, `getByImo`, `futurePositions`, `futurePositionsWithCoords` | `/vessels/{id}*` |
| `ports` | `get` | `/ports/{id}` |
| `terminals` | `get` | `/terminals/{id}` |
| `parties` | `list`, `get` | `/parties*` |
| `metroAreas` | `get` | `/metro_areas/{id}` |
| `customFieldDefinitions` | `list`, `get`, `create`, `update`, `delete` | `/custom_field_definitions*` |
| `customFieldOptions` | `list`, `get`, `create`, `update`, `delete` | `/custom_field_definitions/{id}/options*` |
| `customFields` | `list`, `get`, `create`, `update`, `delete` | `/custom_fields*` |

Also: `containers.mapGeojson(id)`, entity-scoped custom fields on `shipments`/`containers`.

**3b. New CLI command files**

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

Update `containers.ts` with `map`, `custom-fields`, `set-custom-field`. Update `shipments.ts` similarly.

Tests: ~80 more (SDK unit tests + CLI unit + integration).

### Phase 4: Agent & Scale Features

| Feature | File |
|---------|------|
| `--all` pagination with NDJSON streaming | `src/util/pagination.ts` |
| `--poll` support with `--interval` / `--until` | `src/util/polling.ts` |
| Shell completions (bash/zsh/fish) | `src/commands/completions.ts` |

### Phase 5: Distribution & Polish

| Feature | Details |
|---------|---------|
| README | Usage examples for humans + LLM agents |
| CI enforcement | Coverage fails below 90/90/85 (lines/functions at 90, branches at 85) |
| npx support | Verify `npx @terminal49/cli containers list` works |
| Docker image | Optional: `ghcr.io/terminal49/cli` |

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

## Auth Strategy

Token-only for now (per user decision). OAuth deferred until Terminal49 ships an authorization server.

**Token resolution order:**
1. `--token <value>` flag
2. `T49_API_TOKEN` env var
3. `~/.config/terminal49/config.json` → `token`
4. Error with actionable message + next-step hint

**SDK prep**: Add optional `authScheme: 'Token' | 'Bearer'` to `Terminal49ClientConfig` (defaults to `'Token'`, backward-compatible). This is a small change that future-proofs the SDK for OAuth without implementing it.

**Non-interactive enforcement**: `--json` mode never prompts. Missing auth in non-interactive context exits with code 3 and hint.

---

## Verification Plan

1. **Unit tests**: `npm test` — ~200+ tests covering all modules
2. **Integration tests**: `npm run test:integration` — spawn CLI binary with mocked HTTP (msw)
3. **E2E smoke**: `npm run test:e2e` — live API with `T49_API_TOKEN`
4. **Contract test**: `t49 commands --json` output matches versioned schema
5. **Coverage**: `npm run test:coverage` — enforce 90/90/85
6. **Lint**: `npm run lint` — biome check
7. **CI**: CLI job in `.github/workflows/ci.yml` blocks merge on failure

---

## Critical Files

| File | Why |
|------|-----|
| `sdks/typescript-sdk/src/client.ts` | SDK client — add `authScheme` + 10 new namespaces for ~19 missing endpoints |
| `sdks/typescript-sdk-cli/src/errors.ts` | Every command depends on `withErrorHandling()` |
| `sdks/typescript-sdk-cli/src/output/formatter.ts` | Every command depends on the output dispatcher |
| `sdks/typescript-sdk-cli/src/client-factory.ts` | Every command needs an authenticated SDK client |
| `sdks/typescript-sdk-cli/src/index.ts` | All commands registered here |
| `sdks/typescript-sdk-cli/package.json` | SDK dependency → `workspace:*` |
| `.github/workflows/ci.yml` | Add CLI job |
| `package-lock.json` | Must be regenerated to include CLI workspace |
