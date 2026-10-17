import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { Terminal49Client, Terminal49Error } from '@terminal49/sdk';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';
import { executeSqlQuery, sqlToolResult } from './tools/sql-query.js';

const id = '11111111-1111-4111-8111-111111111111';
const preview = {
  result_id: id,
  expires_at: '2026-01-02T00:00:00Z',
  columns: ['count'],
  column_types: ['bigint'],
  rows: [[12]],
  preview_row_count: 1,
  row_count: 1,
  total_count: null,
  truncated: true,
  row_limit: 1,
};

async function connect(
  token = 'Bearer delegated-test',
  account = 'account-test',
) {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer(
        token,
        'https://api.test',
        account,
        {},
        { assistantSql: true },
      ),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client(
    { name: 'sql-tools-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  return {
    client,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('SQL MCP transport', () => {
  it('discovers all four tools and carries snapshot identity, caps and paging through the SDK', async () => {
    const calls: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Request) => {
        calls.push(input.clone());
        const url = new URL(input.url);
        if (url.pathname === '/v2/assistant_queries')
          return Response.json(preview);
        if (url.pathname === `/v2/assistant_queries/${id}`)
          return Response.json({
            ...preview,
            offset: 0,
            page_row_count: 1,
            next_offset: null,
          });
        if (url.pathname === '/v2/assistant_views')
          return Response.json({ views: [] });
        if (url.pathname === '/v2/assistant_views/assistant_containers')
          return Response.json({ name: 'assistant_containers', columns: [] });
        if (url.pathname === '/v2/assistant_guides')
          return Response.json({ guides: [] });
        return Response.json({
          topic: 'method',
          body: 'Define the measurement.',
        });
      }),
    );
    const session = await connect();
    try {
      const { tools } = await session.client.listTools();
      for (const name of [
        'sql_query',
        'describe_views',
        'query_guide',
        'get_query_result',
      ])
        expect(tools.some((tool) => tool.name === name)).toBe(true);
      expect(
        tools.find((tool) => tool.name === 'sql_query')?.annotations
          ?.idempotentHint,
      ).toBe(false);
      const description =
        tools.find((tool) => tool.name === 'sql_query')?.description ?? '';
      for (const guidance of [
        'Define the measurement',
        'zero rows are not proof',
        'Sanity-check totals',
        'authenticated CSV export',
        'never put credentials in a URL',
        'not this MCP server',
      ])
        expect(description).toContain(guidance);

      const result = await session.client.callTool({
        name: 'sql_query',
        arguments: { sql: ' SELECT count(*) FROM assistant_containers ' },
      });
      expect(result.structuredContent).toEqual(preview);
      expect(
        JSON.parse((result.content as { text: string }[])[0].text),
      ).toEqual(preview);
      await session.client.callTool({ name: 'describe_views', arguments: {} });
      await session.client.callTool({
        name: 'describe_views',
        arguments: {
          view: 'assistant_containers',
          columns: ['number'],
          search: 'port',
        },
      });
      await session.client.callTool({ name: 'query_guide', arguments: {} });
      await session.client.callTool({
        name: 'query_guide',
        arguments: { topic: 'method' },
      });
      const page = await session.client.callTool({
        name: 'get_query_result',
        arguments: { result_id: id },
      });
      expect(page.structuredContent).toMatchObject({
        result_id: id,
        next_offset: null,
        total_count: null,
        truncated: true,
      });
      expect(await calls[0].json()).toEqual({
        sql: 'SELECT count(*) FROM assistant_containers',
      });
      expect(calls[2].url).toContain('columns=number&search=port');
      expect(calls.at(-1)?.url).toContain('offset=0&limit=50');
      for (const request of calls) {
        expect(request.headers.get('authorization')).toBe(
          'Bearer delegated-test',
        );
        expect(request.headers.get('x-account-id')).toBe('account-test');
      }
    } finally {
      await session.close();
    }
  });

  it.each(['Last Free Day', 'Container_Status', 'holds-and-pickup-readiness'])(
    'accepts and encodes guide alias %s',
    async (topic) => {
      const fetchMock = vi.fn(async (request: Request) => {
        expect(new URL(request.url).pathname).toBe(
          `/v2/assistant_guides/${encodeURIComponent(topic)}`,
        );
        return Response.json({ topic: 'canonical-topic', body: 'Guide' });
      });
      vi.stubGlobal('fetch', fetchMock);
      const session = await connect();
      try {
        const result = await session.client.callTool({
          name: 'query_guide',
          arguments: { topic },
        });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual({
          topic: 'canonical-topic',
          body: 'Guide',
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        await session.close();
      }
    },
  );

  it.each([
    ['sql_query', { sql: '' }],
    ['sql_query', { sql: 'x'.repeat(8001) }],
    ['sql_query', { sql: 'SELECT 1', account_id: 'other' }],
    ['describe_views', { view: '../users' }],
    ['query_guide', { topic: '../secret' }],
    ['query_guide', { topic: 'x'.repeat(65) }],
    ['query_guide', { topic: ' ' }],
    ['query_guide', { topic: 'topic?other=value' }],
    ['get_query_result', { result_id: id, limit: 101 }],
    ['get_query_result', { result_id: id, offset: -1 }],
  ])(
    'rejects invalid %s arguments without contacting Rails',
    async (name, args) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const session = await connect();
      try {
        const result = await session.client.callTool({
          name: name as string,
          arguments: args as Record<string, unknown>,
        });
        expect(result.isError).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        await session.close();
      }
    },
  );

  it.each([401, 403, 404, 409, 422, 429, 500])(
    'returns actionable %s errors without retries or raw server details',
    async (status) => {
      const fetchMock = vi.fn(async () =>
        Response.json(
          {
            error:
              status === 422
                ? 'Unknown column; inspect describe_views'
                : 'SENSITIVE_UPSTREAM_DETAIL',
            retry_after: 12,
          },
          { status },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      const session = await connect(
        status === 401 ? 'ordinary-api-key' : 'Bearer delegated-test',
      );
      try {
        const result = await session.client.callTool({
          name: 'sql_query',
          arguments: { sql: 'SELECT 1' },
        });
        expect(result.isError).toBe(true);
        expect(result.structuredContent).toMatchObject({ status });
        expect(JSON.stringify(result)).not.toContain(
          'SENSITIVE_UPSTREAM_DETAIL',
        );
        if (status === 422)
          expect(JSON.stringify(result)).toContain('Unknown column');
        if (status === 429)
          expect(result.structuredContent).toMatchObject({ retry_after: 12 });
        if (status === 500)
          expect(JSON.stringify(result)).toContain('do not rewrite');
        expect(fetchMock).toHaveBeenCalledTimes(1);
      } finally {
        await session.close();
      }
    },
  );

  it('rejects a missing active account before any upstream request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const session = await connect('Bearer delegated-test', '');
    try {
      const result = await session.client.callTool({
        name: 'sql_query',
        arguments: { sql: 'SELECT 1' },
      });
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      await session.close();
    }
  });

  it('does not retry metadata reads on rate limits', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: 'Wait', retry_after: 10 }, { status: 429 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const session = await connect();
    try {
      expect(
        (
          await session.client.callTool({
            name: 'describe_views',
            arguments: {},
          })
        ).structuredContent,
      ).toMatchObject({ retry_after: 10 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      await session.close();
    }
  });
});

describe('SQL concurrent request coalescing', () => {
  it('shares only identical in-flight requests and clones results; later requests run again', async () => {
    let release!: (value: typeof preview) => void;
    const query = vi.fn(
      () =>
        new Promise<typeof preview>((resolve) => {
          release = resolve;
        }),
    );
    const client = {
      assistantQueries: { query },
    } as unknown as Terminal49Client;
    const a = executeSqlQuery('SELECT 1', client, 'same-scope');
    const b = executeSqlQuery('SELECT 1', client, 'same-scope');
    expect(query).toHaveBeenCalledTimes(1);
    release(preview);
    const [first, second] = await Promise.all([a, b]);
    first.rows[0][0] = 999;
    expect(second.rows[0][0]).toBe(12);
    const later = executeSqlQuery('SELECT 1', client, 'same-scope');
    expect(query).toHaveBeenCalledTimes(2);
    release(preview);
    await later;
  });

  it('isolates different credentials/accounts/endpoints and SQL; cleans up failures', async () => {
    const query = vi.fn().mockRejectedValue(new Terminal49Error('failed', 500));
    const client = {
      assistantQueries: { query },
    } as unknown as Terminal49Client;
    await Promise.all([
      executeSqlQuery('SELECT 1', client, 'scope-one').catch(() => null),
      executeSqlQuery('SELECT 1', client, 'scope-two').catch(() => null),
      executeSqlQuery('SELECT 2', client, 'scope-one').catch(() => null),
    ]);
    expect(query).toHaveBeenCalledTimes(3);
    await expect(
      executeSqlQuery('SELECT 1', client, 'scope-one'),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('never exposes network or unexpected errors', async () => {
    const result = await sqlToolResult(async () => {
      throw new Error('SECRET SQL AND TOKEN');
    });
    expect(JSON.stringify(result)).not.toContain('SECRET');
    expect(result.isError).toBe(true);
  });
});
