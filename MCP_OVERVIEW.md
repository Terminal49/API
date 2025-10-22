# Terminal49 MCP Servers - Overview

This repository contains **two implementations** of the Terminal49 MCP (Model Context Protocol) server:

1. **Ruby** (`/mcp`) - For standalone deployments (Railway, Fly.io, Heroku)
2. **TypeScript** (`/mcp-ts` + `/api`) - For Vercel deployments ✅ **RECOMMENDED**

---

## 🚀 Quick Start Guide

### Choose Your Deployment Path

#### Option 1: Vercel (TypeScript) - **RECOMMENDED** ⭐

**Best for:** Zero-config deployment, auto-scaling, serverless

```bash
# 1. Deploy to Vercel
vercel

# 2. Set environment variable
vercel env add T49_API_TOKEN

# 3. Done! Your MCP server is at:
https://your-deployment.vercel.app/api/mcp
```

**Documentation:** See `/mcp-ts/README.md`

---

#### Option 2: Standalone Server (Ruby)

**Best for:** Self-hosted deployments, Docker, traditional hosting

```bash
# 1. Install dependencies
cd mcp
bundle install

# 2. Set environment
export T49_API_TOKEN=your_token_here

# 3. Start server
bundle exec puma -C config/puma.rb

# Or use stdio for Claude Desktop
bundle exec ruby bin/terminal49-mcp
```

**Documentation:** See `/mcp/README.md`

---

## 🆚 Comparison

| Feature | TypeScript (`/mcp-ts`) | Ruby (`/mcp`) |
|---------|------------------------|---------------|
| **Primary Deployment** | ✅ Vercel Serverless | Railway, Fly.io, Heroku |
| **HTTP Transport** | ✅ Vercel Function | Rack/Puma server |
| **stdio Transport** | ✅ Yes (`npm run mcp:stdio`) | ✅ Yes (`bin/terminal49-mcp`) |
| **Auto-scaling** | ✅ Built-in (Vercel) | Manual configuration |
| **Setup Complexity** | ⭐ Low (one command) | Medium (server config) |
| **Hosting Cost** | Free tier available | Varies by provider |
| **Dependencies** | Node.js 18+ | Ruby 3.0+ |
| **MCP SDK** | `@modelcontextprotocol/sdk` | Custom implementation |
| **Status** | ✅ Production ready | ✅ Production ready |

---

## 📦 What's Implemented (Both Versions)

### Tools (Sprint 1)
- ✅ **`get_container(id)`** - Get detailed container information
  - Equipment, location, demurrage/LFD, fees, holds, rail tracking

### Resources
- ✅ **`t49:container/{id}`** - Markdown-formatted container summaries

### Coming in Sprint 2
- `track_container` - Create tracking requests
- `list_shipments` - Search and filter shipments
- `get_demurrage` - Focused demurrage/LFD data
- `get_rail_milestones` - Rail-specific tracking
- Prompts: `summarize_container`, `port_ops_check`

---

## 🏗️ Repository Structure

```
/
├── api/
│   └── mcp.ts                    # Vercel serverless function
├── mcp/                          # Ruby implementation
│   ├── bin/terminal49-mcp        # stdio binary (Ruby)
│   ├── lib/terminal49_mcp/       # Ruby source
│   ├── spec/                     # RSpec tests
│   ├── Gemfile                   # Ruby dependencies
│   └── README.md                 # Ruby docs
├── mcp-ts/                       # TypeScript implementation
│   ├── src/
│   │   ├── client.ts             # Terminal49 API client
│   │   ├── server.ts             # MCP server (stdio)
│   │   ├── index.ts              # stdio entry point
│   │   ├── tools/                # MCP tools
│   │   └── resources/            # MCP resources
│   ├── package.json              # Node dependencies
│   └── README.md                 # TypeScript docs
├── vercel.json                   # Vercel configuration
└── MCP_OVERVIEW.md               # This file
```

---

## 🎯 Use Cases

### TypeScript (Vercel) - Use When:
- ✅ You want zero-config deployment
- ✅ You're already using Vercel for your docs
- ✅ You need auto-scaling
- ✅ You want serverless architecture
- ✅ You prefer TypeScript

### Ruby - Use When:
- ✅ You need self-hosted deployment
- ✅ You prefer Ruby
- ✅ You want more control over server config
- ✅ You're deploying to Railway/Fly/Heroku
- ✅ You need custom middleware

---

## 🔧 Configuration

Both implementations use the same environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `T49_API_TOKEN` | ✅ Yes | Terminal49 API token |
| `T49_API_BASE_URL` | No | API base URL (default: `https://api.terminal49.com/v2`) |

**Get your API token:** https://app.terminal49.com/developers/api-keys

---

## 🌐 Client Configuration

### For Claude Desktop (stdio mode)

**TypeScript:**
```json
{
  "mcpServers": {
    "terminal49": {
      "command": "node",
      "args": ["/absolute/path/to/API/mcp-ts/src/index.ts"],
      "env": {
        "T49_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

**Ruby:**
```json
{
  "mcpServers": {
    "terminal49": {
      "command": "/absolute/path/to/API/mcp/bin/terminal49-mcp",
      "env": {
        "T49_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

### For HTTP Clients (hosted)

**TypeScript (Vercel):**
```bash
curl -X POST https://your-deployment.vercel.app/api/mcp \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

**Ruby (self-hosted):**
```bash
curl -X POST http://your-server:3001/mcp \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## 🧪 Testing

### TypeScript
```bash
cd mcp-ts
npm install
npm test
npm run type-check
```

### Ruby
```bash
cd mcp
bundle install
bundle exec rspec
bundle exec rubocop
```

---

## 📚 Documentation

- **TypeScript README:** `/mcp-ts/README.md`
- **Ruby README:** `/mcp/README.md`
- **Sprint 1 Summary:** `/mcp/PROJECT_SUMMARY.md`
- **MCP Protocol:** https://modelcontextprotocol.io/
- **Terminal49 API:** https://docs.terminal49.com

---

## 🚢 Deployment Guides

### Deploy TypeScript to Vercel

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

### Deploy Ruby to Railway

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize
railway init

# Add environment variable
railway variables set T49_API_TOKEN=your_token

# Deploy
railway up
```

### Deploy Ruby to Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch
fly launch

# Set secret
fly secrets set T49_API_TOKEN=your_token

# Deploy
fly deploy
```

---

## 🔒 Security

Both implementations include:
- ✅ Token redaction in logs
- ✅ Secure credential handling
- ✅ No PII in error messages
- ✅ CORS configuration
- ✅ Authentication validation

---

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/Terminal49/API/issues)
- **Documentation:** https://docs.terminal49.com
- **Email:** support@terminal49.com

---

## 📝 License

Copyright 2024 Terminal49. All rights reserved.

---

**Quick Links:**
- [Vercel Deployment Guide](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel)
- [MCP Protocol Docs](https://modelcontextprotocol.io/)
- [Terminal49 API Docs](https://docs.terminal49.com)
