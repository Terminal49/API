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

### 🛠️ Tools (7 Available)

| Tool | Description | Key Features |
|------|-------------|--------------|
| **`search_container`** | Search by container#, BL, booking, or reference | Fast fuzzy search |
| **`track_container`** | Create tracking request and get container data | SCAC autocomplete ✨ |
| **`get_container`** | Get detailed container info with flexible data loading | Progressive loading |
| **`get_shipment_details`** | Get shipment routing, BOL, containers, ports | Full shipment context |
| **`get_container_transport_events`** | Get event timeline with ResourceLinks | 50-70% context reduction ✨ |
| **`get_supported_shipping_lines`** | List 40+ major carriers with SCAC codes | Filterable by name/code |
| **`get_container_route`** | Get multi-leg routing with vessels and ETAs | Premium feature |

### 🎯 Prompts (3 Workflows)

| Prompt | Description | Use Case |
|--------|-------------|----------|
| **`track-shipment`** | Track container with optional carrier | Quick tracking start |
| **`check-demurrage`** | Analyze demurrage/detention risk | LFD calculations |
| **`analyze-delays`** | Identify delays and root causes | Timeline analysis |

### 📚 Resources
- ✅ **`terminal49://milestone-glossary`** - Complete milestone reference guide
- ✅ **Container resources** - Dynamic container data access

### ✨ Phase 1 Features

#### High-Level McpServer API
- Modern `registerTool()`, `registerPrompt()`, `registerResource()` patterns
- Type-safe Zod schemas for all inputs and outputs
- Cleaner, more maintainable code

#### Streamable HTTP Transport
- Production-ready remote access via Vercel
- Stateless mode for serverless deployments
- Full CORS support for browser-based clients

#### Smart Completions
- **SCAC codes**: Autocomplete carrier codes as you type
- Context-aware suggestions based on input

#### ResourceLinks
- Return event summaries + links instead of embedding 100+ events
- 50-70% reduction in context usage for large datasets
- Faster responses, better LLM performance

---

## 🏗️ Architecture

```
/api/mcp.ts                  # Vercel serverless function (HTTP)
/mcp-ts/
  ├── src/
  │   ├── client.ts          # Terminal49 API client
  │   ├── server.ts          # MCP server (stdio)
  │   ├── index.ts           # Stdio entry point
  │   ├── tools/             # MCP tools
  │   └── resources/         # MCP resources
  └── package.json
```

**Dual Transport:**
- **HTTP**: Vercel serverless function at `/api/mcp` (for hosted use)
- **stdio**: Local binary for Claude Desktop (run via `npm run mcp:stdio`)

---

## 🛠️ Local Development

### Prerequisites
- Node.js 18+
- Terminal49 API token ([get yours here](https://app.terminal49.com/developers/api-keys))

### Setup

```bash
cd mcp-ts
npm install
cp .env.example .env
# Add your T49_API_TOKEN to .env
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
        "Authorization": "Bearer your_api_token_here"
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
          "Authorization": "Bearer your_api_token_here"
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
Authorization: Bearer your_api_token_here
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
Authorization: Bearer your_token_here
```

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
| `NODE_ENV` | No | `development` | Environment |
| `LOG_LEVEL` | No | `info` | Logging level |
| `REDACT_LOGS` | No | `true` | Redact tokens in logs |

---

## 🆚 Ruby vs TypeScript

This repo includes **two implementations**:

| Feature | Ruby (`/mcp`) | TypeScript (`/mcp-ts` + `/api`) |
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
  -H "Authorization: Bearer your_token" \
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
3. Make changes in `/mcp-ts/src/`
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
