# Terminal49 MCP Server - Improvement Plan

**Date**: 2025-10-22
**Version**: 1.0
**Current SDK**: @modelcontextprotocol/sdk v0.5.0
**Latest SDK**: @modelcontextprotocol/sdk v1.20.1

---

## Executive Summary

The Terminal49 MCP Server is **functionally complete** with 7 working tools and 2 resources, but uses an **outdated SDK (v0.5.0)** from 2+ years ago. The documentation describes modern features (McpServer API, prompts, completions, Zod schemas) that are **not implemented**.

**Key Issues:**
1. SDK v0.5.0 lacks McpServer, registerTool(), StreamableHTTPServerTransport
2. Custom HTTP handler instead of SDK's StreamableHTTPServerTransport
3. Documentation/code mismatch (README claims features that don't exist)
4. SSE is deprecated - should use StreamableHTTP

**Recommendation**: Upgrade to SDK v1.20.1 to unlock modern patterns and implement documented features.

---

## Current State Analysis

### ✅ What's Working

**Tools (7 total)**
- `search_container` - Find containers/shipments by number, BL, booking
- `track_container` - Create tracking requests
- `get_container` - Flexible data loading with progressive includes
- `get_shipment_details` - Complete shipment information
- `get_container_transport_events` - Event timeline
- `get_supported_shipping_lines` - 40+ carriers with SCAC codes
- `get_container_route` - Multi-leg routing (premium feature)

**Resources (2 total)**
- `terminal49://container/{id}` - Container data access
- `terminal49://docs/milestone-glossary` - Event glossary

**Transports**
- ✅ stdio (local development) - WORKING
- ⚠️  HTTP (Vercel deployment) - CUSTOM implementation (not using SDK)

**Code Quality**
- TypeScript with type checking
- Structured logging
- Error handling
- Terminal49 API client with retry logic

### ❌ What's Documented But NOT Implemented

**From README.md:**
```markdown
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
```

**Reality Check:**
- ❌ McpServer API - Using old `Server` class
- ❌ registerTool() - Using manual `setRequestHandler()`
- ❌ Zod schemas - Installed but unused
- ❌ StreamableHTTPServerTransport - Custom JSON-RPC handler
- ❌ Prompts - Not registered
- ❌ Completions - Not implemented

**From CHANGELOG.md:**
```markdown
### Changed

#### Architecture
- **BREAKING**: Migrated from low-level `Server` class to high-level `McpServer` API
- **BREAKING**: All tools now use `registerTool()` pattern instead of manual request handlers
```

**Reality**: This migration never happened. Still using low-level `Server` class.

---

## Technical Debt

### 1. Outdated SDK (CRITICAL)

**Current**: v0.5.0 (released ~2 years ago)
**Latest**: v1.20.1
**Gap**: 15+ major versions behind

**What's Missing:**
- `McpServer` high-level API
- `registerTool()`, `registerPrompt()`, `registerResource()`
- `StreamableHTTPServerTransport`
- Native completions support
- Session management APIs
- Improved type safety

**Impact:**
- Cannot use modern patterns from docs
- More boilerplate code (200+ lines vs 50)
- Missing features users expect
- Harder to maintain

### 2. Custom HTTP Handler (HIGH)

**Current Implementation** (`api/mcp.ts`):
```typescript
// 320 lines of custom JSON-RPC handling
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Manual CORS
  // Manual auth parsing
  // Manual method routing
  // Manual error handling
  // Manual response formatting
}
```

**SDK Pattern** (from docs):
```typescript
// ~30 lines with StreamableHTTPServerTransport
app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

**Benefits of Migration:**
- ✅ 90% less code
- ✅ Session management built-in
- ✅ Better error handling
- ✅ Automatic protocol compliance
- ✅ SSE deprecation handled

### 3. Documentation Mismatch (MEDIUM)

| Document | Claims | Reality |
|----------|---------|---------|
| README.md | "McpServer API", "registerTool()" | Using old Server class |
| README.md | "3 Prompts" | 0 prompts registered |
| README.md | "Smart Completions" | Not implemented |
| README.md | "Zod Schemas" | Installed but unused |
| CHANGELOG.md | "Migrated to McpServer" | Never happened |

**Impact**: Confusing for developers, misleading for users

---

## Improvement Plan

### Phase 1: SDK Upgrade & Modernization (HIGH PRIORITY)

**Goal**: Bring codebase up to modern MCP standards

#### 1.1 Upgrade SDK
```bash
npm install @modelcontextprotocol/sdk@latest
```

**Current**: v0.5.0
**Target**: v1.20.1
**Effort**: 4-6 hours (refactoring required)
**Risk**: Breaking changes in server.ts and api/mcp.ts

#### 1.2 Migrate to McpServer API

**Files to Update**:
- `src/server.ts` - Replace Server with McpServer
- All tools in `src/tools/*.ts` - Use registerTool() pattern

**Before** (Current):
```typescript
export class Terminal49McpServer {
  private server: Server;

  constructor(apiToken: string, apiBaseUrl?: string) {
    this.server = new Server({ name: 'terminal49-mcp', version: '1.0.0' }, ...);
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [searchContainerTool, trackContainerTool, ...]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      switch (name) {
        case 'search_container':
          // 200+ lines of switch cases
      }
    });
  }
}
```

**After** (Modern):
```typescript
const server = new McpServer({
  name: 'terminal49-mcp',
  version: '1.0.0'
});

// Register tools with Zod schemas
server.registerTool(
  'search_container',
  {
    title: 'Container Search',
    description: 'Search by container number, BL, booking, or reference',
    inputSchema: { query: z.string().min(1) },
    outputSchema: {
      containers: z.array(containerSchema),
      shipments: z.array(shipmentSchema),
      total_results: z.number()
    }
  },
  async ({ query }) => {
    const result = await executeSearchContainer({ query }, client);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result
    };
  }
);
```

**Benefits**:
- 75% less boilerplate
- Type-safe inputs/outputs
- Better error messages
- Cleaner code structure

#### 1.3 Replace Custom HTTP Handler

**File**: `api/mcp.ts` (320 lines → ~50 lines)

**Before** (Current):
```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Manual CORS, auth, routing, error handling...
  const mcpRequest = req.body as JSONRPCRequest;
  const response = await handleMcpRequest(mcpRequest, client);
  res.status(200).json(response);
}

async function handleMcpRequest(...) {
  switch (method) {
    case 'initialize': ...
    case 'tools/list': ...
    case 'tools/call': ...
    // 200+ lines
  }
}
```

**After** (Modern):
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';

const app = express();
app.use(express.json());

// Create server once (reuse across requests)
const server = new McpServer({ name: 'terminal49-mcp', version: '1.0.0' });
// ... register tools, resources, prompts ...

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on('close', () => transport.close());

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

export default app; // Vercel supports Express apps
```

**Benefits**:
- 85% less code
- SDK handles protocol compliance
- Session management built-in
- SSE deprecation handled automatically

---

### Phase 2: Implement Documented Features (MEDIUM PRIORITY)

**Goal**: Match README claims with actual implementation

#### 2.1 Add Prompts (3 workflows)

**Why**: Prompts provide structured workflows for common tasks

**Implementation**:
```typescript
// Prompt 1: Track Shipment
server.registerPrompt(
  'track-shipment',
  {
    title: 'Track Container Shipment',
    description: 'Quick container tracking workflow',
    arguments: [
      {
        name: 'container_number',
        description: 'Container number (e.g., CAIU1234567)',
        required: true
      },
      {
        name: 'carrier',
        description: 'Shipping line SCAC code (e.g., MAEU)',
        required: false
      }
    ]
  },
  async ({ container_number, carrier }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Track container ${container_number}${carrier ? ` with carrier ${carrier}` : ''}`
        }
      }
    ]
  })
);

// Prompt 2: Check Demurrage Risk
server.registerPrompt(
  'check-demurrage',
  {
    title: 'Check Demurrage Risk',
    description: 'Analyze demurrage/detention risk for a container',
    arguments: [
      {
        name: 'container_id',
        description: 'Terminal49 container UUID',
        required: true
      }
    ]
  },
  async ({ container_id }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Analyze demurrage risk for container ${container_id}. Check LFD, holds, and fees.`
        }
      }
    ]
  })
);

// Prompt 3: Analyze Delays
server.registerPrompt(
  'analyze-delays',
  {
    title: 'Analyze Journey Delays',
    description: 'Identify delays and root causes in container journey',
    arguments: [
      {
        name: 'container_id',
        description: 'Terminal49 container UUID',
        required: true
      }
    ]
  },
  async ({ container_id }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Analyze the journey timeline for container ${container_id} and identify any delays or issues.`
        }
      }
    ]
  })
);
```

**Effort**: 2-3 hours
**Value**: Improved UX for common workflows

#### 2.2 Add SCAC Code Completions

**Why**: Help users enter correct carrier codes

**Implementation**:
```typescript
import { shippingLines } from './data/shipping-lines.js';

server.registerTool(
  'track_container',
  {
    title: 'Track Container',
    inputSchema: {
      containerNumber: z.string(),
      scac: completable(z.string().optional(), async (partial) => {
        // Autocomplete SCAC codes
        return shippingLines
          .filter(line =>
            line.scac.toLowerCase().startsWith(partial.toLowerCase()) ||
            line.name.toLowerCase().includes(partial.toLowerCase())
          )
          .slice(0, 10)
          .map(line => ({
            value: line.scac,
            label: `${line.scac} - ${line.name}`
          }));
      })
    }
  },
  async ({ containerNumber, scac }) => {
    // ... implementation
  }
);
```

**Effort**: 1-2 hours
**Value**: Better UX, fewer errors

#### 2.3 Implement Zod Schemas

**Why**: Type-safe validation, better error messages

**Current**: Dependency installed, not used
**Target**: All 7 tools with input/output schemas

**Example**:
```typescript
// Create reusable schemas
const containerSchema = z.object({
  id: z.string().uuid(),
  container_number: z.string(),
  status: z.string(),
  equipment: z.object({
    type: z.string(),
    length: z.string()
  }),
  location: z.object({
    current_location: z.string().nullable(),
    available_for_pickup: z.boolean()
  })
});

// Use in tool registration
server.registerTool(
  'get_container',
  {
    inputSchema: {
      id: z.string().uuid(),
      include: z.array(z.enum(['shipment', 'pod_terminal', 'transport_events'])).optional()
    },
    outputSchema: containerSchema
  },
  async ({ id, include }) => {
    // TypeScript knows the exact types
    const result = await executeGetContainer({ id, include }, client);
    return { content: [...], structuredContent: result };
  }
);
```

**Effort**: 4-6 hours (all 7 tools)
**Value**: Runtime validation, better DX

---

### Phase 3: Fix Documentation (MEDIUM PRIORITY)

**Goal**: Documentation matches implementation

#### 3.1 Update README.md

**Changes**:
```diff
- ### ✨ Phase 1 Features
-
- #### High-Level McpServer API
- - Modern `registerTool()`, `registerPrompt()`, `registerResource()` patterns
- - Type-safe Zod schemas for all inputs and outputs
- - Cleaner, more maintainable code

+ ### 🚀 Current Status (v1.0.0)
+
+ ✅ **Production Ready**
+ - 7 tools for container tracking
+ - 2 resources (container data, milestone glossary)
+ - stdio and HTTP transports
+
+ 🚧 **Coming Soon** (Phase 2)
+ - Modern McpServer API migration
+ - 3 workflow prompts
+ - SCAC code autocomplete
+ - Zod schema validation
```

#### 3.2 Update CHANGELOG.md

**Changes**:
```diff
- ### Changed
-
- #### Architecture
- - **BREAKING**: Migrated from low-level `Server` class to high-level `McpServer` API
- - **BREAKING**: All tools now use `registerTool()` pattern instead of manual request handlers

+ ### Implementation Notes
+
+ - Uses SDK v0.5.0 low-level Server API
+ - Custom HTTP handler in api/mcp.ts
+ - Phase 2 will migrate to McpServer API with SDK v1.x
```

**Effort**: 30 minutes
**Value**: Accurate expectations

---

### Phase 4: Code Quality & Testing (LOW PRIORITY)

#### 4.1 Add Unit Tests

**Current**: vitest configured, no tests
**Target**: 80%+ coverage

**Test Coverage**:
- ✅ All 7 tools
- ✅ Terminal49Client (API calls, retry logic, error handling)
- ✅ Resource readers
- ✅ Error scenarios

**Example**:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { executeSearchContainer } from '../src/tools/search-container';

describe('search_container', () => {
  it('should search by container number', async () => {
    const mockClient = {
      search: vi.fn().mockResolvedValue({
        data: [{ type: 'container', id: 'uuid', attributes: { number: 'CAIU1234567' } }]
      })
    };

    const result = await executeSearchContainer({ query: 'CAIU' }, mockClient);

    expect(mockClient.search).toHaveBeenCalledWith('CAIU');
    expect(result.containers).toHaveLength(1);
    expect(result.total_results).toBe(1);
  });

  it('should handle API errors gracefully', async () => {
    const mockClient = {
      search: vi.fn().mockRejectedValue(new Error('API error'))
    };

    await expect(executeSearchContainer({ query: 'CAIU' }, mockClient))
      .rejects.toThrow('API error');
  });
});
```

**Effort**: 8-12 hours
**Value**: Confidence in refactoring

#### 4.2 Improve Error Handling

**Current**: Basic try/catch
**Target**: Structured errors with context

**Example**:
```typescript
class MCP Error extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: any
  ) {
    super(message);
    this.name = 'MCPError';
  }
}

// Usage
if (!args.id) {
  throw new MCPError(-32602, 'Invalid params: id is required', {
    field: 'id',
    type: 'missing'
  });
}
```

**Effort**: 2-3 hours
**Value**: Better debugging

---

### Phase 5: Advanced Features (OPTIONAL)

#### 5.1 Session Management

**Use Case**: Stateful workflows, caching

**Implementation**:
```typescript
import { randomUUID } from 'crypto';

const transports = new Map<string, StreamableHTTPServerTransport>();

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports.has(sessionId)) {
    transport = transports.get(sessionId)!;
  } else {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => transports.set(id, transport)
    });
  }

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

**Effort**: 3-4 hours
**Value**: Better UX for multi-step workflows

#### 5.2 Additional Tools

**Ideas**:
- `list_containers` - List containers with filters (status, port, carrier)
- `get_terminal_info` - Terminal operating hours, fees, location
- `get_carrier_tracking_page` - Direct link to carrier website
- `calculate_demurrage` - Estimate demurrage charges
- `find_similar_shipments` - Find similar routing patterns

**Effort**: Variable (2-4 hours per tool)
**Value**: Depends on user demand

---

## Migration Strategy

### Option A: Big Bang (Recommended for Clean Start)

**Steps**:
1. Create feature branch `feature/mcp-v2-sdk-upgrade`
2. Upgrade SDK to v1.20.1
3. Refactor all code to use McpServer API
4. Implement prompts & completions
5. Add Zod schemas
6. Test thoroughly
7. Update documentation
8. Deploy

**Timeline**: 2-3 days
**Risk**: High (breaking changes)
**Benefit**: Clean, modern codebase

### Option B: Incremental (Lower Risk)

**Steps**:
1. **Week 1**: Upgrade SDK, migrate server.ts to McpServer
2. **Week 2**: Migrate api/mcp.ts to StreamableHTTPServerTransport
3. **Week 3**: Add prompts & completions
4. **Week 4**: Add Zod schemas & tests
5. **Week 5**: Update docs & deploy

**Timeline**: 4-5 weeks
**Risk**: Low (can test/rollback each phase)
**Benefit**: Safer, easier to debug

### Option C: Parallel (Keep Both)

**Steps**:
1. Create new v2 implementation alongside v1
2. Deploy both (e.g., `/api/mcp` and `/api/mcp-v2`)
3. Migrate clients gradually
4. Deprecate v1 after 6 months

**Timeline**: Variable
**Risk**: Medium (maintaining two versions)
**Benefit**: Zero downtime migration

---

## Questions & Answers

### Q: Should we use SSE or HTTP?

**A: Use StreamableHTTP** - SSE is deprecated per MCP specification:

> "The SSE transport is now deprecated in favor of Streamable HTTP. New implementations should use Streamable HTTP, and existing SSE implementations should plan to migrate."

**StreamableHTTP Benefits**:
- ✅ Single endpoint (POST /mcp)
- ✅ Simpler client/server code
- ✅ Better for serverless (Vercel, Lambda)
- ✅ Handles session management
- ✅ Official transport in SDK v1.x

**SSE Drawbacks**:
- ❌ Deprecated
- ❌ Requires GET + POST endpoints
- ❌ More complex implementation
- ❌ May be removed in future SDK versions

### Q: What's the priority?

**Recommendation**:

1. **Phase 1** (HIGH) - SDK upgrade enables everything else
2. **Phase 3** (QUICK WIN) - Fix docs to match reality
3. **Phase 2** (MEDIUM) - Implement missing features
4. **Phase 4** (LOW) - Tests & quality
5. **Phase 5** (OPTIONAL) - Nice-to-have features

### Q: Will this break existing clients?

**HTTP Transport**: Yes, if you migrate from custom handler to StreamableHTTPServerTransport, the response format may change slightly. But if clients are using standard MCP protocol, they should work.

**stdio Transport**: Minimal changes, mostly internal refactoring.

**Recommendation**: Version your API endpoints during migration (`/api/mcp` → `/api/mcp-v2`)

### Q: How long will this take?

| Phase | Effort | Timeline |
|-------|--------|----------|
| Phase 1 | 6-10 hours | 2-3 days |
| Phase 2 | 8-12 hours | 3-4 days |
| Phase 3 | 1-2 hours | 1 day |
| Phase 4 | 10-15 hours | 4-5 days |
| **Total** | **25-39 hours** | **2-3 weeks** |

---

## Success Metrics

**After Implementation**:

- ✅ SDK version: v1.20.1 (latest)
- ✅ McpServer API: Used everywhere
- ✅ StreamableHTTPServerTransport: Replaces custom handler
- ✅ Code reduction: 200+ lines → ~50 lines
- ✅ Prompts: 3 workflows registered
- ✅ Completions: SCAC autocomplete working
- ✅ Zod schemas: All 7 tools validated
- ✅ Test coverage: 80%+
- ✅ Documentation: Accurate & complete

**Performance**:
- No degradation in response times
- Better error messages
- Improved type safety

---

## Next Steps

1. **Review & Approve Plan** - Decide on migration strategy
2. **Create Feature Branch** - `feature/mcp-v2-sdk-upgrade`
3. **Start with Phase 1** - SDK upgrade unlocks everything
4. **Iterative Development** - Test each phase thoroughly
5. **Update Docs** - Keep in sync with implementation

---

## References

- [MCP TypeScript SDK Docs](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification](https://modelcontextprotocol.io/specification/latest)
- [StreamableHTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)
- [SSE Deprecation Notice](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#backwards-compatibility)

---

**Prepared by**: Claude Code
**Contact**: See GitHub issues for questions
