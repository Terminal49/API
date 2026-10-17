# Terminal49 MCP Server

> Model Context Protocol server for Terminal49's Container Tracking API

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Terminal49/API)

---

## 🚀 Quick Start

### Use with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "terminal49": {
      "command": "npx",
      "args": ["-y", "@terminal49/mcp"],
      "env": {
        "T49_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

**Get your API token:** https://app.terminal49.com/developers/api-keys

### Deploy to Vercel

1. Click "Deploy" button above
2. Add environment variable: `T49_API_TOKEN=your_token_here`
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

## 🛠️ Available Tools (21 by default)

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
| `list_custom_field_definitions` | List the account's custom fields |
| `list_tracking_requests` | Browse tracking requests |
| `get_tracking_request` | Get one tracking request |
| `list_documents` | Find documents such as Bills of Lading and arrival notices |
| `get_document` | Get one document, with opt-in extracted data, source email, and download link |
| `search_docs` | Search the public Terminal49 documentation |
| `whoami` | Identify the credential, account, available features, and session toolsets |

The opt-in `operations` toolset adds seven write tools. A deployment serves them only when `T49_MCP_TOOLSETS` lists `operations`. `stop_shipment_tracking`, `cancel_tracking_request`, `remove_reference_numbers` and `unassign_party` return a preview first and change data only when called again with the confirmation token from that preview. See [Confirming writes](packages/mcp/README.md#confirming-writes).

| Tool | Description |
|------|-------------|
| `stop_shipment_tracking` | Stop updates for a shipment and its containers, after a confirmed preview |
| `resume_shipment_tracking` | Start tracking a stopped shipment again |
| `cancel_tracking_request` | Cancel a pending tracking request, after a confirmed preview. It cannot be undone. |
| `add_reference_numbers` | Add reference numbers to a container, shipment, or tracking request, keeping the ones already there |
| `remove_reference_numbers` | Remove reference numbers from a container, shipment, or tracking request, after a confirmed preview |
| `assign_party` | Link a party to a container or shipment in a role, such as customer or dray carrier |
| `unassign_party` | Remove one party role from a container or shipment, after a confirmed preview |

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

The MCP package consumes published `@terminal49/sdk` by default.

**Stack:**
- [Model Context Protocol SDK](https://modelcontextprotocol.io) v1.29.0
- Terminal49 TypeScript SDK v0.2.0
- [Sentry MCP Monitoring](https://docs.sentry.io/ai/monitoring/mcp/) via `@sentry/node` v10.55.0 when `SENTRY_DSN` is configured
- TypeScript
- Vercel Serverless Functions
- Terminal49 JSON:API

---

## 🔧 Development

### Prerequisites
- Node.js 24.x
- Terminal49 API token

### Local Setup

```bash
# Install dependencies
npm install

cd packages/mcp
T49_SDK_SOURCE=published npm run sdk:setup

# Optional: switch to local SDK build for development
# T49_SDK_SOURCE=local npm run sdk:setup

# Run MCP server locally (stdio)
npm run dev

# Run tests
npm test

# Build
npm run build
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
- `T49_API_TOKEN` - Your Terminal49 API token (required)
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

- [Terminal49 API Docs](https://docs.terminal49.com)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Get API Token](https://app.terminal49.com/developers/api-keys)
- [Full MCP Documentation](packages/mcp/README.md)

---

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/Terminal49/API/issues)
- **Email:** support@terminal49.com
- **Slack:** [Terminal49 Community](https://terminal49.com/slack)

---

**Built with 🍑 by Terminal49**
