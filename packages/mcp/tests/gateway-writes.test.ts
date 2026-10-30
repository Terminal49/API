/**
 * Runs a tier C write through the real HTTP gateway handler on the WorkOS
 * path, where every request resolves the caller's token again.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { fakeApiFetch } from '../src/test/fake-api.js';
import {
  TEST_CONFIRMATION_SECRET,
  tokenOf,
} from '../src/test/write-context.js';

const ACCOUNT_ID = 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a';
const USER_ID = '5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d';
const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';

function meBody() {
  return {
    data: {
      id: USER_ID,
      type: 'user',
      attributes: {
        kind: 'user',
        channel: 'mcp',
        features: { stop_tracking: { status: 'available' } },
      },
      relationships: {
        account: { data: { id: ACCOUNT_ID, type: 'account' } },
        user: { data: { id: USER_ID, type: 'user' } },
      },
    },
    included: [
      {
        id: ACCOUNT_ID,
        type: 'account',
        attributes: { company_name: 'Acme Logistics' },
      },
      {
        id: USER_ID,
        type: 'user',
        attributes: { email: 'ops@example.com' },
        relationships: {
          accounts: { data: [{ id: ACCOUNT_ID, type: 'account' }] },
        },
      },
    ],
  };
}

function apiRoutes() {
  let stoppedAt: string | null = null;
  const shipment = () => ({
    body: {
      data: {
        id: SHIPMENT_ID,
        type: 'shipment',
        attributes: {
          bill_of_lading_number: 'MAEU123456789',
          shipping_line_scac: 'MAEU',
          line_tracking_stopped_at: stoppedAt,
          line_tracking_stopped_reason: null,
        },
        relationships: { containers: { data: [] } },
      },
    },
  });
  return {
    'GET /me': { body: meBody() },
    [`GET /shipments/${SHIPMENT_ID}`]: shipment,
    [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: () => {
      stoppedAt = '2026-10-17T12:00:00Z';
      return shipment();
    },
  };
}

/** Serves api/mcp.ts with the request and response helpers Vercel adds. */
async function serveGateway(): Promise<{ url: URL; server: Server }> {
  const { default: handler } = await import('../../../api/mcp.ts');
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString('utf8');
    Object.assign(req, { body: text ? JSON.parse(text) : undefined });
    Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(payload: unknown) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(payload));
      },
    });
    // SAFETY: the request and response now carry the Vercel helpers the
    // handler uses.
    await handler(req as never, res as never);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: new URL(`http://127.0.0.1:${port}/mcp`), server };
}

describe('tier C writes through the WorkOS gateway path', () => {
  let server: Server | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('T49_MCP_AUTHKIT_ENABLED', 'true');
    vi.stubEnv('T49_CONNECTED_CLIENTS_RESOLVE_SECRET', 'resolve-secret');
    vi.stubEnv('T49_API_BASE_URL', 'https://api.test/v2');
    vi.stubEnv('WORKOS_MCP_RESOURCE', 'https://mcp.test');
    vi.stubEnv(
      'T49_MCP_TOOLSETS',
      'core,operations,tracking_lifecycle,reference_numbers',
    );
    vi.stubEnv('T49_MCP_CONFIRMATION_SECRET', TEST_CONFIRMATION_SECRET);
  });

  afterEach(async () => {
    await new Promise((resolve) => server?.close(resolve) ?? resolve(null));
    server = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('confirms a preview when each request resolves a different access token', async () => {
    const realFetch = globalThis.fetch;
    const api = fakeApiFetch(apiRoutes());
    let resolves = 0;
    const apiCredentials: string[] = [];
    vi.stubGlobal(
      'fetch',
      async (input: Request | URL | string, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.hostname === '127.0.0.1') return realFetch(input, init);
        if (url.pathname === '/v2/connected-clients/resolve') {
          resolves += 1;
          return Response.json({
            data: {
              attributes: {
                access_token: `terminal49-jwt-${resolves}`,
                account_id: ACCOUNT_ID,
              },
            },
          });
        }
        const request = new Request(input, init);
        apiCredentials.push(request.headers.get('Authorization') ?? '');
        return api.fetch(request);
      },
    );
    const gateway = await serveGateway();
    server = gateway.server;

    const call = async (args: Record<string, unknown>) => {
      const client = new Client({ name: 'gateway-test', version: '1.0.0' });
      await client.connect(
        new StreamableHTTPClientTransport(gateway.url, {
          requestInit: {
            headers: { Authorization: 'Bearer workos-access-token' },
          },
        }),
      );
      try {
        return await client.callTool({
          name: 'stop_shipment_tracking',
          arguments: args,
        });
      } finally {
        await client.close();
      }
    };

    const preview = await call({ shipment_id: SHIPMENT_ID });
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
    });

    const stopped = await call({
      shipment_id: SHIPMENT_ID,
      confirmation_token: tokenOf(preview.structuredContent),
    });

    expect(stopped.structuredContent).toMatchObject({ status: 'stopped' });
    // The preview and the confirmation reached Terminal49 with different
    // bearer tokens.
    expect(new Set(apiCredentials).size).toBe(2);
  });

  it('asks the user through a client that declares form elicitation, across two gateway requests', async () => {
    const realFetch = globalThis.fetch;
    const api = fakeApiFetch(apiRoutes());
    let resolves = 0;
    vi.stubGlobal(
      'fetch',
      async (input: Request | URL | string, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : input);
        if (url.hostname === '127.0.0.1') return realFetch(input, init);
        if (url.pathname === '/v2/connected-clients/resolve') {
          resolves += 1;
          return Response.json({
            data: {
              attributes: {
                access_token: `terminal49-jwt-${resolves}`,
                account_id: ACCOUNT_ID,
              },
            },
          });
        }
        return api.fetch(new Request(input, init));
      },
    );
    const gateway = await serveGateway();
    server = gateway.server;
    const client = new Client(
      { name: 'gateway-test', version: '1.0.0' },
      {
        versionNegotiation: { mode: { pin: '2026-07-28' } },
        capabilities: { elicitation: { form: {} } },
      },
    );
    const asked = vi.fn(async () => ({
      action: 'accept' as const,
      content: { confirm: true },
    }));
    client.setRequestHandler('elicitation/create', asked);
    await client.connect(
      new StreamableHTTPClientTransport(gateway.url, {
        requestInit: {
          headers: { Authorization: 'Bearer workos-access-token' },
        },
      }),
    );

    try {
      const resolvedBeforeCall = resolves;
      const stopped = await client.callTool({
        name: 'stop_shipment_tracking',
        arguments: { shipment_id: SHIPMENT_ID },
      });

      expect(stopped.structuredContent).toMatchObject({ status: 'stopped' });
      expect(asked).toHaveBeenCalledOnce();
      expect(
        api.requests.filter((request) => request.method === 'PATCH'),
      ).toHaveLength(1);
      // The question and the answer were two gateway requests, each resolved
      // on its own.
      expect(resolves - resolvedBeforeCall).toBe(2);
    } finally {
      await client.close();
    }
  });
});
