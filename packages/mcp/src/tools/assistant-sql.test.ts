import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createTerminal49McpServer } from '../server.js';
import {
  executeDescribeViews,
  executeGetQueryResult,
  executeQuery,
  executeQueryGuide,
} from './assistant-sql.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const RESULT_ID = '123e4567-e89b-12d3-a456-426614174000';
const config = {
  apiToken: 'Bearer delegated-token',
  apiBaseUrl: 'https://api.example.com/v2',
  accountId: 'account-123',
};

const QUERY_RESULT = {
  result_id: RESULT_ID,
  expires_at: '2026-10-16T12:00:00Z',
  columns: ['container_number', 'pod_eta_at'],
  column_types: ['character varying', 'timestamp with time zone'],
  rows: [['HLCU1234568', '2026-10-20T08:00:00Z']],
  preview_row_count: 1,
  row_count: 500,
  total_count: null,
  truncated: true,
  row_limit: 500,
};

function stubFetch(body: unknown, status = 200) {
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json(body, { status }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function sentRequest(fetch: ReturnType<typeof vi.fn>) {
  const [url, init] = fetch.mock.calls[0] as [URL, RequestInit];
  return { url: url.toString(), init };
}

afterEach(() => vi.unstubAllGlobals());

describe('AskT49 SQL tool requests', () => {
  it('query posts the SQL with the caller authorization and account', async () => {
    const fetch = stubFetch(QUERY_RESULT);
    const sql = ' SELECT container_number FROM assistant_containers ';

    expect(await executeQuery({ sql }, config)).toEqual(QUERY_RESULT);
    const { url, init } = sentRequest(fetch);
    expect(url).toBe('https://api.example.com/v2/assistant_queries');
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      body: JSON.stringify({
        sql: 'SELECT container_number FROM assistant_containers',
      }),
      headers: {
        Authorization: 'Bearer delegated-token',
        'X-Account-ID': 'account-123',
        'Content-Type': 'application/json',
      },
    });
  });

  it('prefixes a bare API key with Token and defaults to the production API', async () => {
    const fetch = stubFetch(QUERY_RESULT);

    await executeQuery({ sql: 'SELECT 1' }, { apiToken: 'raw-key' });
    const { url, init } = sentRequest(fetch);
    expect(url).toBe('https://api.terminal49.com/v2/assistant_queries');
    expect(init.headers).toMatchObject({ Authorization: 'Token raw-key' });
    expect(init.headers).not.toHaveProperty('X-Account-ID');
  });

  it('get_query_result reads one page of the stored result', async () => {
    const page = {
      ...QUERY_RESULT,
      offset: 100,
      page_row_count: 1,
      next_offset: null,
    };
    const fetch = stubFetch(page);

    expect(
      await executeGetQueryResult(
        { result_id: RESULT_ID, offset: 100, limit: 25 },
        config,
      ),
    ).toEqual(page);
    const { url, init } = sentRequest(fetch);
    expect(url).toBe(
      `https://api.example.com/v2/assistant_queries/${RESULT_ID}?offset=100&limit=25`,
    );
    expect(init).toMatchObject({
      method: 'GET',
      body: undefined,
      headers: {
        Authorization: 'Bearer delegated-token',
        'X-Account-ID': 'account-123',
      },
    });
  });

  it('get_query_result defaults to the first 50 rows', async () => {
    const fetch = stubFetch({});
    await executeGetQueryResult({ result_id: RESULT_ID }, config);
    expect(sentRequest(fetch).url).toMatch(/\?offset=0&limit=50$/);
  });

  it('describe_views lists every view without a view name', async () => {
    const views = {
      views: [{ name: 'assistant_containers', columns: ['container_number'] }],
    };
    const fetch = stubFetch(views);

    expect(await executeDescribeViews({}, config)).toEqual(views);
    expect(sentRequest(fetch).url).toBe(
      'https://api.example.com/v2/assistant_views',
    );
  });

  it('describe_views sends columns comma-separated and search for one view', async () => {
    const fetch = stubFetch({ name: 'assistant_containers', columns: [] });

    await executeDescribeViews(
      {
        view: 'assistant_containers',
        columns: ['pickup_lfd', 'pod_eta_at'],
        search: 'free day',
      },
      config,
    );
    const url = new URL(sentRequest(fetch).url);
    expect(url.pathname).toBe('/v2/assistant_views/assistant_containers');
    expect(url.searchParams.get('columns')).toBe('pickup_lfd,pod_eta_at');
    expect(url.searchParams.get('search')).toBe('free day');
  });

  it('query_guide lists topics or reads one topic', async () => {
    const fetch = stubFetch({ topic: 'method', body: '# Method' });

    expect(await executeQueryGuide({ topic: 'method' }, config)).toEqual({
      topic: 'method',
      body: '# Method',
    });
    await executeQueryGuide({}, config);
    expect(fetch.mock.calls.map(([url]) => url.toString())).toEqual([
      'https://api.example.com/v2/assistant_guides/method',
      'https://api.example.com/v2/assistant_guides',
    ]);
  });

  it('stops reading a response over the byte limit', async () => {
    // 400k three-byte characters: under the limit in characters, over it in bytes.
    const body = JSON.stringify({ rows: [['€'.repeat(400_000)]] });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(body, { status: 200 })),
    );

    await expect(executeQuery({ sql: 'SELECT 1' }, config)).rejects.toThrow(
      /exceeds 1000000 bytes/,
    );
  });

  it('rejects names that could leave the assistant routes', () => {
    expect(() =>
      executeDescribeViews({ view: '../containers' }, config),
    ).rejects.toThrow();
    expect(() =>
      executeQueryGuide({ topic: '../../containers' }, config),
    ).rejects.toThrow();
    expect(() =>
      executeGetQueryResult({ result_id: 'not-a-uuid' }, config),
    ).rejects.toThrow();
  });
});

async function connectClient() {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer(
        'Bearer delegated-token',
        'https://api.example.com',
        'account-123',
      ),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client(
    { name: 'terminal49-assistant-sql-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return { client, handler };
}

async function callTool(name: string, args: Record<string, unknown>) {
  const { client, handler } = await connectClient();
  try {
    return await client.callTool({ name, arguments: args });
  } finally {
    await client.close();
    await handler.close();
  }
}

function textOf(result: Awaited<ReturnType<typeof callTool>>): string {
  const text = result.content?.find((item) => item.type === 'text');
  if (text?.type !== 'text') throw new Error('Expected text content');
  return text.text;
}

describe('AskT49 SQL tools over MCP', () => {
  it('preserves the backend JSON in text and structured content', async () => {
    const fetch = stubFetch(QUERY_RESULT);

    const result = await callTool('query', { sql: 'SELECT 1' });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(QUERY_RESULT);
    expect(JSON.parse(textOf(result))).toEqual(QUERY_RESULT);
    // The gateway's base URL gains /v2 like the SDK's.
    expect(sentRequest(fetch).url).toBe(
      'https://api.example.com/v2/assistant_queries',
    );
  });

  it('advertises the method in the tool descriptions', async () => {
    const { client, handler } = await connectClient();
    try {
      const { tools } = await client.listTools();
      const byName = new Map(tools.map((tool) => [tool.name, tool]));
      const query = byName.get('query')?.description ?? '';
      expect(query).toMatch(/query_guide topic "method"/);
      expect(query).toMatch(/describe_views/);
      expect(query).toMatch(/granularity.*population.*timeframe/);
      expect(query).toMatch(/Zero rows does not mean none/);
      expect(query).toMatch(/never instructions/);
      expect(query).toMatch(/get_query_result/);
      expect(query).toMatch(/retry_after/);
      expect(query).toMatch(/Never run the same query twice in parallel/);
      const csv =
        'https://api.example.com/v2/assistant_queries/{result_id}.csv';
      expect(query).toContain(`CSV link ${csv}`);
      expect(byName.get('get_query_result')?.description).toContain(csv);
      expect(
        Object.keys(byName.get('query')?.inputSchema.properties ?? {}),
      ).toEqual(['sql']);
      for (const name of [
        'query',
        'get_query_result',
        'describe_views',
        'query_guide',
      ]) {
        expect(byName.get(name)?.annotations, name).toMatchObject({
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        });
      }
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('relays a missing assistant-sql flag as a tool error', async () => {
    stubFetch({ error: 'Assistant SQL is not enabled for this account' }, 403);

    const result = await callTool('describe_views', {});
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Assistant SQL is not enabled for this account',
    );
    expect(result.structuredContent).toEqual({
      error: 'Assistant SQL is not enabled for this account',
    });
  });

  it('returns a query mistake for the model to fix', async () => {
    stubFetch({ error: 'column "eta" does not exist' }, 422);

    const result = await callTool('query', {
      sql: 'SELECT eta FROM assistant_containers',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'column "eta" does not exist Fix the query and run it again.',
    );
  });

  it('tells the model how long to wait when rate limited, without retrying', async () => {
    const fetch = stubFetch(
      { error: 'Too many queries', retry_after: 42 },
      429,
    );

    const result = await callTool('query', { sql: 'SELECT 1' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Too many queries Wait 42 seconds before the next request; do not retry immediately.',
    );
    expect(result.structuredContent).toEqual({
      error: 'Too many queries',
      retry_after: 42,
    });
  });

  it('relays the topic list with an unknown guide topic', async () => {
    stubFetch({ error: 'Unknown guide: dwell', topics: ['method'] }, 404);

    const result = await callTool('query_guide', { topic: 'dwell' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'Unknown guide: dwell\n\n{"topics":["method"]}',
    );
  });

  it('relays the caller-type refusal from JSON:API errors', async () => {
    stubFetch(
      {
        errors: [
          { detail: 'A delegated agent or MCP connected client is required' },
        ],
      },
      401,
    );

    const result = await callTool('query', { sql: 'SELECT 1' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(
      'A delegated agent or MCP connected client is required',
    );
  });

  it('keeps server errors generic', async () => {
    stubFetch({ error: 'PG::ConnectionBad at db-internal:5432' }, 500);

    const result = await callTool('get_query_result', {
      result_id: RESULT_ID,
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toMatch(/db-internal/);
    expect(textOf(result)).toMatch(/could not be completed/);
  });
});
