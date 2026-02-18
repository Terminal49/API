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

## 🛠️ Available Tools (10)

| Tool | Description |
|------|-------------|
| `search_container` | Find containers by number, BL, booking, or reference |
| `track_container` | Start tracking a container with carrier code |
| `get_container` | Get detailed container information |
| `get_shipment_details` | Get complete shipment routing and containers |
| `get_container_transport_events` | Get full event timeline |
| `get_container_route` | Get vessel routing with ETAs |
| `get_supported_shipping_lines` | List 40+ supported carriers |
| `list_containers` | Browse all tracked containers |
| `list_shipments` | Browse all shipments |
| `list_tracking_requests` | Browse tracking requests |

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
│   │   ├── tools/          # 10 MCP tools
│   │   ├── prompts/        # 3 workflow prompts
│   │   └── resources/      # Dynamic resources
│   └── README.md           # Full documentation
```

The MCP package consumes published `@terminal49/sdk` by default.

**Stack:**
- [Model Context Protocol SDK](https://modelcontextprotocol.io) v1.22.0
- TypeScript
- Vercel Serverless Functions
- Terminal49 JSON:API

---

## 🔧 Development

### Prerequisites
- Node.js 18+
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
