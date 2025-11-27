# Agents Guide

## Mission
Terminal49’s API repo hosts a Vercel-friendly Model Context Protocol (MCP) server, the supporting TypeScript SDK, and all accompanying docs. Agents should optimize for reliable MCP tool development, documentation parity, and the user’s preferred “data down, actions up” pattern whenever UI-like flows are touched.

---

## Architecture Overview
- `api/` – Serverless adapters. `api/mcp.ts` handles JSON/HTTP via `StreamableHTTPServerTransport`; `api/sse.ts` adds SSE with session tracking.
- `packages/mcp/` – MCP source. `src/server.ts` registers 7 tools, 3 prompt workflows, and 2 resources built on `@terminal49/sdk`.
- `sdks/typescript-sdk/` – Typed JSON:API client using `openapi-fetch` + `openapi-typescript`. Imported into MCP via `file:` dependency.
- `docs/` – Mint-powered API docs (`docs/mint.json`) plus `.mdx` guides, references, and DataSync tables.
- `assets/` – Static images and CSV support matrices referenced by docs/tooling.
- Infra – `vercel.json`, `render.yaml`, Dockerfile, OAuth/custom-domain checklists at repo root.

---

## Setup Checklist
1. **Node.js** – Use v20+ (root enforces `>=20`; MCP requires `>=18` but align on 20 locally).
2. **Install deps**
   ```bash
   npm install
   npm --prefix packages/mcp install
   npm --prefix sdks/typescript-sdk install
   ```
3. **Env vars** – Copy `.env.example` in `packages/mcp` (if present) and set:
   - `T49_API_TOKEN` (required)
   - Optional: `T49_API_BASE_URL`, `LOG_LEVEL`, `REDACT_LOGS`
4. **SDK builds** – `packages/mcp` consumes the SDK via `file:../sdks/typescript-sdk`; rebuild the SDK (`npm --prefix sdks/typescript-sdk run build`) before testing MCP changes that touch client types.

---

## Running & Testing
| Purpose | Command | Notes |
| --- | --- | --- |
| Build MCP | `npm run build` (root) | Runs root install + `packages/mcp` build as Vercel would. |
| Stdio server | `npm --prefix packages/mcp run mcp:stdio` | Requires `T49_API_TOKEN`; streams JSON-RPC through stdio. |
| Dev watch | `npm --prefix packages/mcp run dev` | Uses `tsx watch` for faster iteration. |
| HTTP transport | Deploy with `vercel`; endpoint `/api/mcp` (or `/mcp` via rewrite). | Handles CORS + token fallback. |
| SSE transport | `GET/POST /sse` (rewrite). | Requires `sessionId` to pair POSTs with live streams. |
| Tests/lint | `npm --prefix packages/mcp run test lint type-check`; similarly inside `sdks/typescript-sdk`. | Run before commit. |

**Verification tips**
- Hit `/api/mcp` with `curl -X POST ...` to list tools.
- For stdio, pipe JSON-RPC payloads (examples in `packages/mcp/README.md`) and confirm responses.

---

## Data & Documentation Sources
- `docs/api-docs/**` – Authoritative `.mdx` references rendered by Mint; update alongside API/tool changes.
- `docs/openapi.json` – Regenerate SDK types via `npm --prefix sdks/typescript-sdk run generate:types`.
- `assets/data/*.csv` – Shipping line and terminal support inputs for docs and tools.
- `Terminal49-API.postman_collection.json` – Prebuilt Postman collection for manual API tests.
- Prefer docs and recorded fixtures before hitting production APIs to conserve rate limits.

---

## Tooling & Conventions
- **TypeScript + Zod** – Keep schemas authoritative; align tool outputs with `@terminal49/sdk` responses.
- **Data down, actions up** – When editing prompt/resource flows, pass data via args/props and keep mutations at the leaves per user preference.
- **Error UX** – Normalize `Terminal49Client` errors into readable tool outputs before passing to transports.
- **Secrets** – Never hardcode tokens. Both transports fall back to `process.env.T49_API_TOKEN`; maintain that path.
- **Docs parity** – Any new tool/prompt/resource must be reflected in `packages/mcp/README.md` and relevant `.mdx`.

---

## CLI Developer Tools
Installed via `bootstrap.sh`, these replace slower defaults:

**Fast Search & Navigation**
- `rg "pattern"` – ripgrep, gitignore-aware.
  ```bash
  rg "createTerminal49McpServer" /Users/dodeja/dev/t49/API/packages/mcp/src
  rg -A 3 "registerTool" /Users/dodeja/dev/t49/API/packages/mcp/src/server.ts
  ```
- `fd "pattern"` – fd-find for fast file discovery.
  ```bash
  fd "get-container.ts" /Users/dodeja/dev/t49/API
  fd -e mdx -e ts "milestone" /Users/dodeja/dev/t49/API/docs
  ```
- `fzf` – Fuzzy finder for files/commands.
  ```bash
  fd . /Users/dodeja/dev/t49/API | fzf
  git log --oneline | fzf
  ```

**Data Processing**
- `jq '.key'` – JSON slicing (API responses, config files).
  ```bash
  curl -s https://api.terminal49.com/v2/health | jq '.status'
  cat docs/openapi.json | jq '.paths."/containers/{id}"'
  ```
- `yq '.key'` – YAML parsing (`render.yaml`, exported configs).
  ```bash
  yq '.services' render.yaml
  ```

**Advanced Code Analysis**
- `ast-grep` / `sg` – Syntax-aware search/refactor.
  ```bash
  sg -p 'server.registerTool($NAME, $$$)' /Users/dodeja/dev/t49/API/packages/mcp/src
  sg -p 'class $NAME extends Terminal49Error' /Users/dodeja/dev/t49/API/sdks/typescript-sdk/src
  ```

**Recommend**
- Default to `rg` over `grep`, `fd` over `find`, and `ast-grep` when understanding TypeScript structure.
- Use `jq`/`yq` whenever parsing JSON/YAML during scripting.

---

## Agent Workflow Playbook
1. **Clarify** – Restate user requirements and capture acceptance criteria.
2. **Plan** – Identify touched areas (tool handlers, SDK, docs, infra). Flag testing/docs impacts early.
3. **Execute** – Keep edits scoped, respect existing user changes, and add comments only where logic is non-obvious.
4. **Validate** – Run focused tests/linters. If something can’t be verified (e.g., Vercel deploy), call it out with suggested verification steps.
5. **Document** – Update READMEs/docs, mention CLI usage, and maintain “data down, actions up.”
6. **Handoff** – Summarize changes, testing coverage, and residual risks or follow-up actions.

Stay concise, surface risks early, and keep the MCP tools + docs in sync for every change.

