# Changelog

All notable changes to the Terminal49 MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-01-15

### Added - Sprint 1 Foundations

#### Core Infrastructure
- MCP server skeleton supporting both stdio and HTTP transports
- Rack-based HTTP application mountable at `/mcp` endpoint
- Stdio binary (`bin/terminal49-mcp`) for local MCP clients
- Configuration via environment variables
- Structured JSON logging with request/response tracking
- PII/token redaction middleware
- Bearer token authentication for HTTP transport
- Environment variable authentication for stdio transport

#### Tools
- `get_container` - Retrieve detailed container information by Terminal49 ID
  - Returns status, equipment details, location, demurrage/LFD, fees, holds
  - Includes related shipment and terminal data
  - Supports rail tracking information

#### Resources
- `t49:container/{id}` - Compact container summary in Markdown format
  - Human-readable status and milestones
  - Optimized for AI context windows

#### Client Features
- Terminal49 API HTTP client with automatic retries
- Retry logic for 429/5xx errors (exponential backoff)
- Comprehensive error mapping (401/403/404/422/429/5xx)
- JSON:API response parsing
- Support for included resources and relationships

#### Developer Experience
- Comprehensive test suite with RSpec
- VCR fixtures for HTTP interaction testing
- Example client scripts (Ruby and bash)
- Development console (Pry)
- Makefile with common tasks
- Rubocop linting configuration
- Detailed README with < 5 minute quickstart

#### Documentation
- Complete API reference
- Architecture diagrams
- Error handling guide
- Troubleshooting section
- Contributing guidelines

### Security
- Automatic token redaction in logs
- Secure handling of API credentials
- No PII in error messages
- Auth middleware validation

### Notes
This is the Sprint 1 MVP release focusing on foundations and the first end-to-end tool (`get_container`). Future sprints will add more tools, prompts, and hardening features.

## [Unreleased]

### Planned for Sprint 2
- `track_container` tool
- `list_shipments` tool with filtering
- `get_demurrage` focused tool
- `get_rail_milestones` tool
- `summarize_container` prompt
- `port_ops_check` prompt
- Pagination support
- Enhanced developer experience features

### Planned for Sprint 3
- Rate limiting with backoff
- Per-tool allowlists
- Feature flags
- Prometheus metrics
- SLO dashboards
- Security audit
- Internal pilot deployment

### Planned for v1.0
- Write operations (gated by roles)
- MCP notifications for status changes
- Streaming support for large results
- Multi-tenancy
