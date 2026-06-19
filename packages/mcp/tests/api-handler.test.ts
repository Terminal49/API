import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  servers: [] as any[],
  transports: [] as any[],
  serverCreateArgs: [] as Array<{
    apiToken: string;
    apiBaseUrl: string | undefined;
    accountId: string | undefined;
  }>,
  handleRequestImpl: undefined as
    | ((req: unknown, res: unknown, body: unknown) => Promise<void>)
    | undefined,
}));

vi.mock('../src/server.js', () => ({
  createTerminal49McpServer: vi.fn((apiToken: string, apiBaseUrl?: string, accountId?: string) => {
    const server = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    mockState.serverCreateArgs.push({ apiToken, apiBaseUrl, accountId });
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
    vi.unstubAllGlobals();
    mockState.servers.length = 0;
    mockState.transports.length = 0;
    mockState.serverCreateArgs.length = 0;
    mockState.handleRequestImpl = undefined;
    delete process.env.T49_API_TOKEN;
    delete process.env.T49_MCP_CLIENT_SECRET;
    delete process.env.T49_MCP_AUTHKIT_ENABLED;
    delete process.env.T49_CONNECTED_CLIENTS_RESOLVE_SECRET;
    delete process.env.T49_MCP_RESOLVE_SECRET;
    delete process.env.T49_MCP_RESOURCE_URL;
    delete process.env.WORKOS_MCP_RESOURCE;
    delete process.env.WORKOS_AUTHORIZATION_SERVER_URL;
    delete process.env.WORKOS_ISSUER;
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

    expect(mockState.serverCreateArgs[0]?.apiToken).toBe('test-token');
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

  it('accepts Authorization header using Token scheme', async () => {
    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: 'localhost',
        authorization: 'Token token-scheme-value',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(mockState.serverCreateArgs[0]?.apiToken).toBe('token-scheme-value');
  });

  it('allows requests without Host header when allow-list is not configured', async () => {
    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: undefined,
        authorization: 'Bearer test-token',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(mockState.servers).toHaveLength(1);
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 when Authorization header is absent even if T49_API_TOKEN is set', async () => {
    process.env.T49_API_TOKEN = 'env-token-value';

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: 'localhost',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({
      error: 'Unauthorized',
    });
    expect(mockState.servers).toHaveLength(0);
    expect(mockState.transports).toHaveLength(0);
  });

  it('uses T49_API_TOKEN as upstream credential when Authorization is present', async () => {
    process.env.T49_API_TOKEN = 'env-token-value';
    process.env.T49_MCP_CLIENT_SECRET = 'mcp-client-secret';

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: 'localhost',
        authorization: 'Bearer mcp-client-secret',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(mockState.serverCreateArgs[0]?.apiToken).toBe('env-token-value');
  });

  it('resolves WorkOS MCP bearer tokens into Terminal49 bearer account context', async () => {
    process.env.T49_MCP_AUTHKIT_ENABLED = 'true';
    process.env.T49_CONNECTED_CLIENTS_RESOLVE_SECRET = 'resolve-secret';
    process.env.T49_API_BASE_URL = 'https://api.test/v2';
    process.env.WORKOS_MCP_RESOURCE = 'https://mcp.test';
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            attributes: {
              access_token: 'terminal49-local-jwt',
              account_id: 'account-123',
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: 'localhost',
        authorization: 'Bearer workos-mcp-token',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v2/connected-clients/resolve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-T49-Connected-Clients-Resolve-Secret': 'resolve-secret',
        }),
        body: JSON.stringify({ access_token: 'workos-mcp-token' }),
      }),
    );
    expect(mockState.serverCreateArgs[0]).toMatchObject({
      apiToken: 'Bearer terminal49-local-jwt',
      apiBaseUrl: 'https://api.test/v2',
      accountId: 'account-123',
    });
  });

  it('returns a metadata challenge when WorkOS MCP resolve fails', async () => {
    process.env.T49_MCP_AUTHKIT_ENABLED = 'true';
    process.env.T49_CONNECTED_CLIENTS_RESOLVE_SECRET = 'resolve-secret';
    process.env.WORKOS_MCP_RESOURCE = 'https://mcp.test';
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'not connected' }), { status: 401 })),
    );

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: 'localhost',
        authorization: 'Bearer workos-mcp-token',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toContain('Bearer realm="mcp"');
    expect(res.headers['WWW-Authenticate']).toContain(
      'resource_metadata="https://mcp.test/.well-known/oauth-protected-resource"',
    );
    expect(mockState.servers).toHaveLength(0);
  });

  it('omits resource_metadata from the 401 challenge when WorkOS is not configured', async () => {
    // Token / client-secret deployment: no WORKOS_* env. Advertising OAuth
    // discovery would send clients to a PRM endpoint that 500s.
    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({ headers: { host: 'localhost' } });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toContain('Bearer realm="mcp"');
    expect(res.headers['WWW-Authenticate']).not.toContain('resource_metadata');
  });

  it('includes resource_metadata when AuthKit is enabled and WorkOS is configured', async () => {
    process.env.T49_MCP_AUTHKIT_ENABLED = 'true';
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test';
    process.env.WORKOS_MCP_RESOURCE = 'https://mcp.test';
    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({ headers: { host: 'localhost' } });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toContain(
      'resource_metadata="https://mcp.test/.well-known/oauth-protected-resource"',
    );
  });

  it('omits resource_metadata when WorkOS is configured but AuthKit is disabled', async () => {
    // WORKOS_* is set, but the Bearer resolver path is off — advertising OAuth
    // would make a client complete the flow then loop with an unresolved token.
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test';
    process.env.WORKOS_MCP_RESOURCE = 'https://mcp.test';
    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({ headers: { host: 'localhost' } });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).not.toContain('resource_metadata');
  });

  it('returns 502 (not 401) when the WorkOS resolve endpoint is unavailable', async () => {
    process.env.T49_MCP_AUTHKIT_ENABLED = 'true';
    process.env.T49_CONNECTED_CLIENTS_RESOLVE_SECRET = 'resolve-secret';
    process.env.WORKOS_MCP_RESOURCE = 'https://mcp.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'upstream down' }), { status: 503 })),
    );

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: { host: 'localhost', authorization: 'Bearer workos-mcp-token' },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    // A resolver outage must not be reported as an invalid token, or clients
    // discard a valid token and loop through re-auth instead of retrying.
    expect(res.statusCode).toBe(502);
    expect(res.headers['WWW-Authenticate']).toBeUndefined();
    expect(mockState.servers).toHaveLength(0);
  });

  it('returns 500 when AuthKit is enabled but the resolve secret is missing', async () => {
    process.env.T49_MCP_AUTHKIT_ENABLED = 'true';
    // No T49_CONNECTED_CLIENTS_RESOLVE_SECRET set — a server misconfiguration.
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: { host: 'localhost', authorization: 'Bearer workos-mcp-token' },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockState.servers).toHaveLength(0);
  });

  it('returns 401 when Authorization token does not match T49_MCP_CLIENT_SECRET', async () => {
    process.env.T49_API_TOKEN = 'env-token-value';
    process.env.T49_MCP_CLIENT_SECRET = 'expected-client-secret';

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: 'localhost',
        authorization: 'Bearer wrong-client-secret',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({
      error: 'Unauthorized',
      message: 'Invalid client credentials.',
    });
    expect(mockState.servers).toHaveLength(0);
    expect(mockState.transports).toHaveLength(0);
  });

  it('returns 500 when T49_API_TOKEN is set without T49_MCP_CLIENT_SECRET', async () => {
    process.env.T49_API_TOKEN = 'env-token-value';

    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: 'localhost',
        authorization: 'Bearer any-client-token',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(500);
    expect(res.payload).toMatchObject({
      error: 'Server misconfiguration',
    });
    expect(mockState.servers).toHaveLength(0);
    expect(mockState.transports).toHaveLength(0);
  });

  it('returns 401 when neither Authorization header nor T49_API_TOKEN is set', async () => {
    const { default: handler } = await import('../../../api/mcp.ts');
    const req = createRequest({
      headers: {
        host: 'localhost',
      },
    });
    const res = new MockResponse();

    await handler(req as any, res as any);

    expect(res.statusCode).toBe(401);
    expect(res.payload).toMatchObject({
      error: 'Unauthorized',
    });
    expect(mockState.servers).toHaveLength(0);
    expect(mockState.transports).toHaveLength(0);
  });
});
