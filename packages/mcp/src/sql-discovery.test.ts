import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createAuthorizedTerminal49McpServer } from './server.js';

const sqlTools = [
  'sql_query',
  'describe_views',
  'query_guide',
  'get_query_result',
];
afterEach(() => vi.unstubAllGlobals());

async function inventory(
  token: string,
  account?: string,
  protocol = '2026-07-28',
) {
  const handler = createMcpHandler(
    () =>
      createAuthorizedTerminal49McpServer(token, 'https://api.test', account),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client(
    { name: 'discovery-test', version: '1.0.0' },
    {
      ...(protocol === '2026-07-28'
        ? { versionNegotiation: { mode: { pin: '2026-07-28' as const } } }
        : { supportedProtocolVersions: [protocol] }),
    },
  );
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('https://mcp.test'), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }),
    );
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await client.close();
    await handler.close();
  }
}

describe('account-aware SQL discovery', () => {
  it.each(['2026-07-28', '2024-10-07'])(
    'discovers eligible SQL tools over %s',
    async (protocol) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => Response.json({ views: [] })),
      );
      expect(
        await inventory('Bearer test-user', 'account-a', protocol),
      ).toEqual(expect.arrayContaining(sqlTools));
    },
  );

  it.each(['Token test-key', 'test-key'])(
    'hides SQL for API keys without probing: %s',
    async (token) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const names = await inventory(token, 'account-a');
      expect(names).toHaveLength(14);
      expect(names).not.toEqual(expect.arrayContaining(sqlTools));
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('requires an explicit active account', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await inventory('Bearer test-user')).toHaveLength(14);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('scopes every check by user and account and reflects revocation without a cached grant', async () => {
    let enabled = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        expect(request.url).toBe('https://api.test/v2/assistant_views');
        const allowed =
          enabled &&
          request.headers.get('x-account-id') === 'account-a' &&
          request.headers.get('authorization') === 'Bearer user-a';
        return Response.json(
          allowed ? { views: [] } : { error: 'Unavailable' },
          { status: allowed ? 200 : 403 },
        );
      }),
    );
    expect(await inventory('Bearer user-a', 'account-a')).toEqual(
      expect.arrayContaining(sqlTools),
    );
    expect(await inventory('Bearer user-a', 'account-b')).toHaveLength(14);
    expect(await inventory('Bearer user-b', 'account-a')).toHaveLength(14);
    enabled = false;
    expect(await inventory('Bearer user-a', 'account-a')).toHaveLength(14);
  });

  it.each([401, 403, 404, 429, 500])(
    'fails closed on %s without retries or breaking standard discovery',
    async (status) => {
      const fetch = vi.fn(async () =>
        Response.json({ error: 'Unavailable' }, { status }),
      );
      vi.stubGlobal('fetch', fetch);
      const server = await createAuthorizedTerminal49McpServer(
        'Bearer test-user',
        'https://api.test',
        'account-a',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
      await server.close();
      expect(await inventory('Bearer test-user', 'account-a')).toHaveLength(14);
    },
  );

  it('fails closed on a malformed success or network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({})),
    );
    expect(await inventory('Bearer test-user', 'account-a')).toHaveLength(14);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Unavailable');
      }),
    );
    expect(await inventory('Bearer test-user', 'account-a')).toHaveLength(14);
  });
});
