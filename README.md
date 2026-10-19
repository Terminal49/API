# Terminal49 API

Terminal49 is a container and shipment tracking API. You send a bill of lading, booking, or container number, and Terminal49 returns shipment and container status, milestones, and ETAs, and sends webhook notifications when they change.

This repository holds the public developer docs, the OpenAPI spec, and the clients for the API: a TypeScript SDK, a CLI, and an MCP server for AI assistants.

## What's in this repository

| Component | Path | Where it ships |
| --- | --- | --- |
| Developer docs | [`docs/`](docs/) | [terminal49.com/docs](https://terminal49.com/docs) |
| OpenAPI spec (source of truth for the API reference) | [`docs/openapi.json`](docs/openapi.json) | [API reference](https://terminal49.com/docs/api-docs/api-reference/shipments/list-shipments) |
| TypeScript SDK | [`sdks/typescript-sdk/`](sdks/typescript-sdk/) | [`@terminal49/sdk`](https://www.npmjs.com/package/@terminal49/sdk) on npm |
| CLI (`t49`) | [`sdks/typescript-sdk-cli/`](sdks/typescript-sdk-cli/) | [`@terminal49/cli`](https://www.npmjs.com/package/@terminal49/cli) on npm |
| MCP server | [`packages/mcp/`](packages/mcp/) | `@terminal49/mcp`, hosted at `https://mcp.terminal49.com` |
| MCP OAuth gateway | [`api/`](api/) | Vercel functions behind `https://mcp.terminal49.com` |
| Postman collection (generated from the OpenAPI spec) | [`Terminal49-API.postman_collection.json`](Terminal49-API.postman_collection.json) | Import into Postman |

## Quick starts

The API, SDK, and CLI quick starts need a Terminal49 API key. Create one in the [developer portal](https://app.terminal49.com/developers/api-keys).

### Call the API

Send the key in the `Authorization` header with the `Token` prefix:

```bash
curl https://api.terminal49.com/v2/shipments \
  -H "Authorization: Token YOUR_API_KEY"
```

To track your first container, follow [Start here](https://terminal49.com/docs/api-docs/getting-started/start-here).

### Use the TypeScript SDK

```bash
npm install @terminal49/sdk
```

```ts
import { Terminal49Client } from '@terminal49/sdk';

const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN! });
const container = await client.getContainer('container-uuid', ['shipment']);
```

See the [SDK quickstart](https://terminal49.com/docs/sdk/quickstart) and the [SDK README](sdks/typescript-sdk/README.md).

### Use the CLI

```bash
npm install -g @terminal49/cli
export T49_API_TOKEN=YOUR_API_KEY
t49 track MSCU1234567
```

`t49 track` infers whether the number is a container, booking, or bill of lading, and creates a tracking request. Run `t49 commands` to list every command. See the [CLI README](sdks/typescript-sdk-cli/README.md).

### Connect the MCP server

Point your MCP client at `https://mcp.terminal49.com`. Use the root URL, not `/mcp`. The client signs you in with OAuth, so you do not need an API key. In Claude, add Terminal49 from the [Claude Directory](https://claude.ai/directory/connectors/terminal49).

For ChatGPT, Claude Code, Cursor, VS Code, and other clients, see the [MCP server docs](https://terminal49.com/docs/mcp/home).

## Develop in this repository

This is an npm workspaces monorepo that uses [Vite+](https://viteplus.dev) (`vp`) as its toolchain. You need Node 24.11 or later (`.tool-versions` pins `24.11.0`).

```bash
vp install      # or: npm ci
vp run check    # format, lint, and type-check every workspace
vp run test     # run every package's tests
vp run build    # build the SDK, then the MCP server, then the CLI
```

To preview the docs site locally, run Mintlify through `npx`. Running it from the workspace install fails to parse the MDX pages.

```bash
cd docs && npx -y mintlify@latest dev
```

Some files are generated from `docs/openapi.json` or the SDK source. Do not edit them by hand. [AGENTS.md](AGENTS.md#do-not-hand-edit-generated-files) lists each generated file and the command that regenerates it. The [Commands](AGENTS.md#commands) section of the same file covers the rest of the toolchain, and [WRITING_GUIDE.md](WRITING_GUIDE.md) sets the docs style.

Use conventional commit prefixes (`docs:`, `feat:`, `fix:`, `chore:`), and keep docs, code, and tooling changes in separate commits.

## Security

This is a public repository. Never commit API keys, secrets, or customer data. Use placeholders such as `Token YOUR_API_KEY` in examples.

To report a security issue, email [support@terminal49.com](mailto:support@terminal49.com).
