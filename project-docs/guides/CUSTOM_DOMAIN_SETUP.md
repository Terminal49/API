# Custom Domain Setup for Terminal49 MCP Server

This guide explains how to set up a custom subdomain for your MCP server, similar to Linear's architecture:

```
https://mcp.terminal49.com/mcp   # HTTP endpoint
https://mcp.terminal49.com/sse   # SSE endpoint
```

---

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     DNS Provider                        │
│               (e.g., Cloudflare, Route53)               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  mcp.terminal49.com  →  CNAME  →  cname.vercel-dns.com │
│                                                         │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    Vercel Platform                      │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  https://mcp.terminal49.com/mcp                 │   │
│  │  ↓ (rewrite)                                    │   │
│  │  /api/mcp.ts → StreamableHTTPServerTransport   │   │
│  │  Response: JSON-RPC over HTTP                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  https://mcp.terminal49.com/sse                 │   │
│  │  ↓ (rewrite)                                    │   │
│  │  /api/sse.ts → SSEServerTransport              │   │
│  │  Response: Server-Sent Events (text/event-stream) │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Step-by-Step Setup

### Step 1: Deploy to Vercel

First, deploy your MCP server:

```bash
cd /Users/dodeja/dev/t49/API

# Deploy to Vercel
vercel

# Or deploy to production
vercel --prod
```

You'll get a default URL like:
```
https://terminal49-api.vercel.app
```

### Step 2: Add Custom Domain in Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. **Go to your project** in Vercel Dashboard
   - https://vercel.com/[your-team]/[your-project]

2. **Navigate to Settings → Domains**

3. **Click "Add Domain"**

4. **Enter your subdomain**: `mcp.terminal49.com`

5. **Choose configuration type**:
   - If Terminal49 domain is already on Vercel: Automatic setup
   - If Terminal49 domain is external: Manual DNS setup (see below)

#### Option B: Via Vercel CLI

```bash
# Add custom domain
vercel domains add mcp.terminal49.com

# Verify domain
vercel domains inspect mcp.terminal49.com
```

### Step 3: Configure DNS

Vercel will provide DNS records. Add these to your DNS provider:

#### For Cloudflare / Route53 / Other DNS Providers

**Add CNAME Record:**
```
Type:    CNAME
Name:    mcp
Value:   cname.vercel-dns.com
TTL:     Auto (or 3600)
Proxy:   OFF (if using Cloudflare - important!)
```

**OR, if Vercel provides specific CNAME:**
```
Type:    CNAME
Name:    mcp
Value:   cname-china.vercel-dns.com  (or your provided value)
```

#### Verification

Wait 5-10 minutes for DNS propagation, then verify:

```bash
# Check DNS resolution
dig mcp.terminal49.com

# Should show CNAME pointing to Vercel
```

### Step 4: Verify SSL Certificate

Vercel automatically provisions SSL certificates via Let's Encrypt:

1. **Go to Settings → Domains** in Vercel Dashboard
2. **Check SSL status** - should show "Active" after DNS propagation
3. **Test HTTPS**: `curl https://mcp.terminal49.com/mcp`

**Note**: SSL certificate provisioning can take 5-30 minutes after DNS setup.

---

## 🧪 Testing Your Endpoints

Once deployed with custom domain:

### Test HTTP Endpoint

```bash
# List tools
curl -X POST https://mcp.terminal49.com/mcp \
  -H "Authorization: Bearer YOUR_T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call a tool
curl -X POST https://mcp.terminal49.com/mcp \
  -H "Authorization: Bearer YOUR_T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_container","arguments":{"query":"CAIU"}},"id":2}'
```

### Test SSE Endpoint

```bash
# Connect to SSE stream
curl -N -H "Authorization: Bearer YOUR_T49_API_TOKEN" \
  https://mcp.terminal49.com/sse

# With POST body for SSE
curl -X POST https://mcp.terminal49.com/sse \
  -H "Authorization: Bearer YOUR_T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

---

## 🔧 URL Rewrites Explained

The `vercel.json` configuration uses rewrites to map clean URLs:

```json
{
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/mcp"
    },
    {
      "source": "/sse",
      "destination": "/api/sse"
    }
  ]
}
```

**What this does:**
- User requests: `https://mcp.terminal49.com/mcp`
- Vercel rewrites to: `https://mcp.terminal49.com/api/mcp`
- User sees clean URL, serverless function executes

**Benefits:**
- ✅ Clean, professional URLs (no `/api/` prefix)
- ✅ Matches industry patterns (Linear, Anthropic)
- ✅ Easy to remember and share
- ✅ Flexible routing without moving files

---

## 🌐 Client Configuration

### For Claude Desktop (HTTP)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "terminal49": {
      "url": "https://mcp.terminal49.com/mcp",
      "transport": {
        "type": "http"
      },
      "headers": {
        "Authorization": "Bearer YOUR_T49_API_TOKEN"
      }
    }
  }
}
```

### For Claude Desktop (SSE)

```json
{
  "mcpServers": {
    "terminal49": {
      "url": "https://mcp.terminal49.com/sse",
      "transport": {
        "type": "sse"
      },
      "headers": {
        "Authorization": "Bearer YOUR_T49_API_TOKEN"
      }
    }
  }
}
```

### For Cursor IDE

```json
{
  "mcp": {
    "servers": {
      "terminal49-http": {
        "url": "https://mcp.terminal49.com/mcp",
        "headers": {
          "Authorization": "Bearer YOUR_T49_API_TOKEN"
        }
      },
      "terminal49-sse": {
        "url": "https://mcp.terminal49.com/sse",
        "transport": "sse",
        "headers": {
          "Authorization": "Bearer YOUR_T49_API_TOKEN"
        }
      }
    }
  }
}
```

### For Custom Clients

**HTTP:**
```javascript
const response = await fetch('https://mcp.terminal49.com/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1
  })
});
```

**SSE:**
```javascript
const eventSource = new EventSource(
  'https://mcp.terminal49.com/sse',
  {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  }
);

eventSource.onmessage = (event) => {
  console.log('SSE message:', event.data);
};
```

---

## 🔀 HTTP vs SSE: When to Use Each

### Use HTTP (`/mcp`) When:
- ✅ **Request/response pattern** - Simple tool calls
- ✅ **Stateless interactions** - Each request is independent
- ✅ **REST-like workflows** - Traditional API calls
- ✅ **Better caching** - HTTP responses can be cached
- ✅ **Easier debugging** - Use curl, Postman, etc.
- ✅ **Most MCP clients** - Default transport for most tools

**Best for:** Claude Desktop, Cursor, most integrations

### Use SSE (`/sse`) When:
- ✅ **Real-time updates** - Server pushes data to client
- ✅ **Long-running operations** - Streaming results
- ✅ **Progress updates** - Track container processing
- ✅ **Event-driven** - React to Terminal49 webhooks
- ✅ **Persistent connection** - Reduced overhead for multiple requests

**Best for:** Real-time dashboards, monitoring tools, streaming UIs

### Comparison

| Feature | HTTP (`/mcp`) | SSE (`/sse`) |
|---------|---------------|--------------|
| **Request Model** | Request/Response | Bidirectional Stream |
| **Connection** | New per request | Persistent |
| **Latency** | Higher (new connection) | Lower (persistent) |
| **Caching** | Yes | No |
| **Debugging** | Easy (curl) | Harder (need streaming client) |
| **Use Case** | Standard API calls | Real-time updates |
| **Timeout** | 30 seconds | 60 seconds |

---

## 📊 Monitoring & Logs

### View Logs in Vercel

```bash
# Real-time logs
vercel logs --follow

# Logs for specific function
vercel logs --follow api/mcp.ts
vercel logs --follow api/sse.ts

# Filter by status code
vercel logs --follow | grep "POST /mcp"
```

### Check Domain Status

```bash
# List all domains
vercel domains ls

# Inspect specific domain
vercel domains inspect mcp.terminal49.com

# Check SSL status
vercel certs ls
```

---

## 🛠️ Troubleshooting

### Issue: "Domain not found"

**Solution:**
```bash
# Verify domain ownership
vercel domains verify mcp.terminal49.com

# Check DNS records
dig mcp.terminal49.com
nslookup mcp.terminal49.com
```

### Issue: SSL certificate not provisioning

**Causes:**
- DNS propagation incomplete (wait 10-30 minutes)
- CNAME record incorrect
- Cloudflare proxy enabled (must be OFF)

**Solution:**
1. Disable Cloudflare proxy (set to DNS only)
2. Verify CNAME: `dig mcp.terminal49.com CNAME`
3. Wait for propagation
4. Check Vercel dashboard for SSL status

### Issue: 404 on `/mcp` or `/sse`

**Solution:**
- Verify `vercel.json` rewrites are deployed
- Run `vercel --prod` to redeploy with new configuration
- Check function logs: `vercel logs api/mcp.ts`

### Issue: SSE connection drops

**Causes:**
- Vercel timeout (60s max)
- Client timeout
- Network issues

**Solution:**
- Implement keepalive messages (already included in `api/sse.ts`)
- Increase client timeout
- Add reconnection logic in client

### Issue: CORS errors

**Solution:**
Already configured in `vercel.json`, but verify:
```bash
curl -X OPTIONS https://mcp.terminal49.com/mcp \
  -H "Origin: https://example.com" \
  -v
# Should return Access-Control-Allow-* headers
```

---

## 🚀 Production Checklist

- [ ] Custom domain added to Vercel
- [ ] DNS CNAME record configured
- [ ] DNS propagated (check with `dig`)
- [ ] SSL certificate active (green checkmark in Vercel)
- [ ] HTTP endpoint responding (`/mcp`)
- [ ] SSE endpoint responding (`/sse`)
- [ ] Environment variables set (T49_API_TOKEN)
- [ ] Both endpoints tested with real API calls
- [ ] Client configurations updated
- [ ] Monitoring/logging configured

---

## 📚 Additional Resources

- **Vercel Custom Domains**: https://vercel.com/docs/concepts/projects/domains
- **Vercel DNS Configuration**: https://vercel.com/docs/concepts/projects/domains/dns
- **MCP Protocol Transports**: https://modelcontextprotocol.io/docs/concepts/transports
- **SSE Specification**: https://html.spec.whatwg.org/multipage/server-sent-events.html

---

## 🎯 Example: Linear's Setup

Linear uses:
```
https://mcp.linear.app/mcp   # HTTP endpoint
https://mcp.linear.app/sse   # SSE endpoint
```

With this setup, Terminal49 will have:
```
https://mcp.terminal49.com/mcp   # HTTP endpoint
https://mcp.terminal49.com/sse   # SSE endpoint
```

Same clean, professional structure! 🚀

---

**Questions?** Check Vercel logs or contact support@terminal49.com
