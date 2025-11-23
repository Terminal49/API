# Terminal49 MCP Server - Testing Guide

## 🧪 Test Suite Overview

The Terminal49 MCP Server includes multiple testing approaches for comprehensive validation.

---

## 📋 Available Tests

### 1. **Interactive Manual Tests** (Recommended for Quick Testing)

**Script:** `test-interactive.sh`

Tests all major MCP features via stdio transport with formatted output.

**Requirements:**
- Terminal49 API token set in environment

**Usage:**
```bash
cd packages/mcp

# Set your API token
export T49_API_TOKEN='your_token_here'

# Run interactive tests
./test-interactive.sh
```

**What it tests:**
- ✅ All 7 tools (list, search, get, track, etc.)
- ✅ All 3 prompts (track-shipment, analyze-delays, etc.)
- ✅ Resources (container status, milestone glossary)
- ✅ SCAC completions
- ✅ Search functionality

**Expected Output:**
```
🧪 Terminal49 MCP Server - Interactive Testing
==============================================

✅ T49_API_TOKEN found

📋 Test 1: Listing Tools...
  ✓ search_container - Search Containers
  ✓ track_container - Track Container
  ✓ get_container - Get Container Details
  ...

✅ All tests passed!
```

---

### 2. **Vitest Unit Tests** (Coming Soon)

The project is configured with Vitest but doesn't have unit tests yet.

**To run (when available):**
```bash
cd packages/mcp
npm test
```

**To create unit tests:**

Create test files in `packages/mcp/src/**/*.test.ts`:

```typescript
// Example: src/tools/search-container.test.ts
import { describe, it, expect } from 'vitest';
import { executeSearchContainer } from './search-container.js';

describe('search_container', () => {
  it('should search for containers', async () => {
    // Test implementation
  });
});
```

**Run tests:**
```bash
cd packages/mcp
npm test                # Run all tests
npm test -- --watch     # Watch mode
npm test -- --coverage  # With coverage
```

---

### 3. **MCP Inspector** (Visual Testing)

The MCP Inspector provides a visual interface for testing your server.

**Install and run:**
```bash
npx @modelcontextprotocol/inspector packages/mcp/src/index.ts
```

**Features:**
- Visual tool calling
- Prompt testing
- Resource browsing
- Request/response inspection

---

### 4. **Local Claude Desktop Testing**

Test with the actual Claude Desktop application.

**Setup:**

1. **Build the server:**
   ```bash
   cd packages/mcp
   npm install
   npm run build
   ```

2. **Configure Claude Desktop:**

   Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "terminal49-local": {
         "command": "node",
         "args": ["/Users/dodeja/dev/t49/API/packages/mcp/dist/index.js"],
         "env": {
           "T49_API_TOKEN": "your_token_here"
         }
       }
     }
   }
   ```

3. **Restart Claude Desktop**

4. **Test in Claude:**
   - "Search for container CAIU2885402"
   - "Track container TCLU1234567"
   - "Show me supported shipping lines"

---

### 5. **HTTP/SSE Endpoint Testing**

Test deployed Vercel endpoints.

#### HTTP Endpoint (`/mcp`)

```bash
# Set your token
export T49_API_TOKEN='your_token_here'

# Test tools/list
curl -X POST https://your-url.vercel.app/mcp \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }' | jq

# Test search_container
curl -X POST https://your-url.vercel.app/mcp \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "search_container",
      "arguments": {"query": "CAIU"}
    },
    "id": 2
  }' | jq
```

#### SSE Endpoint (`/sse`)

```bash
# Step 1: Establish SSE connection (in terminal 1)
curl -N -H "Authorization: Bearer $T49_API_TOKEN" \
  https://your-url.vercel.app/sse

# Server responds with sessionId via SSE events

# Step 2: Send message (in terminal 2)
curl -X POST "https://your-url.vercel.app/sse?sessionId=YOUR_SESSION_ID" \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'

# Response comes via SSE stream (terminal 1)
```

---

## 🚀 Quick Test Commands

```bash
# 1. Interactive test (fastest, most comprehensive)
export T49_API_TOKEN='your_token_here'
cd packages/mcp && ./test-interactive.sh

# 2. MCP Inspector (visual)
npx @modelcontextprotocol/inspector packages/mcp/src/index.ts

# 3. Unit tests (when available)
cd packages/mcp && npm test

# 4. Type checking
cd packages/mcp && npm run type-check

# 5. Linting
cd packages/mcp && npm run lint
```

---

## 🐛 Debugging Tests

### Enable Debug Logging

```bash
# Set DEBUG environment variable
export DEBUG=mcp:*
export T49_API_TOKEN='your_token_here'

./test-interactive.sh
```

### Check Server Output

```bash
# Run server manually to see all logs
export T49_API_TOKEN='your_token_here'
cd packages/mcp
npm run mcp:stdio

# Then send a request via stdin:
# {"jsonrpc":"2.0","method":"tools/list","id":1}
```

### Test Specific Tool

```bash
# Test individual tool via stdio
export T49_API_TOKEN='your_token_here'

echo '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_supported_shipping_lines",
    "arguments": {"search": "maersk"}
  },
  "id": 1
}' | npm run mcp:stdio 2>/dev/null | jq
```

---

## ✅ Test Coverage Goals

Current coverage status documented in `TEST_RESULTS_V2.md`.

**What's tested:**
- ✅ All 7 tools execute without errors
- ✅ All 3 prompts generate correctly
- ✅ Resources are accessible
- ✅ Zod schemas validate inputs
- ✅ structuredContent returned properly

**Future coverage:**
- [ ] Unit tests for each tool
- [ ] Unit tests for client methods
- [ ] Integration tests with mocked API
- [ ] Error handling tests
- [ ] Schema validation tests

---

## 📊 Performance Testing

### Test Response Times

```bash
# Time a tool call
time echo '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "search_container",
    "arguments": {"query": "CAIU"}
  },
  "id": 1
}' | npm run mcp:stdio 2>/dev/null
```

### Load Testing (Vercel Endpoints)

```bash
# Install hey
brew install hey

# Load test HTTP endpoint
hey -n 100 -c 10 \
  -m POST \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  https://your-url.vercel.app/mcp
```

---

## 🔄 Continuous Integration (Future)

**Recommended CI setup:**

```yaml
# .github/workflows/test.yml
name: Test MCP Server

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd packages/mcp && npm install

      - name: Type check
        run: cd packages/mcp && npm run type-check

      - name: Lint
        run: cd packages/mcp && npm run lint

      - name: Build
        run: cd packages/mcp && npm run build

      - name: Run tests
        run: cd packages/mcp && npm test
        env:
          T49_API_TOKEN: ${{ secrets.T49_API_TOKEN }}
```

---

## 📝 Test Results Documentation

Current test results are documented in:
- **packages/mcp/TEST_RESULTS_V2.md** - Latest comprehensive test results

---

## 🎯 Summary

**For quick validation:**
```bash
export T49_API_TOKEN='your_token_here'
cd packages/mcp && ./test-interactive.sh
```

**For visual testing:**
```bash
npx @modelcontextprotocol/inspector packages/mcp/src/index.ts
```

**For production testing:**
```bash
# Test deployed endpoints
curl -X POST https://your-url.vercel.app/mcp \
  -H "Authorization: Bearer $T49_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

All tests require a valid Terminal49 API token. Get yours at: https://app.terminal49.com/settings/api
