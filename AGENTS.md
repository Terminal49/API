# Terminal49 API Repository — Agent Instructions

> **This is a public repository.** Do not commit API keys, secrets, internal URLs, customer data, or any proprietary information. Use placeholders in all examples (e.g. `Token YOUR_API_KEY`).

This repo is **not docs-only**. It contains three things that ship independently:

1. **Documentation** (`docs/`) — the Mintlify site and the OpenAPI source of truth.
2. **The Terminal49 MCP server + OAuth gateway** (`api/`, `packages/mcp/`) — deployed to **mcp.terminal49.com** on Vercel.
3. **The Terminal49 TypeScript SDK** (`sdks/typescript-sdk/`) — published to npm as `@terminal49/sdk`.

It is an **npm workspaces monorepo** (`packages/*`, `sdks/*`), Node 24. Vite+ is the development toolchain and delegates package installation to npm. The root `package-lock.json` is the authoritative workspace lockfile; `vp install` (root) and Vercel both install from it.

> `CLAUDE.md` / `claude.md` are symlinks to this file. Edit `AGENTS.md` to change agent instructions.

For detailed docs writing standards, voice, and terminology, see [WRITING_GUIDE.md](WRITING_GUIDE.md) and [agent.md](agent.md).

---

For substantive documentation writing, use the repo-local skill at `skills/terminal49-docs-writing/SKILL.md`. It includes content-type-specific guides for tutorials, how-to guides, reference pages, concepts, webhook/event docs, SDK/MCP docs, DataSync/coverage docs, changelog/update posts, and navigation.

## Project Structure

### Documentation (`docs/`)
- `docs/` holds the Mintlify site content and configuration.
- `docs/api-docs/`, `docs/datasync/`, `docs/sdk/`, `docs/mcp/`, `docs/updates/` contain MDX pages grouped by product area.
- `docs/docs.json` defines navigation, branding, and tabs.
- `docs/openapi.json` is the source of truth for API reference content.
- `docs/images/` and `assets/images/` store images used by MDX pages.

### MCP gateway (`api/`) — Vercel serverless functions
- `api/mcp.ts` — the MCP endpoint (Streamable HTTP transport, stateless). Handles caller auth: WorkOS AuthKit token resolution, env-token + client-secret mode, and pass-through.
- `api/oauth-protected-resource.ts` — RFC 9728 Protected Resource Metadata (`/.well-known/oauth-protected-resource`).
- `vercel.json` — routes (`/mcp`, `/.well-known/*`), function config, install/build commands. This is what deploys to mcp.terminal49.com.
- These import the server from `packages/mcp/src/`.

### MCP server (`packages/mcp/`) — `@terminal49/mcp`
- `src/server.ts` — `createTerminal49McpServer()`, built on `@modelcontextprotocol/sdk` (`McpServer`, `registerTool`/`registerResource`). Used by both the stdio entry (`src/index.ts`) and the `api/` HTTP gateway.
- `src/resource.ts` — **single source of truth** for the OAuth `resource` identifier. Both the PRM endpoint and the `WWW-Authenticate` challenge resolve through it so they can never diverge (RFC 9728). Do not reintroduce per-file resource derivation.
- `src/tools/`, `src/resources/` — MCP tools and resources.
- `tests/`, `src/**/*.test.ts` — Vitest through Vite+.

### TypeScript SDK (`sdks/typescript-sdk/`) — `@terminal49/sdk`
- `src/` — the client (JSON:API, openapi-fetch). `src/generated/**` is generated — **do not hand-edit**.

---

## Scope

- **Docs** live in `docs/` (MDX, `docs/docs.json`, `docs/openapi.json`).
- **Code** in `api/`, `packages/mcp/`, and `sdks/typescript-sdk/` is editable, but it is **deployed, public-facing infrastructure** — run the tests and lint before considering a change done.
- **Do not hand-edit generated files** unless explicitly asked:
  - `Terminal49-API.postman_collection.json` (from `docs/openapi.json`)
  - `sdks/typescript-sdk/src/generated/**` (from `docs/openapi.json` via `openapi-typescript`)
  - `docs/sdk/reference/**` (generated SDK docs; CI checks they are up to date)

---

## Build and Development Commands

### Docs
- Preview locally: `cd docs && mintlify dev`
- Lint the OpenAPI spec: `spectral lint --ruleset .spectral.mjs docs/openapi.json`
- Regenerate Postman: `openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags`

### Code (npm workspaces)
- Install: `vp install` (root; use `npm ci` for frozen CI installs)
- Test: `npm run test --workspace @terminal49/mcp` · `npm run test --workspace @terminal49/sdk` (Vite+ / Vitest)
- Typecheck / build: `npm run build --workspace @terminal49/mcp` · `--workspace @terminal49/sdk` (tsc). `api/` is typechecked by the root config: `npx tsc --noEmit -p tsconfig.json`.
- **Lint/format: Vite+** (Oxlint + Oxfmt with vendored anti-slop rules). `npm run lint --workspace <pkg>`; auto-format with `npm run format --workspace <pkg>`; the `api/` gateway is covered by root `npm run lint:api` / `npm run format`. All configuration lives in the **root `vite.config.ts`** — Vite+ resolves only the root config in a monorepo, so do not add workspace-level `vite.config.ts` files (they are silently ignored). The vendored plugin is in `tools/oxlint/anti-slop/` (see its README for local modifications to re-apply when re-vendoring).
- **Toolchain version coupling** (root `package.json`): the `vite` override alias (`npm:@voidzero-dev/vite-plus-core`), the exact `vitest` pin, the `@vitest/coverage-v8` devDeps in workspaces, and `@oxlint/plugins` must all move in lockstep with the `vite-plus` version — do not bump any of them independently.
- CI (`.github/workflows/ci.yml`) runs build + test + lint for both packages.
- Running the MCP server locally + testing tool calls with Claude Desktop (stdio and gateway paths): [packages/mcp/LOCAL_DEV.md](packages/mcp/LOCAL_DEV.md). Gateway env template: `.env.local.example`.

---

## MCP Auth Gateway notes

- The gateway is an OAuth 2.1 **Resource Server**; **WorkOS** is the Authorization Server. Follow the MCP authorization spec (RFC 9728 / 8414 / 8707 / 6750).
- Token validation is delegated to the Terminal49 backend (`/connected-clients/resolve`); the backend must enforce the token audience. The gateway must not weaken the `WWW-Authenticate` challenge, the PRM document, or the resource resolver without checking the spec.
- Config is via env (`WORKOS_*`, `T49_MCP_*`). Never log tokens; return generic auth errors to clients and keep detail in server logs.
- The canonical connector URL and OAuth resource identifier is the **root origin** `https://mcp.terminal49.com` (pin `WORKOS_MCP_RESOURCE`); don't use the `/mcp` path in client config. Production/client setup (WorkOS dashboard, env vars, ChatGPT + Claude specifics) is in [packages/mcp/WORKOS_MCP_SETUP.md](packages/mcp/WORKOS_MCP_SETUP.md).

---

## Commit and Pull Request Guidelines

- Commit history favors conventional prefixes: `docs:`, `chore:`, `feat:`, `fix:`.
- Keep docs changes, gateway/SDK code changes, and tooling changes in **separate commits** so reviews stay focused.
- Do not manually edit generated files; update the source and regenerate.
- PRs: short summary, linked issue/ticket if available, screenshots for doc UI changes.

## Security

- Never commit real API keys or secrets; use placeholders like `Token YOUR_API_KEY`.
- The MCP gateway is public-facing — treat auth, the resource resolver, and the discovery endpoints as security-sensitive. Keep local credentials in your environment only.

---

## Cursor Cloud specific instructions

Standard commands live in **Build and Development Commands** above; the notes below are the non-obvious gotchas for this environment. The startup update script already runs `npm ci` at the repo root.

### Node version
- The repo requires **Node 24** (`engines: 24.x`, `.tool-versions` pins `24.4.1`). The VM's baseline `node` on `PATH` (`/exec-daemon/node`) is **v22**; a login-shell hook selects nvm's Node 24, so **run commands from a login shell** (fresh terminals get Node 24). If `node -v` shows v22, run `nvm use 24` first — building/testing on v22 is untested here.

### Products & how to run them (nothing here is a long-running backend — MCP/SDK are clients of the external Terminal49 API at `https://api.terminal49.com/v2`)
- **SDK** (`@terminal49/sdk`): unit tests are fixture-based and need no network/token (`npm run test --workspace @terminal49/sdk -- --run`). `smoke`/`example` scripts hit the live API and need `T49_API_TOKEN`.
- **MCP** (`@terminal49/mcp`): build then run the stdio server with `npm run mcp:stdio` (or `node packages/mcp/dist/index.js`). `initialize` + `tools/list` work **without** a token (see the quick-verification snippet in `packages/mcp/LOCAL_DEV.md`); a *successful* `tools/call` result needs a real `T49_API_TOKEN` (without one, tools return a generic Terminal49 error — the wiring still runs). The `api/` HTTP gateway (Path 2/3) additionally needs the Vercel CLI + a local backend and is optional.
- **Docs** (`docs/`): see the mintlify gotcha below.

### `mintlify dev` gotcha (docs preview)
- Running `mintlify dev` / local `npx mintlify` **from inside this monorepo fails** — it reports `Unable to parse page metadata` for nearly every page and aborts with `Failed to parse MDX files`. The MDX/frontmatter is valid; the cause is the root `package.json` `overrides` (which pin `zod`/`express`/etc. inside `@mintlify/*` transitive deps) bleeding into the workspace-hoisted `mintlify` and breaking its parser.
- **Workaround:** run an isolated mintlify install from the docs dir: `cd docs && npx -y mintlify@latest dev`. This serves all pages on `http://localhost:3000`. (Docs deploy via the hosted Mintlify Git integration and CI does not run the preview, so this only affects local preview.)

### No local secrets by default
- No `T49_API_TOKEN` is provisioned in the Cloud VM, so live SDK/MCP calls against the Terminal49 API can't be exercised without one (matches CI, where the live MCP eval skips without `MCP_EVAL_TOKEN`).
