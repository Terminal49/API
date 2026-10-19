# Terminal49 API repository

> **This is a public repository.** Do not commit API keys, secrets, internal URLs, customer data, or proprietary information. Use placeholders in every example, such as `Authorization: Token YOUR_API_KEY`.

This file is the only agent-instructions file in the repository. `CLAUDE.md` is a symlink to it, and Codex and Cursor read it directly. Edit `AGENTS.md`, never a copy.

## What ships from this repo

Four things ship independently from one npm workspaces monorepo (`packages/*`, `sdks/*`):

| Product | Path | Ships to |
| --- | --- | --- |
| Documentation and the OpenAPI spec | `docs/` | Mintlify, through its Git integration |
| MCP server and OAuth gateway | `api/`, `packages/mcp/` (`@terminal49/mcp`) | `mcp.terminal49.com` on Vercel (`vercel.json`) |
| TypeScript SDK | `sdks/typescript-sdk/` (`@terminal49/sdk`) | npm |
| CLI | `sdks/typescript-sdk-cli/` (`@terminal49/cli`) | npm |

The MCP server, SDK, and CLI are clients of the Terminal49 API at `https://api.terminal49.com/v2`. Nothing here runs a long-lived backend.

## Where things live

- `docs/docs.json` defines Mintlify navigation, branding, and tabs. Mintlify publishes every Markdown file under `docs/`, so keep repository notes out of that directory.
- `docs/openapi.json` is the source of truth for the API reference, the SDK types, and the MCP filter schemas.
- `docs/images/` holds every image that a docs page uses. Pages reference them as `/images/<file>`.
- `api/` holds the Vercel functions. `api/mcp.ts` serves the MCP endpoint (Streamable HTTP, stateless) and resolves caller auth. The other files serve the `/.well-known/*` discovery documents that `vercel.json` routes to them.
- `packages/mcp/src/server.ts` builds the server (`createTerminal49McpServer()`) for both the stdio entry (`src/index.ts`) and the `api/` gateway. Tools are in `src/tools/` and resources in `src/resources/`.
- `packages/mcp/src/resource.ts` is the only place that derives the OAuth `resource` identifier. The protected-resource metadata and the `WWW-Authenticate` challenge both call it so they cannot diverge (RFC 9728). Do not derive the resource anywhere else.
- `skills/` holds repository skills. `skills/terminal49-docs-writing/` is the docs-writing standard, and `skills/agent-trust/` is the change-verification gate.

## Do not hand-edit generated files

Change the source and regenerate instead.

| Generated file | Source | Regenerate with |
| --- | --- | --- |
| `Terminal49-API.postman_collection.json` | `docs/openapi.json` | `openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags,enableOptionalParameters=false` |
| `sdks/typescript-sdk/src/generated/**` | `docs/openapi.json` | `npm run generate:types --workspace @terminal49/sdk` |
| `packages/mcp/src/generated/**` | `docs/openapi.json` | `npm run generate:filters --workspace @terminal49/mcp` |
| `docs/sdk/reference/**` | SDK source | `npm run sdk:docs` (CI fails if the output is stale) |

## Commands

Vite+ (`vp`) is the toolchain, and it delegates package installs to npm. The root `package-lock.json` is the only lockfile. The repo needs Node 24.11 or later (`.tool-versions` pins `24.11.0`), which is the Node 24 floor of Vite+ 0.3.3.

- Install: `vp install`. CI and Vercel run `npm ci`.
- Check: `vp run check`. It runs `vp check`, builds the SDK declarations that other workspaces import, and then runs `tsc` for `api/` and every workspace. Keep the `tsc` checks and the SDK-first order. Vite+ type-aware linting stays off until it respects each package's own Node types.
- Test: `vp run test`. To test one package, run `vp run --filter @terminal49/mcp test`.
- Build: `vp run build`. It builds the SDK, then the MCP server, then the CLI, because a cold build needs the SDK declarations first. The published packages build with `tsc`. Do not switch them to `vp pack` without comparing the package contents and updating both npm publish workflows.
- Format: `vp run format`. Oxfmt skips docs, generated files, and package metadata.
- Lint the OpenAPI spec: `spectral lint --ruleset .spectral.yaml docs/openapi.json`.
- Preview the docs: `cd docs && npx -y mintlify@latest dev`. The Mintlify CLI is not a workspace dependency, because the root `overrides` break its MDX parser.
- Run the MCP server locally, or test it from Claude Desktop: see [packages/mcp/LOCAL_DEV.md](packages/mcp/LOCAL_DEV.md). The gateway env template is `.env.local.example`.

Oxlint, Oxfmt, Vitest, and the recursive tasks all read the root `vite.config.ts`. Do not add lint or format config to a workspace. A package-level Vitest config is fine. The vendored lint plugin is in `tools/oxlint/anti-slop/`. Its README lists the local changes to re-apply when you re-vendor it.

Move these versions together with `vite-plus`, never one at a time: the `vite` override (`npm:@voidzero-dev/vite-plus-core`), the exact `vitest` pin, `@oxlint/plugins`, and the `@vitest/coverage-v8` dev dependency in each workspace.

`.github/workflows/ci.yml` runs `vp run check`, `vp run test`, and `vp run build`, then builds, tests, and lints the SDK, the CLI, and the MCP server in separate jobs.

## Write docs

For any substantive docs change, follow [skills/terminal49-docs-writing/SKILL.md](skills/terminal49-docs-writing/SKILL.md). It routes each page type to its own guide. [WRITING_GUIDE.md](WRITING_GUIDE.md) holds the voice, terminology, approved positioning phrases, and the information architecture.

- Write for integration engineers who may not know logistics terms. Define each acronym on first use, such as Bill of Lading (BOL).
- If an API behavior or schema changes, update `docs/openapi.json` first, then regenerate its outputs.
- Give every MDX page frontmatter with a `title`.

## Agent paved path

- Read [`skills/agent-trust/SKILL.md`](skills/agent-trust/SKILL.md) before adding or changing an OpenAPI endpoint, npm package, MCP tool, SDK entrypoint, or SDK/MCP docs route.
- Extend the repository through [`skills/agent-trust/references/paved-path.md`](skills/agent-trust/references/paved-path.md); do not create alternate registration, generation, or verification flows.
- Keep [`skills/agent-trust/feature-map.json`](skills/agent-trust/feature-map.json) synchronized in the same commit. CI rejects MCP tool, SDK export, and docs-route drift.
- Run `npm run agent-verify` before handoff. `npm run agent-verify:quick` is for iteration and is not the completion gate.
- P-Stack is optional user tooling, not a repository dependency. Install it with `/add-plugin pstack`, then run `/setup-pstack` to choose a user-local model budget. Repository wiring is in [`skills/agent-trust/references/pstack.md`](skills/agent-trust/references/pstack.md).

## MCP auth gateway

- The gateway is an OAuth 2.1 resource server, and WorkOS is the authorization server. Follow the MCP authorization spec (RFC 9728, RFC 8414, RFC 8707, and RFC 6750).
- The Terminal49 backend validates tokens at `/connected-clients/resolve` and must enforce the token audience. Do not weaken the `WWW-Authenticate` challenge, the protected-resource metadata, or the resource resolver without checking the spec.
- Configuration comes from `WORKOS_*` and `T49_MCP_*` environment variables. Never log tokens. Return generic auth errors to clients and keep the detail in server logs.
- The connector URL and the OAuth resource identifier are both the root origin `https://mcp.terminal49.com`, pinned by `WORKOS_MCP_RESOURCE`. Do not put the `/mcp` path in client config. Production setup for WorkOS, ChatGPT, and Claude is in [packages/mcp/WORKOS_MCP_SETUP.md](packages/mcp/WORKOS_MCP_SETUP.md).

## Commits and pull requests

- Use conventional prefixes: `docs:`, `chore:`, `feat:`, and `fix:`.
- Put docs changes, gateway or SDK code changes, and tooling changes in separate commits.
- Give each PR a short summary, a linked issue when one exists, and screenshots for docs UI changes.

## Security

- Never commit real API keys or secrets. Keep local credentials in your environment.
- The MCP gateway is public. Treat auth, the resource resolver, and the discovery endpoints as security-sensitive.

## Tool-specific configuration

These files hold only what one tool needs and the others cannot read:

- `.claude/agents/*.md` define the docs subagents. They are the canonical subagent briefs.
- `.codex/agents/*.toml` register the same subagents for Codex and tell each one to read its `.claude/agents/` brief. `.codex/agents/seo.toml` is Codex-only. `.codex/config.toml` limits subagent fan-out.
- `.cursor/rules/agent-trust.mdc` applies the agent paved path above in Cursor. `scripts/ci/classify-pr-risk.mjs` and `.github/CODEOWNERS` reference it.

## Cursor Cloud notes

The startup script runs `npm ci` at the repo root. No `T49_API_TOKEN` is provisioned, so calls to the live API fail. The live MCP eval in CI also skips without `MCP_EVAL_TOKEN`.

- The VM's default `node` (`/exec-daemon/node`) is v22. A login-shell hook selects Node 24 through nvm, so run commands from a login shell. If `node -v` prints v22, run `nvm use 24`.
- SDK unit tests use fixtures and need no network: `npm run test --workspace @terminal49/sdk -- --run`. The `smoke` and `example` scripts call the live API and need `T49_API_TOKEN`.
- Run the MCP stdio server with `npm run mcp:stdio --workspace @terminal49/mcp`, or with `node packages/mcp/dist/index.js` after a build. `initialize` and `tools/list` work without a token. A tool call without a token returns a generic Terminal49 error, which still proves the wiring. The `api/` gateway also needs the Vercel CLI and a local backend.
