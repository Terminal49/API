# Terminal49 MCP Server (TypeScript)

**Vercel-native** Model Context Protocol server for Terminal49's API, built with TypeScript and the official MCP SDK.

## 🚀 Quick Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Terminal49/API)

1. Click "Deploy" above
2. Add environment variable: `T49_API_TOKEN=your_token_here`
3. Deploy!
4. Your MCP server will be available at: `https://your-deployment.vercel.app/api/mcp`

---

## 📦 What's Included

### 🛠️ Tools (30 Available)

| Tool | Description | Key Features |
|------|-------------|--------------|
| **`search_container`** | Search by container#, BL, booking, or reference | Fast fuzzy search |
| **`track_container`** | Create tracking request and get container data | SCAC autocomplete ✨ |
| **`identify_tracking_number`** | Predict a number's type and carrier and check whether it is already tracked | Creates nothing |
| **`get_container`** | Get detailed container info with flexible data loading | Optional custom fields and party roles |
| **`get_shipment_details`** | Get shipment routing, BOL, containers, ports | Optional custom fields and party roles |
| **`get_container_transport_events`** | Get full event timeline for a container | Milestone history |
| **`get_supported_shipping_lines`** | List 40+ major carriers with SCAC codes | Filterable by name/code |
| **`get_container_route`** | Get ports in route order with ETAs and the current vessel | Premium feature |
| **`get_location`** | Get a port, terminal, or metro area | FIRMS code, address, time zone |
| **`get_vessel`** | Get a vessel's position and, optionally, its projected track to a port | Projection is a premium feature |
| **`list_shipments`** | List shipments with filters and pagination | Fleet-level visibility |
| **`list_containers`** | List containers with filters and pagination | Returns ResourceLinks ✨ |
| **`summarize_containers`** | Count containers grouped by terminal, status, carrier, port, hold, or date | Same filters as `list_containers` |
| **`list_parties`** | Find parties by company name, or read one by ID | Feeds `advanced_filters.parties` |
| **`list_custom_field_definitions`** | List the account's custom fields, their types, and enum options | Needs a signed-in user |
| **`list_tracking_requests`** | List tracking requests and statuses | Audit and monitoring |
| **`get_tracking_request`** | Get one tracking request's status, failure reason, and shipment | Follow-up after tracking |
| **`list_documents`** | Find documents by file name, reference, or type | Never returns extracted data or file links |
| **`get_document`** | Get one document, with opt-in extracted data, source email, and download link | Untrusted content is labeled |
| **`search_docs`** | Search the public Terminal49 documentation | Returns links to cite |
| **`whoami`** | Identify the credential, its account, the features it can use, and the session's toolsets | Explains empty or unauthorized results |
| **`set_party_role`** | Attach, replace, or detach a party (such as the drayage carrier) on containers or shipments | Destructive write, only on request |
| **`set_custom_field`** | Set or clear one of the account's custom fields on containers or shipments | Destructive write, only on request |
| **`search_importers`** | Find US importers by name, by what they import, or both | Trade intelligence, per account |
| **`get_importer_profile`** | One importer's totals, monthly series, ports, origins, carriers, and products | Trade intelligence, per account |
| **`search_commodities`** | Turn a product description or HS prefix into four-digit HS codes | Trade intelligence, per account |
| **`rank_importers`** | Rank importers by containers for a product, US port, or origin country | Trade intelligence, per account |
| **`get_trade_trends`** | Time series of containers, TEUs, or estimated value | Trade intelligence, per account |
| **`get_trade_breakdown`** | Nested totals over one to three dimensions | Trade intelligence, per account |
| **`get_trade_data_coverage`** | Where trade data starts, the latest and last full month | Trade intelligence, per account |

### 🎯 Prompts (3 Workflows)

| Prompt | Description | Use Case |
|--------|-------------|----------|
| **`track-shipment`** | Track container with optional carrier | Quick tracking start (SCAC autocomplete ✨) |
| **`check-demurrage`** | Analyze demurrage/detention risk | LFD calculations |
| **`analyze-delays`** | Identify delays and root causes | Timeline analysis |

The `track-shipment` prompt's `carrier` argument supports **MCP completions** (`completion/complete`): suggestions are sourced live from `get_supported_shipping_lines`, filtered by what the user has typed, and returned as SCAC codes.

### 📚 Resources
- ✅ **`terminal49://docs/milestone-glossary`** - Complete milestone reference guide
- ✅ **`terminal49://docs/mcp-query-guidance`** - Internal tool-routing hints
- ✅ **`terminal49://container/{id}`** - Dynamic container data access (also the target of `list_containers` ResourceLinks)

### 🧭 Server Instructions

The server advertises MCP `instructions` (a server-level operating guide) at initialize time: it explains the ocean container/shipment tracking domain, key vocabulary (SCAC, BOL/booking, POL/POD, LFD, demurrage, holds), the read tools vs the single write tool (`track_container`), and the canonical tool-chaining order.

### 🔗 ResourceLinks (context reduction)

`list_containers` returns MCP `resource_link` content blocks — one per container row — that point at the registered `terminal49://container/{id}` resource. Clients can render the compact list and resolve full per-container detail on demand via `resources/read`, instead of paying for every container's full payload up front.

### 🙈 Content Audience Annotations

Tool results separate the human-readable answer from agent-steering metadata. The steering block (presentation guidance + suggested follow-up tools, derived from the `_response_contract`) is tagged with `annotations: { audience: ['assistant'] }` so spec-aware clients can hide it from end users, while the answer block stays user-visible.

### ✨ Current Features (v1.0.0 - Phase 1 & 2.1 Complete)

#### ✅ Modern McpServer API
- High-level `registerTool()`, `registerPrompt()`, `registerResource()` patterns
- Type-safe Zod schemas for all tool inputs
- Cleaner, maintainable code (71% code reduction in HTTP handler)
- **MCP SDK**: @modelcontextprotocol/sdk ^1.29.0
- **Terminal49 SDK**: @terminal49/sdk 0.2.0

#### ✅ Production Transport Support
- **HTTP (streamable)**: `POST /api/mcp` - stateless, JSON responses
- SSE was removed from the hosted deployment path in favor of Streamable HTTP transport.

#### ✅ Sentry MCP Monitoring
- Optional instrumentation with `@sentry/node` ^10.55.0
- Captures MCP connections, tool calls, resources, prompts, performance spans, and errors when `SENTRY_DSN` is set
- Tool input/output recording is disabled by default; enable it only after reviewing data handling requirements

#### ✅ 3 Workflow Prompts
- `track-shipment`: Quick container tracking with optional carrier
- `check-demurrage`: Demurrage/detention risk analysis
- `analyze-delays`: Journey delay identification and root cause

#### ✅ MCP Spec Adherence
- **Server instructions**: server-level operating guide advertised at initialize
- **SCAC code completions**: `completion/complete` on the `track-shipment` prompt's `carrier` arg, sourced from `get_supported_shipping_lines`
- **ResourceLinks**: `list_containers` rows link to the `terminal49://container/{id}` resource
- **Content audience annotations**: steering metadata tagged `audience: ['assistant']`

#### 🚧 Deferred (future RFC — needs a stateful transport)
- Resource subscriptions, progress notifications, server logging, elicitation, and sampling all require a stateful (non-stateless-HTTP) transport and are out of scope here.
- Shipment ResourceLinks await a dedicated `terminal49://shipment/{id}` resource template (only the container template is currently registered).

---

## 🏗️ Architecture

```
/api/mcp.ts                  # Vercel serverless function (HTTP)
/packages/mcp/
  ├── src/
  │   ├── server.ts          # MCP server (stdio)
  │   ├── index.ts           # Stdio entry point
  │   ├── tools/             # MCP tools
  │   └── resources/         # MCP resources
  └── package.json
```

MCP uses published `@terminal49/sdk` by default, with optional local override for contributors.

**Transport:**
- **HTTP**: Vercel serverless function at `/api/mcp` (for hosted use)
- **stdio**: Local binary for Claude Desktop (run via `npm run mcp:stdio`)

---

## Store submission

The public connector URL is `https://mcp.terminal49.com`. Store assets and
submission metadata are checked in at the repository root:

- `chatgpt-app-submission.json` — locked ChatGPT listing copy and review cases
- `claude-connector-submission.json` — values to enter in Claude's submission portal
- `server.json` — official MCP Registry metadata used for Copilot discovery
- `public/store-icons/terminal49-{light,dark}.png` — 512×512 brand icons

### Verify the domain for ChatGPT

OpenAI generates a unique domain-verification token during submission. Add that
exact value to the existing MCP Vercel project:

```bash
vercel env add OPENAI_APPS_CHALLENGE
```

After the project redeploys, verify that the well-known endpoint returns only
the token you pasted:

```bash
curl --fail --silent \
  https://mcp.terminal49.com/.well-known/openai-apps-challenge
```

Do not commit the token. The endpoint returns an empty `404` response while
`OPENAI_APPS_CHALLENGE` is unset. Submit the connector and the values in
`chatgpt-app-submission.json` through the
[OpenAI plugin submission flow](https://developers.openai.com/plugins/deploy/submission).

### Submit to Claude

Use the [Claude Connectors Directory portal](https://claude.ai/admin-settings/directory/submissions/new)
and enter the values in `claude-connector-submission.json`. Upload the light
icon from `public/store-icons/terminal49-light.png`; the dark variant is
available for clients that support theme-specific assets.

### Publish for Copilot discovery

GitHub's Copilot registry is a curated downstream discovery surface. Publish
`server.json` to the official MCP Registry to make Terminal49 eligible for that
surface:

```bash
mcp-publisher validate server.json
mcp-publisher login github
mcp-publisher publish server.json
```

The publisher must authenticate as an owner of the `Terminal49` GitHub
organization because the registry name uses its `io.github.Terminal49`
namespace.

---

## 🛠️ Local Development

### Prerequisites
- Node.js 24.x
- Terminal49 API token ([get yours here](https://app.terminal49.com/developers/api-keys))

### Setup

```bash
cd packages/mcp
npm install
T49_SDK_SOURCE=published npm run sdk:setup
cp .env.example .env
# Add your T49_API_TOKEN to .env
```

Use a local SDK build during MCP development:

```bash
cd packages/mcp
T49_SDK_SOURCE=local npm run sdk:setup
```

### Run Locally

```bash
# Stdio mode (for Claude Desktop testing)
npm run mcp:stdio

# Development mode with auto-reload
npm run dev
```

### Test the API

```bash
# List tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm run mcp:stdio

# Get container
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_container","arguments":{"id":"123e4567-e89b-12d3-a456-426614174000"}},"id":2}' | npm run mcp:stdio
```

---

## 🌐 Using with Vercel Deployment

### Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel

# Set environment variable
vercel env add T49_API_TOKEN
```

### Configure MCP Client

Once deployed, your MCP server will be at: `https://your-deployment.vercel.app/api/mcp`

**For Claude Desktop or other MCP clients:**

```json
{
  "mcpServers": {
    "terminal49": {
      "url": "https://your-deployment.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Token your_api_token_here"
      }
    }
  }
}
```

**For Cursor IDE:**

```json
{
  "mcp": {
    "servers": {
      "terminal49": {
        "url": "https://your-deployment.vercel.app/api/mcp",
        "headers": {
          "Authorization": "Token your_api_token_here"
        }
      }
    }
  }
}
```

---

## 🔧 API Reference

### HTTP Endpoint

**URL:** `POST /api/mcp`

**Headers:**
```
Authorization: Token your_api_token_here
Content-Type: application/json
```

**Request (JSON-RPC):**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_container",
    "arguments": {
      "id": "123e4567-e89b-12d3-a456-426614174000"
    }
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"...\",\"container_number\":\"...\", ...}"
      }
    ]
  },
  "id": 1
}
```

### Available Methods

| Method | Description |
|--------|-------------|
| `initialize` | Initialize MCP connection |
| `tools/list` | List available tools |
| `tools/call` | Execute a tool |
| `resources/list` | List available resources |
| `resources/read` | Read a resource |

---

## 🔐 Authentication

### For Vercel Deployment (HTTP)

Set as environment variable in Vercel dashboard:
```
T49_API_TOKEN=your_token_here
```

Or include in request headers:
```
Authorization: Token your_token_here
```

`Token` is the preferred scheme. `Bearer your_token_here` is also accepted for backward compatibility.

### For Local stdio

Set in your environment:
```bash
export T49_API_TOKEN=your_token_here
```

---

## 🧪 Testing

```bash
# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

---

## 📝 Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `T49_API_TOKEN` | ✅ Yes | - | Terminal49 API token |
| `T49_API_BASE_URL` | No | `https://api.terminal49.com/v2` | API base URL |
| `T49_MCP_TOOLSETS` | No | `core,documents,operations,trade` | Comma-separated toolsets this deployment serves. See [Toolsets](#toolsets). |
| `T49_MCP_READ_ONLY` | No | `false` | Serve only tools whose `readOnlyHint` is true. Accepts `true`, `false`, `1` or `0`, in any case. |
| `T49_MCP_ALLOW_SHARED_TOKEN_WRITES` | No | `false` | Serve toolsets other than `core` and `trade` when callers share `T49_API_TOKEN` |
| `OPENAI_APPS_CHALLENGE` | Only for ChatGPT submission | - | Exact domain-verification token issued by the OpenAI submission portal |
| `NODE_ENV` | No | `development` | Environment |
| `LOG_LEVEL` | No | `info` | Logging level |
| `REDACT_LOGS` | No | `true` | Redact tokens in logs |
| `SENTRY_ENABLED` | No | `true` | Enables or disables Sentry when a DSN is configured |
| `SENTRY_DSN` | No | - | Enables Sentry MCP Monitoring when set |
| `SENTRY_ENVIRONMENT` | No | `NODE_ENV` | Sentry environment name |
| `SENTRY_RELEASE` | No | `VERCEL_GIT_COMMIT_SHA` | Sentry release identifier |
| `SENTRY_TRACES_SAMPLE_RATE` | No | `1.0` | Trace sampling rate from `0` to `1` |
| `SENTRY_MCP_RECORD_INPUTS` | No | `false` | Record MCP tool/prompt inputs in Sentry |
| `SENTRY_MCP_RECORD_OUTPUTS` | No | `false` | Record MCP tool/prompt outputs in Sentry |
| `SENTRY_SEND_DEFAULT_PII` | No | `false` | Enables Sentry default PII behavior |

> Only enable `SENTRY_MCP_RECORD_INPUTS` or `SENTRY_MCP_RECORD_OUTPUTS` after confirming that your Sentry project is approved to store shipment identifiers, references, and customer data.

Credential headers (`Authorization`, cookies, and any header whose name contains auth, token, secret, cookie, session, api-key, password, or signature) and request cookies are removed from every error and transaction event before it is sent, regardless of `SENTRY_SEND_DEFAULT_PII`.

Signed URLs, such as the document download link that `get_document` returns, are replaced with `[REDACTED_URL]` in logs, Sentry events and PostHog events. This holds even when `SENTRY_MCP_RECORD_OUTPUTS` is on.

### Toolsets

Each tool belongs to one toolset in `src/tools/registry.ts`: `core`, `documents`, `operations`, `documents_write`, `developer` or `trade`. `list_documents` and `get_document` are in `documents`. `set_party_role` and `set_custom_field` are in `operations`. The trade intelligence tools are in `trade`. Every other tool today is in `core`. `whoami` reports the toolsets a session serves and whether it has write tools.

- `T49_MCP_TOOLSETS` lists the toolsets the server allows. stdio and the HTTP gateway both read it. An unknown name, or a value made only of commas, stops stdio with an error that names the variable. HTTP requests fail with a generic 500, and the gateway logs the cause.
- The `X-T49-MCP-Toolsets` request header can only narrow that list. The server serves the toolsets that appear in both. An unknown name, or a value made only of commas, returns 400.
- `X-T49-MCP-Read-Only: true` or `T49_MCP_READ_ONLY=true` removes every tool whose `readOnlyHint` is false, including `track_container`. Both accept `true`, `false`, `1` or `0`, in any case. Any other header value returns 400. The header cannot turn off read-only mode that the env turned on.
- The server instructions name only the tools the session serves.
- When the gateway uses one shared `T49_API_TOKEN`, it serves only `core` and the read-only `trade` toolset unless `T49_MCP_ALLOW_SHARED_TOKEN_WRITES=true`.
- Toolsets are never read from the connector URL. The OAuth resource stays the root origin.

---

## 🆚 Ruby vs TypeScript

This repo includes **two implementations**:

| Feature | Ruby (`/mcp`) | TypeScript (`/packages/mcp` + `/api`) |
|---------|---------------|----------------------------------|
| **Deployment** | Railway, Fly.io, Heroku | ✅ **Vercel (native)** |
| **HTTP Transport** | Rack/Puma | ✅ Vercel Serverless |
| **stdio Transport** | ✅ Yes | ✅ Yes |
| **Status** | Complete | Complete |
| **Use Case** | Standalone servers | Vercel deployments |

**Recommendation:** Use **TypeScript** for Vercel deployments (zero-config, auto-scaling).

---

## 🚦 Vercel Configuration

The project includes `vercel.json` for optimal Vercel deployment:

```json
{
  "functions": {
    "api/mcp.ts": {
      "runtime": "nodejs20.x",
      "maxDuration": 30,
      "memory": 1024
    }
  }
}
```

### Configuration Notes
- **Runtime:** Node.js 20.x
- **Max Duration:** 30 seconds (adjustable for Pro/Enterprise)
- **Memory:** 1024 MB
- **CORS:** Enabled for all origins (`Access-Control-Allow-Origin: *`)

---

## 🐛 Troubleshooting

### "T49_API_TOKEN is required" error

**Solution:** Set environment variable in Vercel dashboard or locally:
```bash
vercel env add T49_API_TOKEN
```

### "Method not allowed" error

**Solution:** Ensure you're using `POST` method, not `GET`:
```bash
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Authorization: Token your_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### CORS errors in browser

**Solution:** CORS is configured in `vercel.json`. If issues persist, check Vercel deployment logs:
```bash
vercel logs
```

### Timeout errors

**Solution:** Increase `maxDuration` in `vercel.json` (requires Vercel Pro/Enterprise):
```json
{
  "functions": {
    "api/mcp.ts": {
      "maxDuration": 60
    }
  }
}
```

---

## 📚 Documentation

- **MCP Protocol:** https://modelcontextprotocol.io/
- **Terminal49 API:** https://docs.terminal49.com
- **Vercel Functions:** https://vercel.com/docs/functions
- **TypeScript MCP SDK:** https://github.com/modelcontextprotocol/typescript-sdk

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-tool`
3. Make changes in `/packages/mcp/src/`
4. Add tests
5. Run type check: `npm run type-check`
6. Submit PR

---

## 📄 License

Copyright 2024 Terminal49. All rights reserved.

---

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/Terminal49/API/issues)
- **Documentation:** https://docs.terminal49.com
- **Email:** support@terminal49.com

---

Built with [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) 🚀
