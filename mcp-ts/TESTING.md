# Testing Guide - Terminal49 MCP Server (TypeScript)

Complete guide for testing the TypeScript MCP server locally before deploying to Vercel.

---

## Prerequisites

```bash
cd mcp-ts
npm install
export T49_API_TOKEN=your_token_here
```

---

## Method 1: stdio Mode (CLI Testing)

Test the MCP server as if it's running in Claude Desktop:

```bash
# Start the server in stdio mode
npm run mcp:stdio
```

The server will wait for JSON-RPC requests on stdin.

### Manual Testing

In the **same terminal**, paste JSON-RPC requests:

```json
{"jsonrpc":"2.0","method":"tools/list","id":1}
```

Press Enter. You'll see the response.

### Automated stdio Testing

In **another terminal**:

```bash
# List tools
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm run mcp:stdio

# Get container
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_container","arguments":{"id":"your-container-id"}},"id":2}' | npm run mcp:stdio
```

---

## Method 2: HTTP Mode (Vercel Dev Server)

Test the serverless function locally using Vercel's dev server:

### Step 1: Install Vercel CLI

```bash
npm i -g vercel
```

### Step 2: Create `.env.local`

In the **repo root** (`/home/user/API`), create:

```bash
# /home/user/API/.env.local
T49_API_TOKEN=your_token_here
T49_API_BASE_URL=https://api.terminal49.com/v2
```

### Step 3: Start Vercel Dev Server

```bash
# From repo root
cd /home/user/API
vercel dev
```

This starts a local server at `http://localhost:3000`

### Step 4: Test with curl

```bash
# Test tools/list
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Test get_container
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer your_token" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"get_container",
      "arguments":{"id":"your-container-id"}
    },
    "id":2
  }'
```

### Step 5: Use Automated Test Script

```bash
# Make sure Vercel dev is running first
cd mcp-ts
./test-http.sh your-container-id
```

---

## Method 3: Interactive Test Script

Use the built-in test script for comprehensive testing:

```bash
cd mcp-ts

# Test with default container ID
node test-local.js

# Test with specific container ID
node test-local.js 123e4567-e89b-12d3-a456-426614174000
```

This runs all 5 tests:
1. ✅ Initialize
2. ✅ List Tools
3. ✅ List Resources
4. ✅ Get Container
5. ✅ Read Resource

---

## Method 4: TypeScript REPL

Test individual functions interactively:

```bash
cd mcp-ts
npx tsx
```

In the REPL:

```typescript
import { Terminal49Client } from './src/client.js';

const client = new Terminal49Client({
  apiToken: process.env.T49_API_TOKEN!
});

// Test get container
const result = await client.getContainer('your-container-id');
console.log(result);
```

---

## Quick Reference: All Test Commands

```bash
# 1. stdio mode (manual)
npm run mcp:stdio

# 2. stdio mode (automated)
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm run mcp:stdio

# 3. Vercel dev server
vercel dev  # (from repo root)

# 4. HTTP test script (requires Vercel dev running)
./test-http.sh your-container-id

# 5. Interactive test script
node test-local.js your-container-id

# 6. Type checking
npm run type-check

# 7. Linting
npm run lint

# 8. Build
npm run build
```

---

## Common Test Scenarios

### Scenario 1: Test Tools Discovery

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq .
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "get_container",
        "description": "Get detailed information...",
        "inputSchema": {...}
      }
    ]
  },
  "id": 1
}
```

### Scenario 2: Test Container Retrieval

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{
      "name":"get_container",
      "arguments":{"id":"123e4567-e89b-12d3-a456-426614174000"}
    },
    "id":1
  }' | jq .
```

### Scenario 3: Test Resource Reading

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"resources/read",
    "params":{"uri":"t49:container/123e4567-e89b-12d3-a456-426614174000"},
    "id":1
  }' | jq .
```

### Scenario 4: Test Error Handling

```bash
# Missing container ID
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{"name":"get_container","arguments":{}},
    "id":1
  }' | jq .

# Invalid container ID
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{"name":"get_container","arguments":{"id":"invalid"}},
    "id":1
  }' | jq .

# Invalid auth
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer invalid_token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | jq .
```

---

## Troubleshooting

### "T49_API_TOKEN is required"

**Problem:** Environment variable not set

**Solution:**
```bash
export T49_API_TOKEN=your_token_here
```

### "Module not found" errors

**Problem:** Dependencies not installed

**Solution:**
```bash
cd mcp-ts
npm install
```

### "Cannot find module './src/client.js'"

**Problem:** TypeScript not transpiled or using wrong import

**Solution:**
```bash
# Use .js extensions in imports (TypeScript requires this for ESM)
# Already configured correctly in source files

# Or transpile first:
npm run build
node dist/index.js
```

### Vercel dev server not starting

**Problem:** Port already in use

**Solution:**
```bash
# Check what's using port 3000
lsof -i :3000

# Kill the process or use a different port
vercel dev --listen 3001
```

### "CORS error" in browser

**Problem:** Missing CORS headers (only in browser testing)

**Solution:** CORS is already configured in `vercel.json`. If testing in browser:
```bash
# Use curl instead, or check browser console for actual error
curl -v http://localhost:3000/api/mcp
```

---

## Development Workflow

### 1. Make Changes

Edit files in `mcp-ts/src/`

### 2. Type Check

```bash
npm run type-check
```

### 3. Test Locally

```bash
# Option A: stdio
npm run mcp:stdio

# Option B: HTTP
vercel dev  # in one terminal
./test-http.sh  # in another terminal
```

### 4. Lint

```bash
npm run lint
```

### 5. Deploy

```bash
vercel --prod
```

---

## Testing Checklist

Before deploying:

- [ ] Dependencies installed (`npm install`)
- [ ] Environment variables set (`T49_API_TOKEN`)
- [ ] Type checking passes (`npm run type-check`)
- [ ] Linting passes (`npm run lint`)
- [ ] stdio mode works (`npm run mcp:stdio`)
- [ ] HTTP mode works (Vercel dev + curl)
- [ ] Test script passes (`node test-local.js`)
- [ ] Error handling works (invalid token, missing args)
- [ ] All MCP operations tested (initialize, tools/list, tools/call, resources/list, resources/read)

---

## Next Steps

Once local testing is complete:

1. Deploy to Vercel: `vercel --prod`
2. Test production endpoint: `curl https://your-deployment.vercel.app/api/mcp`
3. Configure Claude Desktop with production URL
4. Test end-to-end with AI assistant

---

**Quick Start:**
```bash
cd mcp-ts
npm install
export T49_API_TOKEN=your_token
vercel dev  # in terminal 1
./test-http.sh  # in terminal 2
```
