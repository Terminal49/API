# Terminal49 MCP Server - Overview

This repository contains the **TypeScript implementation** of the Terminal49 MCP (Model Context Protocol) server, optimized for Vercel serverless deployment.

---

## 🚀 Quick Start Guide

### Vercel Deployment (Recommended) ⭐

**Best for:** Zero-config deployment, auto-scaling, serverless

```bash
# 1. Deploy to Vercel
vercel

# 2. Set environment variable
vercel env add T49_API_TOKEN

# 3. Done! Your MCP server is at:
https://your-deployment.vercel.app/api/mcp
```

**Documentation:** See `/packages/mcp/README.md`

---

## 📦 What's Implemented

### Tools (7 Available)
- ✅ **`search_container`** - Search by container number, BL, booking, or reference
- ✅ **`track_container`** - Create tracking requests and get container data
- ✅ **`get_container`** - Detailed container info with flexible data loading
- ✅ **`get_shipment_details`** - Complete shipment information
- ✅ **`get_container_transport_events`** - Event timeline and milestones
- ✅ **`get_supported_shipping_lines`** - List of 40+ supported carriers
- ✅ **`get_container_route`** - Multi-leg routing with vessels and ETAs

### Prompts (3 Workflows)
- ✅ **`track-shipment`** - Quick container tracking with optional carrier
- ✅ **`check-demurrage`** - Demurrage/detention risk analysis
- ✅ **`analyze-delays`** - Journey delay identification and root cause

### Resources
- ✅ **`terminal49://docs/milestone-glossary`** - Comprehensive event reference
- ✅ **`terminal49://container/{id}`** - Dynamic container data access

### Features
- ✅ **McpServer API** - Modern SDK v1.20.1 high-level patterns
- ✅ **Zod Schemas** - Type-safe input validation for all tools
- ✅ **Streamable HTTP Transport** - Production-ready remote access
- ✅ **CORS Support** - Full browser-based client compatibility

---

## 🏗️ Repository Structure

```
/
├── api/
│   └── mcp.ts                    # Vercel serverless function (HTTP)
├── packages/mcp/                       # TypeScript implementation
│   ├── src/
│   │   ├── client.ts             # Terminal49 API client
│   │   ├── server.ts             # MCP server implementation
│   │   ├── index.ts              # stdio entry point
│   │   ├── tools/                # MCP tools (7 total)
│   │   └── resources/            # MCP resources (2 total)
│   ├── package.json              # Node dependencies
│   ├── README.md                 # Full documentation
│   ├── CHANGELOG.md              # Version history
│   ├── EXECUTION_SUMMARY.md      # Implementation summary
│   └── TEST_RESULTS_V2.md        # Test coverage report
├── vercel.json                   # Vercel configuration
└── MCP_OVERVIEW.md               # This file
```

---

## 🎯 Architecture

### Dual Transport Support

**HTTP Transport** (Production):
- Vercel serverless function at `/api/mcp`
- StreamableHTTPServerTransport
- Stateless mode for horizontal scaling
- CORS enabled for browser clients
- 30-second timeout, 1GB memory

**stdio Transport** (Local Development):
- Run via `npm run mcp:stdio`
- For Claude Desktop integration
- JSON-RPC 2.0 over stdin/stdout
- Full feature parity with HTTP

### Technology Stack
- **Language**: TypeScript 5.x
- **Runtime**: Node.js 20.x
- **MCP SDK**: @modelcontextprotocol/sdk ^1.22.0
- **Validation**: Zod ^3.25.76
- **Platform**: Vercel Serverless Functions

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `T49_API_TOKEN` | ✅ Yes | - | Terminal49 API token |
| `T49_API_BASE_URL` | No | `https://api.terminal49.com/v2` | API base URL |

**Get your API token:** https://app.terminal49.com/developers/api-keys

---

## 🌐 Client Configuration

### For Claude Desktop (stdio mode)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "terminal49": {
      "command": "node",
      "args": ["/absolute/path/to/API/packages/mcp/dist/index.js"],
      "env": {
        "T49_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

**Note**: Build first with `cd packages/mcp && npm run build`

### For Cursor IDE

Add to Cursor settings:

```json
{
  "mcp": {
    "servers": {
      "terminal49": {
        "url": "https://your-deployment.vercel.app/api/mcp",
        "headers": {
          "Authorization": "Bearer YOUR_T49_API_TOKEN"
        }
      }
    }
  }
}
```

### For HTTP Clients (Vercel Deployment)

```bash
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## 🧪 Testing

```bash
cd packages/mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
```

### Test Results

**Status**: ✅ 100% Pass Rate
- **Tools**: 7/7 tested and working
- **Prompts**: 3/3 tested and working
- **Resources**: 2/2 tested and working

See `packages/mcp/TEST_RESULTS_V2.md` for detailed test results.

---

## 🚢 Deployment Guide

### Deploy to Vercel

**Option 1: Vercel CLI**

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Set environment variable
vercel env add T49_API_TOKEN

# Production deploy
vercel --prod
```

**Option 2: Vercel Dashboard**

1. Go to https://vercel.com/new
2. Import the `Terminal49/API` repository
3. Select branch (e.g., `master`)
4. Add environment variable: `T49_API_TOKEN`
5. Deploy

### Vercel Configuration

The `vercel.json` file configures:
- **Build**: `cd packages/mcp && npm install && npm run build`
- **Runtime**: Node.js 20.x
- **Max Duration**: 30 seconds
- **Memory**: 1024 MB
- **CORS**: Enabled for all origins

---

## 📊 Performance

| Tool | Typical Response Time | Data Size |
|------|----------------------|-----------|
| `search_container` | 638ms | ~5KB |
| `get_container` | 400-800ms | ~10KB |
| `get_shipment_details` | 1-3s | ~50KB (with 60+ containers) |
| `get_supported_shipping_lines` | 200ms | ~1KB |

**Notes**:
- Times measured on Vercel serverless
- Varies based on Terminal49 API response time
- Large shipments (100+ containers) may take longer

---

## 🔒 Security

Built-in security features:
- ✅ Token redaction in logs
- ✅ Secure credential handling
- ✅ No PII in error messages
- ✅ CORS configuration
- ✅ Authorization header validation
- ✅ Input validation with Zod schemas
- ✅ Error boundary handling

---

## 🧩 MCP Protocol Compliance

**Version**: MCP SDK v1.20.1

**Supported Features**:
- ✅ JSON-RPC 2.0
- ✅ Tools (with input/output schemas)
- ✅ Prompts (with argument schemas)
- ✅ Resources (with URI templates)
- ✅ Server capabilities negotiation
- ✅ Error handling (-32600 to -32603)
- ✅ Structured content in responses

**Not Implemented** (future):
- ⏸️ Completions (autocomplete for inputs)
- ⏸️ Sampling (LLM integration)
- ⏸️ ResourceLinks (context reduction)

---

## 📚 Documentation

### Repository Documentation
- **Main README**: `/packages/mcp/README.md` - Complete user guide
- **Changelog**: `/packages/mcp/CHANGELOG.md` - Version history
- **Execution Summary**: `/packages/mcp/EXECUTION_SUMMARY.md` - Implementation details
- **Test Results**: `/packages/mcp/TEST_RESULTS_V2.md` - Test coverage
- **Improvement Plan**: `/packages/mcp/IMPROVEMENT_PLAN.md` - Future roadmap

### External Documentation
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Terminal49 API**: https://docs.terminal49.com
- **Vercel Functions**: https://vercel.com/docs/functions
- **TypeScript MCP SDK**: https://github.com/modelcontextprotocol/typescript-sdk

---

## 🛠️ Development

### Local Development

```bash
cd packages/mcp

# Install dependencies
npm install

# Development mode (auto-reload)
npm run dev

# Build
npm run build

# Run stdio server
npm run mcp:stdio
```

### Testing Tools Locally

```bash
# Set API token
export T49_API_TOKEN=your_token_here

# List all tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js

# Call a tool
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_container","arguments":{"query":"CAIU"}},"id":2}' | node dist/index.js
```

---

## 🔄 Upgrade History

### v1.0.0 (Current)
- ✅ Upgraded SDK from v0.5.0 to v1.20.1
- ✅ Migrated to McpServer high-level API
- ✅ Added 3 workflow prompts
- ✅ Implemented Zod schemas for all tools
- ✅ Replaced custom HTTP handler with StreamableHTTPServerTransport (71% code reduction)
- ✅ Added structuredContent to all tool responses
- ✅ 100% test coverage

### v0.1.0 (Legacy)
- Basic MCP server implementation
- Single tool: `get_container`
- Custom JSON-RPC handling

---

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/Terminal49/API/issues)
- **Documentation**: https://docs.terminal49.com
- **Email**: support@terminal49.com

---

## 📝 License

Copyright 2024 Terminal49. All rights reserved.

---

**Quick Links:**
- [Deploy to Vercel](https://vercel.com/new/clone?repository-url=https://github.com/Terminal49/API)
- [MCP Protocol Docs](https://modelcontextprotocol.io/)
- [Terminal49 API Docs](https://docs.terminal49.com)
