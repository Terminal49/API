# Terminal49 MCP Transport Support

## Supported Transport

Terminal49 MCP production deployments use **Streamable HTTP only**:

- **Endpoint**: `POST /mcp`
- **Protocol**: MCP Streamable HTTP via `StreamableHTTPServerTransport`
- **Mode**: Stateless request/response
- **Deployment host**: Vercel serverless function (`api/mcp.ts`)

## Why SSE is not exposed

SSE transport is deprecated by MCP in favor of Streamable HTTP and is not required for hosted Claude/Cursor usage.
This project has therefore moved to HTTP-only deployment traffic for production stability in serverless environments.

## Production flow

1. Client sends JSON-RPC request to `POST /mcp`.
2. API token is validated from `Authorization` header or `T49_API_TOKEN`.
3. A short-lived server transport handles the request and returns JSON.
4. Response is returned on the HTTP response stream.

## Configuration

`vercel.json` exposes only the Streamable HTTP function:

```json
{
  "functions": {
    "api/mcp.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "rewrites": [
    {
      "source": "/mcp",
      "destination": "/api/mcp"
    }
  ]
}
```

### Local usage

- **Production**: configure clients with `POST /mcp`.
- **Local stdio**: use `npm run mcp:stdio` in `packages/mcp`.

## Client recommendations

- Use HTTP transport for Claude Desktop and Cursor.
- Keep SSE endpoint references out of hosted configuration and docs.
