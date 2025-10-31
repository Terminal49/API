# Terminal49 MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that wraps Terminal49's API, enabling AI assistants like Claude Desktop to query container status, shipments, fees, and LFD (Last Free Day) information.

**Version:** 0.1.0 (Sprint 1 - Foundations MVP)

## Features

### Tools (Sprint 1)

- **`get_container(id)`** - Get detailed container information by Terminal49 ID
  - Returns status, equipment details, location, demurrage/LFD, fees, holds, and rail information
  - Includes related shipment and terminal data

### Resources

- **`t49:container/{id}`** - Compact container summary in Markdown format
  - Quick access to container status and key milestones
  - Human-readable format optimized for AI context

### Coming in Sprint 2

- `track_container` - Create tracking requests by container/booking number
- `list_shipments` - Search and filter shipments
- `get_demurrage` - Focused demurrage and LFD information
- `get_rail_milestones` - Rail-specific tracking events
- Prompts: `summarize_container`, `port_ops_check`

---

## Quick Start (< 5 minutes)

### Prerequisites

- Ruby 3.0+ (recommended: 3.2.0)
- Terminal49 API token ([get yours here](https://app.terminal49.com/developers/api-keys))
- Bundler (`gem install bundler`)

### Installation

```bash
cd mcp
bundle install
```

### Configuration

```bash
# Copy example env file
cp .env.example .env

# Edit .env and add your API token
export T49_API_TOKEN=your_api_token_here
```

### Test the Server (stdio mode)

```bash
# Start the server in stdio mode
bundle exec ruby bin/terminal49-mcp

# Send a test request (in another terminal):
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | bundle exec ruby bin/terminal49-mcp
```

Expected response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "get_container",
        "description": "Get detailed information about a container...",
        "inputSchema": { ... }
      }
    ]
  },
  "id": 1
}
```

### Use with Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "terminal49": {
      "command": "/path/to/API/mcp/bin/terminal49-mcp",
      "env": {
        "T49_API_TOKEN": "your_api_token_here"
      }
    }
  }
}
```

Restart Claude Desktop, then try:
> "Get me the status of container ID 123e4567-e89b-12d3-a456-426614174000"

---

## Usage Guide

### Stdio Transport (for local AI clients)

```bash
bundle exec ruby bin/terminal49-mcp
```

Reads JSON-RPC requests from stdin, writes responses to stdout. Designed for Claude Desktop and similar MCP clients.

### HTTP Transport (for hosted use)

```bash
# Start Puma server
bundle exec puma -C config/puma.rb

# Or use the Rake task
bundle exec rake mcp:serve
```

Server runs on `http://localhost:3001/mcp` (port configurable via `MCP_SERVER_PORT` env var).

#### Example HTTP Request

```bash
curl -X POST http://localhost:3001/mcp \
  -H "Authorization: Bearer your_api_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_container",
      "arguments": {
        "id": "123e4567-e89b-12d3-a456-426614174000"
      }
    },
    "id": 1
  }'
```

---

## MCP Protocol Operations

### Initialize

```json
{
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

### List Tools

```json
{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

### Call Tool

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

### List Resources

```json
{
  "jsonrpc": "2.0",
  "method": "resources/list",
  "id": 1
}
```

### Read Resource

```json
{
  "jsonrpc": "2.0",
  "method": "resources/read",
  "params": {
    "uri": "t49:container/123e4567-e89b-12d3-a456-426614174000"
  },
  "id": 1
}
```

---

## Tool Catalog

### `get_container`

**Purpose:** Retrieve comprehensive container information by Terminal49 ID.

**Input:**
```json
{
  "id": "string (UUID)"
}
```

**Output:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "container_number": "ABCD1234567",
  "status": "available_for_pickup",
  "equipment": {
    "type": "dry",
    "length": "40",
    "height": "high_cube",
    "weight_lbs": 25000
  },
  "location": {
    "current_location": "Yard 3, Row 12",
    "available_for_pickup": true,
    "pod_arrived_at": "2024-01-14T08:00:00Z",
    "pod_discharged_at": "2024-01-15T10:00:00Z"
  },
  "demurrage": {
    "pickup_lfd": "2024-01-20",
    "pickup_appointment_at": null,
    "fees_at_pod_terminal": [...],
    "holds_at_pod_terminal": []
  },
  "rail": {
    "pod_rail_carrier": "UPRR",
    "pod_rail_loaded_at": "2024-01-16T14:00:00Z",
    "destination_eta": "2024-01-22T08:00:00Z",
    "destination_ata": null
  },
  "shipment": {...},
  "pod_terminal": {...},
  "updated_at": "2024-01-15T12:30:00Z"
}
```

**Errors:**
- `ValidationError` - Missing or invalid container ID
- `NotFoundError` - Container not found
- `AuthenticationError` - Invalid API token
- `RateLimitError` - Rate limit exceeded (100 req/min for tracking)
- `UpstreamError` - Terminal49 API error (5xx)

---

## Architecture

```
┌─────────────────┐
│  MCP Client     │  (Claude Desktop, etc.)
│  (stdio/HTTP)   │
└────────┬────────┘
         │ JSON-RPC
         ▼
┌─────────────────────────────┐
│  Terminal49 MCP Server      │
│                             │
│  ┌─────────────────────┐   │
│  │ Auth Middleware     │   │  Bearer token / env var
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Logging Middleware  │   │  Structured JSON logs
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Redaction Middleware│   │  PII/token protection
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ MCP Server Core     │   │  Protocol handler
│  │  - Tools            │   │
│  │  - Resources        │   │
│  │  - Prompts          │   │
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ Terminal49 Client   │   │  Faraday HTTP client
│  └─────────────────────┘   │
└──────────────┬──────────────┘
               │ HTTPS
               ▼
┌───────────────────────────┐
│  Terminal49 API           │
│  api.terminal49.com/v2    │
└───────────────────────────┘
```

### Components

- **`lib/terminal49_mcp.rb`** - Main module and configuration
- **`lib/terminal49_mcp/client.rb`** - Terminal49 API HTTP client (Faraday)
- **`lib/terminal49_mcp/server.rb`** - MCP protocol handler
- **`lib/terminal49_mcp/http_app.rb`** - Rack app for HTTP transport
- **`lib/terminal49_mcp/middleware/`** - Auth, logging, redaction
- **`lib/terminal49_mcp/tools/`** - MCP tool implementations
- **`lib/terminal49_mcp/resources/`** - MCP resource resolvers
- **`bin/terminal49-mcp`** - Stdio executable
- **`config.ru`** - Rack config for Puma

---

## Authentication

### Stdio Transport

Set environment variable:
```bash
export T49_API_TOKEN=your_token_here
```

### HTTP Transport

Include Bearer token in `Authorization` header:
```
Authorization: Bearer your_token_here
```

**Security Notes:**
- Tokens are redacted from logs (configurable via `MCP_REDACT_LOGS`)
- Auth failures return `401 Unauthorized`
- Per-tool allowlists can be configured (future feature)

---

## Configuration

All configuration via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `T49_API_TOKEN` | *(required)* | Terminal49 API token |
| `T49_API_BASE_URL` | `https://api.terminal49.com/v2` | API base URL |
| `MCP_SERVER_PORT` | `3001` | HTTP server port |
| `MCP_LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |
| `MCP_REDACT_LOGS` | `true` | Redact tokens/PII from logs |
| `MCP_ENABLE_RAIL_TRACKING` | `true` | Enable rail-specific features |
| `MCP_MAX_REQUESTS_PER_MINUTE` | `100` | Rate limit (matches Terminal49 limit) |

---

## Development

### Setup

```bash
bundle install
cp .env.example .env
# Edit .env with your API token
```

### Run Tests

```bash
bundle exec rspec
```

Tests use VCR to record/replay HTTP interactions. Sensitive data is automatically redacted in cassettes.

### Console

```bash
bundle exec rake dev:console
```

Launches Pry console with Terminal49MCP loaded.

### Lint

```bash
bundle exec rubocop
```

### Add a New Tool

1. Create `lib/terminal49_mcp/tools/my_tool.rb`
2. Implement `#to_schema` and `#execute(arguments)` methods
3. Register in `server.rb`: `@tools['my_tool'] = Tools::MyTool.new`
4. Add tests in `spec/tools/my_tool_spec.rb`

See `lib/terminal49_mcp/tools/get_container.rb` for reference.

---

## Observability

### Structured Logging

All logs are JSON-formatted for easy parsing:

```json
{
  "event": "mcp.request.complete",
  "request_id": "abc-123",
  "status": 200,
  "duration_ms": 245.67,
  "timestamp": "2024-01-15T12:00:00Z"
}

{
  "event": "tool.execute.complete",
  "tool": "get_container",
  "container_id": "123e4567...",
  "duration_ms": 189.23,
  "timestamp": "2024-01-15T12:00:01Z"
}
```

### Metrics (Future)

Planned Prometheus metrics:
- `mcp_tool_duration_seconds{tool="get_container"}` - Tool execution latency (p50/p95/p99)
- `mcp_upstream_http_status_total{status="200"}` - Upstream API status codes
- `mcp_errors_total{error_type="AuthenticationError"}` - Error counts by type

---

## Error Handling

All errors follow MCP JSON-RPC error format:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32001,
    "message": "Invalid or missing API token"
  },
  "id": 1
}
```

**Error Codes:**
- `-32001` - Authentication error
- `-32002` - Not found
- `-32003` - Rate limit exceeded
- `-32004` - Upstream API error
- `-32602` - Invalid parameters
- `-32603` - Internal server error

---

## Roadmap

### Sprint 1 (Current) - Foundations ✓

- [x] MCP server skeleton with stdio/HTTP transports
- [x] Auth, logging, redaction middleware
- [x] `get_container` tool + tests
- [x] `t49:container/{id}` resource
- [x] Comprehensive README

### Sprint 2 - Core Tools & DX

- [ ] Implement `track_container`, `list_shipments`, `get_demurrage`, `get_rail_milestones`
- [ ] Add prompts: `summarize_container`, `port_ops_check`
- [ ] Developer experience: fixture snapshots, example scripts, mock token helper
- [ ] Golden-path integration tests

### Sprint 3 - Hardening & Docs

- [ ] Rate limiting, backoff, idempotent retries
- [ ] Per-tool allowlists & feature flags
- [ ] SLO dashboards & alerting
- [ ] Security review (tokens, PII, dependencies)
- [ ] Internal pilot deployment

### Post-MVP (v1.0)

- [ ] Write operations (gated by roles)
- [ ] MCP notifications for status changes
- [ ] Pagination & streaming for large results
- [ ] Multi-tenancy support

---

## Troubleshooting

### "ERROR: T49_API_TOKEN environment variable is required"

Set your API token:
```bash
export T49_API_TOKEN=your_token_here
```

Get your token at: https://app.terminal49.com/developers/api-keys

### Claude Desktop doesn't see the server

1. Check config path: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
2. Ensure absolute path to `bin/terminal49-mcp`
3. Restart Claude Desktop after config changes
4. Check Claude Desktop logs for errors

### "Invalid or missing API token" errors

- Verify token is correct and active
- Check token has necessary permissions
- Ensure token isn't expired

### Rate limit errors

Terminal49 API has a 100 req/minute limit for tracking requests. Consider:
- Caching results
- Batching requests
- Implementing exponential backoff (already built-in for retries)

---

## Contributing

### Pull Requests

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-tool`)
3. Write tests (`bundle exec rspec`)
4. Ensure linting passes (`bundle exec rubocop`)
5. Submit PR with clear description

### Code Style

- Follow Rubocop rules (`.rubocop.yml`)
- Add RSpec tests for all new tools
- Use VCR for HTTP interaction tests
- Document public APIs with YARD comments

---

## License

Copyright 2024 Terminal49. All rights reserved.

---

## Support

- **Documentation:** https://docs.terminal49.com
- **API Reference:** https://api.terminal49.com/docs
- **Issues:** [GitHub Issues](https://github.com/Terminal49/API/issues)
- **Support:** support@terminal49.com

---

Built with [MCP Ruby SDK](https://github.com/modelcontextprotocol/ruby-sdk)
