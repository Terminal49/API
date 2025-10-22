# Terminal49 MCP Server - Transport Support

## ✅ Supported Transports

The Terminal49 MCP Server supports **BOTH** HTTP and SSE transports using MCP SDK v1.20.1:

| Transport | Status | Endpoint | Use Case |
|-----------|--------|----------|----------|
| **HTTP** | ✅ Fully Supported | `/mcp` | Request/response (most clients) |
| **SSE** | ✅ Fully Supported | `/sse` | Real-time streaming |
| **stdio** | ✅ Fully Supported | N/A | Local Claude Desktop |

---

## 🔧 HTTP Transport (`/mcp`)

### Implementation
- **File**: `api/mcp.ts`
- **SDK Class**: `StreamableHTTPServerTransport`
- **Pattern**: Stateless request/response

### How It Works

```typescript
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,  // Stateless
  enableJsonResponse: true        // Return JSON (not SSE)
});

await server.connect(transport);
await transport.handleRequest(req, res, req.body);
```

### Request Flow

```
Client → POST /mcp
       ↓
  {jsonrpc: "2.0", method: "tools/list", id: 1}
       ↓
  StreamableHTTPServerTransport processes request
       ↓
  Server executes tool/prompt/resource
       ↓
  {jsonrpc: "2.0", result: {...}, id: 1} ← Response
```

### Usage Example

```bash
curl -X POST https://mcp.terminal49.com/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Configuration
- **Timeout**: 30 seconds
- **Memory**: 1024 MB
- **Stateless**: Each request creates new server instance
- **CORS**: Enabled for all origins

---

## 📡 SSE Transport (`/sse`)

### Implementation
- **File**: `api/sse.ts`
- **SDK Class**: `SSEServerTransport`
- **Pattern**: Persistent connection with bidirectional communication

### How It Works

```typescript
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

// GET /sse: Client establishes SSE connection
const transport = new SSEServerTransport('/sse', res);
await server.connect(transport);
await transport.start();  // Opens SSE stream

// POST /sse?sessionId={id}: Client sends messages
await transport.handlePostMessage(req, res, req.body);
```

### Request Flow

```
1. Client → GET /sse (Authorization header)
           ↓
   Server creates SSE connection
           ↓
   Server sends sessionId via SSE event
           ↓
   Connection stays open (persistent)

2. Client → POST /sse?sessionId={id}
           ↓
   {jsonrpc: "2.0", method: "tools/call", id: 1}
           ↓
   Server processes via active session
           ↓
   Response sent via SSE stream (not POST response)
```

### Usage Example

**Step 1: Establish SSE Connection (GET)**
```javascript
const eventSource = new EventSource(
  'https://mcp.terminal49.com/sse',
  {
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN'
    }
  }
);

let sessionId;

eventSource.addEventListener('endpoint', (event) => {
  const data = JSON.parse(event.data);
  sessionId = data.sessionId;  // Save for POST requests
});

eventSource.onmessage = (event) => {
  console.log('SSE message:', JSON.parse(event.data));
};
```

**Step 2: Send Messages (POST)**
```javascript
await fetch(`https://mcp.terminal49.com/sse?sessionId=${sessionId}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    id: 1
  })
});

// Response comes via SSE stream (not POST response)
```

### Configuration
- **Timeout**: 60 seconds (longer for persistent connections)
- **Memory**: 1024 MB
- **Session Management**: In-memory map (limited in serverless)
- **CORS**: Enabled for all origins

### SSE Session Lifecycle

```
GET /sse (establish)
    ↓
SessionId created
    ↓
Store in activeTransports Map
    ↓
POST /sse?sessionId={id} (messages)
    ↓
Look up session in Map
    ↓
Process message & respond via SSE
    ↓
Connection closes
    ↓
Remove from Map
```

---

## 🆚 HTTP vs SSE Comparison

### HTTP (`/mcp`)

**Pros:**
- ✅ Simple request/response model
- ✅ Stateless (better for serverless)
- ✅ Easy to debug (curl, Postman)
- ✅ Cacheable responses
- ✅ Works with all HTTP clients
- ✅ Lower latency for single requests

**Cons:**
- ❌ New connection per request
- ❌ Higher overhead for multiple requests
- ❌ No server-initiated messages
- ❌ Cannot stream long-running operations

**Best For:**
- Claude Desktop (default)
- Cursor IDE
- REST-like API calls
- One-off tool executions
- Most use cases

### SSE (`/sse`)

**Pros:**
- ✅ Persistent connection (lower overhead)
- ✅ Server can push messages to client
- ✅ Real-time updates
- ✅ Better for multiple requests
- ✅ Can stream long operations

**Cons:**
- ❌ More complex (GET + POST)
- ❌ Session management required
- ❌ Harder to debug
- ❌ Not cacheable
- ❌ Requires sessionId tracking
- ❌ Limited by serverless timeout (60s)

**Best For:**
- Real-time dashboards
- Streaming operations
- Interactive applications
- Multiple rapid requests
- Event-driven UIs

---

## 🔀 When to Use Which

### Use HTTP (`/mcp`) When:
1. ✅ You're using Claude Desktop or Cursor
2. ✅ Simple tool calls (list, search, get)
3. ✅ You want simplicity
4. ✅ Each request is independent
5. ✅ You need debugging with curl
6. ✅ **This is the default and recommended for most use cases**

### Use SSE (`/sse`) When:
1. ✅ Building custom real-time UI
2. ✅ Need server-initiated updates
3. ✅ Making many rapid requests
4. ✅ Streaming long operations (>30s)
5. ✅ Event-driven architecture
6. ✅ **Advanced use cases only**

---

## 🚀 Deployment

Both transports are deployed automatically:

```json
{
  "functions": {
    "api/mcp.ts": {          // HTTP endpoint
      "runtime": "nodejs20.x",
      "maxDuration": 30
    },
    "api/sse.ts": {          // SSE endpoint
      "runtime": "nodejs20.x",
      "maxDuration": 60      // Longer for persistent connections
    }
  },
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

---

## 📝 Client Configuration

### Claude Desktop (HTTP - Recommended)

```json
{
  "mcpServers": {
    "terminal49": {
      "url": "https://mcp.terminal49.com/mcp",
      "transport": {
        "type": "http"
      },
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

### Claude Desktop (SSE - Advanced)

```json
{
  "mcpServers": {
    "terminal49": {
      "url": "https://mcp.terminal49.com/sse",
      "transport": {
        "type": "sse"
      },
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

### Custom Client (HTTP)

```typescript
const response = await fetch('https://mcp.terminal49.com/mcp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'search_container',
      arguments: { query: 'CAIU' }
    },
    id: 1
  })
});

const result = await response.json();
console.log(result);
```

### Custom Client (SSE)

```typescript
// Step 1: Establish SSE connection
const eventSource = new EventSource(
  'https://mcp.terminal49.com/sse',
  { headers: { 'Authorization': `Bearer ${token}` } }
);

let sessionId;

eventSource.addEventListener('endpoint', (event) => {
  sessionId = JSON.parse(event.data).sessionId;
});

eventSource.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

// Step 2: Send messages
async function sendMessage(method, params) {
  await fetch(`https://mcp.terminal49.com/sse?sessionId=${sessionId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    })
  });
}

// Usage
await sendMessage('tools/list', {});
// Response comes via eventSource.onmessage, not fetch response
```

---

## ⚠️ Serverless Limitations

### HTTP Transport
- ✅ **No limitations** - Perfect for serverless
- Each request is independent
- No state management needed

### SSE Transport
- ⚠️ **Limited by serverless constraints**:
  1. **60-second timeout** - Connection drops after 60s
  2. **In-memory sessions** - Lost on function cold start
  3. **No persistence** - Sessions don't survive deployments
  4. **Single region** - No multi-region session sharing

**Recommendation**: Use HTTP transport unless you specifically need SSE features.

---

## 🧪 Testing

### Test HTTP Endpoint

```bash
# List tools
curl -X POST https://mcp.terminal49.com/mcp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

### Test SSE Endpoint

```bash
# Step 1: Establish connection (GET)
curl -N -H "Authorization: Bearer YOUR_TOKEN" \
  https://mcp.terminal49.com/sse

# Server responds with SSE events including sessionId

# Step 2: Send message (POST) in another terminal
curl -X POST "https://mcp.terminal49.com/sse?sessionId=YOUR_SESSION_ID" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Response comes via SSE stream (first terminal), not POST response
```

---

## 📊 Summary

| Feature | HTTP (`/mcp`) | SSE (`/sse`) |
|---------|---------------|--------------|
| **Status** | ✅ Production Ready | ✅ Production Ready |
| **Complexity** | Simple | Advanced |
| **Setup** | 1 request | 2 requests (GET + POST) |
| **Connection** | Stateless | Persistent |
| **Debugging** | Easy | Hard |
| **Recommended** | ✅ Yes (default) | Only if needed |
| **Claude Desktop** | ✅ Supported | ✅ Supported |
| **Cursor IDE** | ✅ Supported | ⚠️ Check support |
| **Custom Clients** | ✅ Easy | ⚠️ Complex |

---

## 🎯 Recommendation

**Use HTTP transport (`/mcp`) for 95% of use cases.**

SSE is available if you need real-time features, but HTTP is simpler, more reliable, and works better with serverless constraints.

Both endpoints are deployed and ready to use! 🚀
