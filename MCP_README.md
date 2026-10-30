# Terminal49 MCP Server

> Model Context Protocol server for Terminal49's Container Tracking API

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Terminal49/API)

---

## 🚀 Quick Start

`@terminal49/mcp` is a private workspace in this repository. Connect to the hosted server, or build the stdio server from a clone.

### Use the hosted server

The connector URL is `https://mcp.terminal49.com` (Streamable HTTP). Use that root origin, with no extra path. It is the canonical OAuth resource identifier.

**OAuth 2.1 (recommended).** No API key. Add `https://mcp.terminal49.com` to your client. It discovers the authorization server (`https://auth.terminal49.com`) via protected resource metadata, registers itself with Dynamic Client Registration, and opens your browser so you can sign in with your Terminal49 credentials.

In Claude, add Terminal49 from the [Claude Directory](https://claude.ai/directory/connectors/terminal49). For a custom connector, go to **Settings → Connectors → Add custom connector**, enter `Terminal49` as the name, use `https://mcp.terminal49.com`, and leave the advanced OAuth fields empty.

```json
{
  "mcpServers": {
    "terminal49": {
      "url": "https://mcp.terminal49.com"
    }
  }
}
```

**API key.** For clients that can't run a browser OAuth flow, create a key in the [developer portal](https://app.terminal49.com/developers/api-keys) and pass `Authorization: Token YOUR_API_KEY`. Use the `Token` scheme for API keys. The `Bearer` scheme is used for OAuth access tokens, which OAuth clients obtain automatically.

```json
{
  "mcpServers": {
    "terminal49": {
      "url": "https://mcp.terminal49.com",
      "headers": {
        "Authorization": "Token YOUR_API_KEY"
      }
    }
  }
}
```

claude.ai and Claude Desktop cannot send a static API-key header. They authenticate through the OAuth connector flow. For an API key on your own machine, run the stdio server in the next section. The local process reads `T49_API_TOKEN` instead of an `Authorization` header.

### Run it from this repository

Use Node.js 24.22.1 or a newer Node 24 release (`.tool-versions` pins `24.22.1`). From a clone:

```bash
git clone https://github.com/Terminal49/API.git
cd API
npm ci
npm run build --workspace @terminal49/sdk
npm run build --workspace @terminal49/mcp
```

The stdio entrypoint is `packages/mcp/dist/index.js`. Set `T49_API_TOKEN` to an API key from the [developer portal](https://app.terminal49.com/developers/api-keys). The process exits if that variable is unset.

```bash
T49_API_TOKEN=YOUR_API_KEY node packages/mcp/dist/index.js
```

Point a local MCP client at that file. Claude Desktop's config is `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows, and `~/.config/Claude/claude_desktop_config.json` on Linux:

```json
{
  "mcpServers": {
    "terminal49": {
      "command": "node",
      "args": ["/absolute/path/to/API/packages/mcp/dist/index.js"],
      "env": {
        "T49_API_TOKEN": "YOUR_API_KEY"
      }
    }
  }
}
```

### Deploy your own copy to Vercel

1. Click the Deploy button above
2. Add environment variable: `T49_API_TOKEN=YOUR_API_KEY`
3. Your MCP server will be at: `https://your-deployment.vercel.app/api/mcp`

---

## 📦 What You Can Do

### 🔍 Track Containers
```
Track container TCLU1234567 on Maersk
```

### 📊 Check Demurrage Risk
```
Check demurrage for container MSCU9876543
```

### 🚢 Analyze Journey Delays
```
Analyze delays for booking MAEU12345678
```

### 🔎 Search Shipments
```
Search for bill of lading 123456789
```

---

## 🛠️ Available Tools (30 by default)

| Tool | Description |
|------|-------------|
| `search_container` | Find containers by number, BL, booking, or reference |
| `track_container` | Start tracking a container with carrier code |
| `identify_tracking_number` | Predict a number's type and carrier without tracking it |
| `get_container` | Get detailed container information |
| `get_shipment_details` | Get complete shipment routing and containers |
| `get_container_transport_events` | Get full event timeline |
| `get_container_route` | Get ports in route order with ETAs and the current vessel |
| `get_location` | Get a port, terminal, or metro area |
| `get_vessel` | Get a vessel's position and projected arrival |
| `get_supported_shipping_lines` | List 40+ supported carriers |
| `list_containers` | Browse all tracked containers |
| `summarize_containers` | Count containers by terminal, status, carrier, port, hold, or date |
| `list_shipments` | Browse all shipments |
| `list_parties` | Find parties by company name or ID |
| `set_party_role` | Attach, replace, or detach a party on up to 50 containers or shipments; asks before a record loses a party |
| `set_custom_field` | Set or clear a custom field on up to 50 containers or shipments; asks before overwriting or clearing a value |
| `list_custom_field_definitions` | List the account's custom fields |
| `list_tracking_requests` | Browse tracking requests |
| `get_tracking_request` | Get one tracking request |
| `list_documents` | Find documents such as Bills of Lading and arrival notices |
| `get_document` | Get one document, with opt-in extracted data, source email, and download link |
| `search_docs` | Search the public Terminal49 documentation |
| `whoami` | Identify the credential, account, available features, and session toolsets |
| `search_importers` | Find US importers by name, by what they import, or both (trade intelligence) |
| `get_importer_profile` | One importer's totals, monthly series, ports, origins, carriers, and products (trade intelligence) |
| `search_commodities` | Turn a product description or HS prefix into four-digit HS codes (trade intelligence) |
| `rank_importers` | Rank importers by containers for a product, US port, or origin country (trade intelligence) |
| `get_trade_trends` | Time series of containers, TEUs, or estimated value (trade intelligence) |
| `get_trade_breakdown` | Nested totals over one to three dimensions (trade intelligence) |
| `get_trade_data_coverage` | Where trade data starts, the latest and last full month (trade intelligence) |

Two opt-in toolsets add write tools: `tracking_lifecycle` adds three and `reference_numbers` adds two, so all 35 tools exist but a deployment serves 30 by default. A deployment serves an opt-in toolset only when `T49_MCP_TOOLSETS` lists it. `stop_shipment_tracking`, `cancel_tracking_request` and `remove_reference_numbers` return a preview first and change data only after you approve it. A client that declares MCP 2026-07-28 form elicitation shows an `input_required` dialog and asks you to confirm. Any other client gets the preview and a `confirmation_token`, and sends the token back on a second call after you approve. See [Confirming writes](packages/mcp/README.md#confirming-writes).

| Tool | Description |
|------|-------------|
| `stop_shipment_tracking` | Stop updates for a shipment and its containers, after a confirmed preview |
| `resume_shipment_tracking` | Start tracking a stopped shipment again |
| `cancel_tracking_request` | Cancel a pending tracking request, after a confirmed preview. It cannot be undone. |
| `add_reference_numbers` | Add reference numbers to a container, shipment, or tracking request, keeping the ones already there |
| `remove_reference_numbers` | Remove reference numbers from a container, shipment, or tracking request, after a confirmed preview |

### 🎯 Workflow Prompts (3)

Pre-built workflows for common tasks:
- **track-shipment** - Quick container tracking
- **check-demurrage** - Demurrage/detention analysis
- **analyze-delays** - Journey delay identification

---

## 📚 Documentation

**Full docs:** [`packages/mcp/README.md`](packages/mcp/README.md)

**Topics:**
- Installation & Setup
- Tool Reference
- Local Development
- API Examples
- Deployment Guide

---

## 🏗️ What's Inside

```
/
├── api/mcp.ts              # Vercel HTTP endpoint
├── packages/mcp/           # MCP server package
│   ├── src/
│   │   ├── tools/          # MCP tools and the tool registry
│   │   ├── prompts/        # 3 workflow prompts
│   │   └── resources/      # Dynamic resources
│   └── README.md           # Full documentation
```

The MCP server depends on the workspace package `@terminal49/sdk`. Build that package before you build `packages/mcp`.

**Stack:**
- [Model Context Protocol SDK](https://modelcontextprotocol.io) v1.29.0
- Terminal49 TypeScript SDK v0.6.0
- [Sentry MCP Monitoring](https://docs.sentry.io/ai/monitoring/mcp/) via `@sentry/node` v10.55.0 when `SENTRY_DSN` is configured
- TypeScript
- Vercel Serverless Functions
- Terminal49 JSON:API

---

## 🔧 Development

### Prerequisites

- Node.js 24.22.1 or a newer Node 24 release
- A Terminal49 API key from the [developer portal](https://app.terminal49.com/developers/api-keys), for tool calls that reach the API

### Local setup

From the repository root, on Node.js 24.22.1 or a newer Node 24 release:

```bash
npm ci
npm run build --workspace @terminal49/sdk
npm run build --workspace @terminal49/mcp
```

Smoke-test the built stdio entrypoint. This sends `initialize`, then `tools/list`:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | T49_API_TOKEN=YOUR_API_KEY node packages/mcp/dist/index.js
```

### Testing with MCP Inspector

```bash
npx @modelcontextprotocol/inspector packages/mcp/dist/index.js
```

---

## 📖 API Coverage

**Supported Endpoints:**
- ✅ Container Search
- ✅ Container Tracking
- ✅ Shipment Details
- ✅ Transport Events
- ✅ Container Routes
- ✅ Shipping Lines
- ✅ Tracking Requests

**Features:**
- Type-safe OpenAPI client
- JSON:API deserialization
- Automatic retries
- Token authentication
- Flexible data loading

---

## 🚢 Deployment

### Vercel (Production)

**Automatic:**
Push to `main` branch → auto-deploys

**Manual:**
```bash
vercel deploy --prod
```

**Environment Variables:**
- `T49_API_TOKEN` - Your Terminal49 API key (required for this self-hosted deploy)
- `T49_API_BASE_URL` - Optional (defaults to https://api.terminal49.com)
- `SENTRY_DSN` - Optional; enables Sentry MCP Monitoring
- `SENTRY_TRACES_SAMPLE_RATE` - Optional trace sample rate (`1.0` by default)
- `SENTRY_MCP_RECORD_INPUTS` / `SENTRY_MCP_RECORD_OUTPUTS` - Optional; disabled by default to avoid storing shipment/customer payloads in Sentry

### Claude Desktop (Local)

See [Quick Start](#quick-start) above.

---

## 📝 License

MIT

---

## 🔗 Links

- [Terminal49 API Docs](https://terminal49.com/docs)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Create an API key](https://app.terminal49.com/developers/api-keys)
- [Full MCP Documentation](packages/mcp/README.md)

---

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/Terminal49/API/issues)
- **Email:** support@terminal49.com
- **Slack:** [Terminal49 Community](https://terminal49.com/slack)

---

**Built with 🍑 by Terminal49**
