import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  servers: [] as any[],
  transports: [] as any[],
  handleRequestImpl: undefined as
    | ((req: unknown, res: unknown, body: unknown) => Promise<void>)
    | undefined,
}));

vi.mock('./server.js', () => ({
  createTerminal49McpServer: vi.fn(() => {
    const server = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockState.servers.push(server);
    return server;
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class MockStreamableHTTPServerTransport {
    handleRequest: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;

    constructor() {
      this.handleRequest = vi.fn(async (req: unknown, res: unknown, body: unknown) => {
        if (mockState.handleRequestImpl) {
          await mockState.handleRequestImpl(req, res, body);
        }
      });
      this.close = vi.fn().mockResolvedValue(undefined);

      mockState.transports.push(this);
    }
  },
}));

class MockResponse extends EventEmitter {
  headersSent = false;
  statusCode = 200;
  payload: unknown = undefined;
  headers: Record<string, string> = {};

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown): void {
    this.payload = payload;
    this.headersSent = true;
    this.emit('finish');
  }

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  end(): void {
    this.headersSent = true;
    this.emit('finish');
  }
}

function createRequest(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const overrideHeaders = (overrides.headers as Record<string, string | string[] | undefined>) ?? {};

  return {
    method: 'POST',
    headers: {
      host: 'localhost',
      authorization: 'Bearer test-token',
      ...overrideHeaders,
    },
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    ...overrides,
  };
}

describe('api/mcp handler lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockState.servers.length = 0;
    mockState.transports.length = 0;
    mockState.handleRequestImpl = undefined;
    delete process.env.T49_API_TOKEN;
    delete process.env.T49_API_BASE_URL;
    delete process.env.T49_MCP_ALLOWED_HOSTS;
    delete process.env.T49_MCP_ALLOWED_ORIGINS;
  });

  it('closes transport and server after successful request handling', async () => {
    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest();
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(mockState.servers).toHaveLength(1);
    expect(mockState.transports).toHaveLength(1);

    const server = mockState.servers[0];
    const transport = mockState.transports[0];

    expect(server.connect).toHaveBeenCalledWith(transport);
    expect(transport.handleRequest).toHaveBeenCalledWith(req, res, req.body);
    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('returns 500 and still closes transport and server when handler throws', async () => {
    mockState.handleRequestImpl = async () => {
      throw new Error('simulated failure');
    };

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest();
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toMatchObject({
      error: { code: -32603, message: 'Internal server error', data: 'simulated failure' },
      id: null,
      jsonrpc: '2.0',
    });

    const server = mockState.servers[0];
    const transport = mockState.transports[0];
    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
  });

  it('runs cleanup only once when response closes before finally executes', async () => {
    mockState.handleRequestImpl = async (_req, res) => {
      (res as EventEmitter).emit('close');
    };

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest();
    const res = new MockResponse();

    await handler(req as any, res as any);

    const server = mockState.servers[0];
    const transport = mockState.transports[0];
    expect(transport.close).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalledTimes(1);
  });
});
