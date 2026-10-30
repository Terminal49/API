import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import handler from '../../../api/mcp.ts';
import { MINTLIFY_SEARCH_API_URL } from '../src/tools/search-docs.js';

const nativeFetch = globalThis.fetch;
const ENV = [
  'T49_API_TOKEN',
  'T49_MCP_CLIENT_SECRET',
  'T49_MCP_AUTHKIT_ENABLED',
  'T49_MCP_TOOLSETS',
  'T49_MCP_ALLOWED_HOSTS',
  'T49_MCP_ALLOWED_ORIGINS',
  'T49_API_BASE_URL',
  'MINTLIFY_ASSISTANT_API_KEY',
  'POSTHOG_ENABLED',
  'SENTRY_ENABLED',
];

describe('paid documentation search through the native HTTP gateway', () => {
  beforeEach(() => {
    for (const name of ENV) vi.stubEnv(name, '');
    vi.stubEnv('T49_API_BASE_URL', 'https://api.test/v2');
    vi.stubEnv('MINTLIFY_ASSISTANT_API_KEY', 'mint_dsc_dummy');
    vi.stubEnv('POSTHOG_ENABLED', 'false');
    vi.stubEnv('SENTRY_ENABLED', 'false');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function call(authorization?: string) {
    const server = createServer((req, res) => {
      const response: Parameters<typeof handler>[1] = Object.assign(res, {
        status(code: number): Parameters<typeof handler>[1] {
          res.statusCode = code;
          return response;
        },
        json(payload: unknown): void {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(payload));
        },
      });
      void handler(req, response).catch(() => res.destroy());
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    try {
      return await nativeFetch(`http://127.0.0.1:${address.port}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2025-06-18',
          ...(authorization ? { Authorization: authorization } : {}),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'search_docs', arguments: { query: 'webhooks' } },
        }),
      }).then(async (response) => {
        const text = await response.text();
        const data = text.split('\n').find((line) => line.startsWith('data:'));
        return {
          status: response.status,
          body: JSON.parse(data ? data.slice(5) : text),
        };
      });
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }

  function upstream(acceptIdentity: boolean) {
    const requests: Request[] = [];
    vi.stubGlobal(
      'fetch',
      async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        if (request.url === 'https://api.test/v2/me') {
          return acceptIdentity
            ? Response.json({
                data: {
                  id: 'dummy-key',
                  type: 'credential',
                  attributes: { kind: 'api_key', channel: 'api', features: {} },
                  relationships: {
                    account: { data: { type: 'account', id: 'dummy-account' } },
                  },
                },
                included: [
                  {
                    id: 'dummy-account',
                    type: 'account',
                    attributes: { company_name: 'Example' },
                  },
                ],
              })
            : Response.json(
                { errors: [{ title: 'Unauthorized', status: '401' }] },
                { status: 401 },
              );
        }
        if (request.url === MINTLIFY_SEARCH_API_URL) return Response.json([]);
        throw new Error('Unexpected upstream request');
      },
    );
    return requests;
  }

  it('rejects a bogus pass-through token before spending the operator key', async () => {
    const requests = upstream(false);
    const response = await call('Token dummy-invalid');
    expect(response.body.result.isError).toBe(true);
    expect(requests.map((request) => request.url)).toEqual([
      'https://api.test/v2/me',
    ]);
  });

  it('checks a valid identity before the paid request', async () => {
    const requests = upstream(true);
    const response = await call('Token dummy-valid');
    expect(response.body.result.isError).not.toBe(true);
    expect(requests.map((request) => request.url)).toEqual([
      'https://api.test/v2/me',
      MINTLIFY_SEARCH_API_URL,
    ]);
    expect(requests[0].headers.get('authorization')).toBe('Token dummy-valid');
    expect(requests[1].headers.get('authorization')).toBe(
      'Bearer mint_dsc_dummy',
    );
  });

  it('rejects missing credentials without contacting either provider', async () => {
    const requests = upstream(true);
    expect((await call()).status).toBe(401);
    expect(requests).toEqual([]);
  });

  it('preserves shared-client authentication and validates the configured upstream key', async () => {
    vi.stubEnv('T49_API_TOKEN', 'dummy-upstream');
    vi.stubEnv('T49_MCP_CLIENT_SECRET', 'dummy-client');
    const requests = upstream(true);
    expect((await call('Token dummy-wrong')).status).toBe(401);
    expect(requests).toEqual([]);
    expect((await call('Token dummy-client')).body.result.isError).not.toBe(
      true,
    );
    expect(requests[0].headers.get('authorization')).toBe(
      'Token dummy-upstream',
    );
    expect(requests.map((request) => request.url)).toEqual([
      'https://api.test/v2/me',
      MINTLIFY_SEARCH_API_URL,
    ]);
  });
});
