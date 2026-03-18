# Terminal49 CLI GA Plan: Full SDK Parity + Dual Auth (API Token + MCP OAuth)

## Summary

Build `@terminal49/cli` as a production-grade CLI for humans and agents with:

1. Full command parity with the TypeScript SDK.
2. Dual auth modes: API token and OAuth using the same auth flow as hosted MCP.
3. Enforced coverage gate of 90/90/85 (lines/functions/statements at 90, branches at 85).
4. Deterministic machine output plus high-quality human UX.

## Current State Evaluation

1. CLI package exists but is scaffold-only; core modules and all command files are TODO stubs.
2. CLI has zero tests; `npm test` exits with "No test files found."
3. CLI build/type-check currently fail because workspace dependencies are not installed/resolved and lock metadata does not include the new CLI workspace.
4. SDK auth is token-centric and does not cleanly model OAuth bearer tokens for REST-first execution.
5. MCP package has working tests and auth guardrails, but OAuth is not implemented in this repo's server path today.
6. Docs currently state "OAuth not required" while linking to missing OAuth docs, so auth documentation is inconsistent.
7. CI has SDK and MCP jobs but no CLI job.

## Public API / Interface Changes

1. Extend `@terminal49/sdk` config to support explicit auth scheme without breaking `apiToken` callers.
2. Add CLI auth command group and auth-related global options.
3. Define and version the machine-readable command discovery schema returned by `t49 commands --json`.
4. Add CLI config schema versioning to allow safe upgrades.

## Decisions Locked

1. OAuth model: Shared OAuth flow aligned with MCP auth flow.
2. Execution backend in OAuth mode: REST SDK first.
3. Coverage gate: 90/90/85.
4. Token storage default: plain config file.
5. V1 scope: full SDK parity.

## Implementation Plan

### Phase 0: Workspace and Packaging Baseline

1. Wire CLI workspace dependency installation into root lockfile and CI install path.
2. Add missing CLI `README.md` (required by current `files` list in package manifest).
3. Ensure root-level `npm ci` yields resolvable `commander`, `chalk`, and `cli-table3` for CLI workspace.
4. Add workspace scripts for CLI build/test/lint consistency.

### Phase 1: SDK Auth Extension for OAuth Compatibility

1. Update SDK auth construction in `sdks/typescript-sdk/src/client.ts` to accept explicit auth scheme (`Token` or `Bearer`) while preserving existing `apiToken` behavior.
2. Add/adjust exported config types in SDK index/types for backward-compatible migration.
3. Add SDK tests for:
   1. Legacy token path still emits `Authorization: Token ...`.
   2. Explicit bearer path emits `Authorization: Bearer ...`.
   3. Prefixed token passthrough and invalid config behavior.

### Phase 2: CLI Auth Subsystem (API Token + OAuth)

1. Implement config persistence in `sdks/typescript-sdk-cli/src/config.ts` with schema version and file mode hardening (`0600`).
2. Add auth resolver in `sdks/typescript-sdk-cli/src/client-factory.ts` with deterministic precedence:
   1. Explicit CLI flags.
   2. Environment variables.
   3. Stored OAuth session (with refresh).
   4. Stored API token.
3. Implement OAuth login/logout/status commands in `sdks/typescript-sdk-cli/src/commands/config.ts` or dedicated `src/commands/auth.ts` and register from `src/index.ts`.
4. OAuth flow implementation:
   1. Use MCP SDK OAuth client primitives (PKCE auth code flow).
   2. Discover metadata from MCP server URL.
   3. Store tokens and token metadata in CLI config.
   4. Refresh access token on expiry before REST calls.
   5. On scope mismatch/401 in OAuth mode, emit deterministic auth error with remediation.
5. Add non-interactive behavior:
   1. `--json` mode never prompts.
   2. Missing OAuth session in non-interactive context exits with usage/auth error and next-step hint.

### Phase 3: Command Surface (Full SDK Parity)

1. Implement and register all planned commands:
   1. `shipments`: `get`, `list`, `update`, `stop-tracking`, `resume-tracking`.
   2. `containers`: `get`, `list`, `events`, `route`, `raw-events`, `refresh`, `demurrage`, `rail`.
   3. `tracking-requests`: `list`, `get`, `create`, `update`, `infer`.
   4. `track`.
   5. `shipping-lines list`.
   6. `search`.
   7. `config` and `commands`.
2. Implement argument validation/mapping with strict, predictable usage errors.
3. Keep command layer thin; push API semantics to SDK.

### Phase 4: Output, Error Model, and Agent UX

1. Implement JSON/table dispatch in `sdks/typescript-sdk-cli/src/output/formatter.ts` with TTY-aware defaults.
2. Implement JSON envelope in `sdks/typescript-sdk-cli/src/output/json.ts` for both success and errors.
3. Implement field projection and compact output in `sdks/typescript-sdk-cli/src/output/fields.ts`.
4. Implement table rendering by resource in `sdks/typescript-sdk-cli/src/output/table.ts`.
5. Implement stable error mapping and exit codes in `sdks/typescript-sdk-cli/src/errors.ts`, including OAuth-specific failures.

### Phase 5: High-Coverage Test Suite

1. Unit tests for auth/config/output/error utilities with exhaustive branches.
2. Unit tests for each command module validating:
   1. flag parsing.
   2. argument validation.
   3. SDK call mapping.
   4. output envelope shape.
   5. error translation.
3. Integration tests using `execa` for real process behavior:
   1. exit codes.
   2. stdout/stderr boundaries.
   3. JSON determinism.
   4. TTY/non-TTY mode.
   5. OAuth missing-session and token-refresh behavior.
4. Contract tests for `t49 commands --json` schema stability.
5. Optional live smoke tests behind env guard for token and OAuth modes.

### Phase 6: CI, Docs, and Release Readiness

1. Add dedicated CLI job to `.github/workflows/ci.yml` with build, lint, tests, and coverage threshold enforcement.
2. Ensure coverage fails CI below 90/90/85.
3. Add user docs for:
   1. API token auth.
   2. OAuth login flow.
   3. agent usage patterns.
   4. non-interactive mode.
4. Fix/remove broken OAuth doc links until corresponding docs are added.

## Test Cases and Scenarios (Must-Have)

1. Auth precedence matrix across flags/env/config/oauth-session.
2. OAuth login success, callback timeout, denied consent, invalid state, refresh success, refresh failure.
3. SDK auth header emission for token and bearer paths.
4. Every command happy path plus representative API failures (401/403/404/422/429/5xx/network).
5. Output compatibility:
   1. JSON envelope schema.
   2. `--compact`.
   3. `--fields` nested projection.
   4. table output for TTY.
6. Agent determinism:
   1. no ANSI in JSON mode.
   2. no prompts in non-interactive runs.
   3. stable error codes/messages.
7. Pagination and polling edge cases where implemented.

## Acceptance Criteria

1. `npm run build --workspace @terminal49/cli` passes on clean checkout.
2. `npm run test:coverage --workspace @terminal49/cli` passes with 90/90/85 minimums.
3. All planned commands are implemented and registered.
4. Both auth modes work end-to-end:
   1. API token mode.
   2. OAuth mode with token refresh and REST execution.
5. CI includes CLI checks and blocks merges on failures.
6. Command discovery JSON is versioned and contract-tested.

## Assumptions and Defaults

1. OAuth piggyback means reusing the same OAuth provider/discovery model as hosted MCP, not scraping Claude/Cursor local caches.
2. OAuth tokens issued by that flow are valid for REST SDK calls with `Bearer` auth; if not, CLI will fail with explicit scope remediation.
3. Plain config-file token storage is accepted for V1 despite weaker security posture.
4. Full SDK parity is required for GA, not a reduced MVP command set.
5. Node runtime target remains compatible with current repo toolchain and workspace CI matrix.
