import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  RateLimitError,
  Terminal49Client,
  UpstreamError,
  ValidationError,
  NotFoundError,
  type AssistantQueryPreview,
} from '@terminal49/sdk';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createTerminal49McpServer } from '../server.js';
import {
  discoverAssistantSql,
  executeSqlQuery,
  formatSqlToolError,
  resetSqlDiscoveryCache,
  sqlCallTimeoutMs,
} from './sql-query.js';

const PREVIEW: AssistantQueryPreview = {
  result_id: '00000000-0000-4000-8000-000000000001',
  expires_at: '2026-10-21T00:00:00Z',
  columns: ['pod', 'containers'],
  column_types: ['text', 'bigint'],
  rows: [['USLAX', 12]],
  row_count: 1,
  total_count: 1,
  truncated: false,
  row_limit: 500,
  preview_row_count: 1,
};

function fakeClient(query: (sql: string) => Promise<AssistantQueryPreview>) {
  return {
    assistantQueries: { query },
  } as unknown as Pick<Terminal49Client, 'assistantQueries'>;
}

describe('executeSqlQuery', () => {
  it('runs identical concurrent queries once and gives each caller its own copy', async () => {
    let release!: (value: AssistantQueryPreview) => void;
    const query = vi.fn(
      () =>
        new Promise<AssistantQueryPreview>((resolve) => (release = resolve)),
    );
    const client = fakeClient(query);

    const first = executeSqlQuery({ sql: 'select 1' }, client, 'scope-a');
    const second = executeSqlQuery({ sql: 'select 1' }, client, 'scope-a');
    release(PREVIEW);
    const [a, b] = await Promise.all([first, second]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(a).toEqual(PREVIEW);
    expect(a).not.toBe(b);
  });

  it('never shares a query across callers or once it finished', async () => {
    const query = vi.fn(async () => PREVIEW);
    const client = fakeClient(query);

    await Promise.all([
      executeSqlQuery({ sql: 'select 1' }, client, 'scope-a'),
      executeSqlQuery({ sql: 'select 1' }, client, 'scope-b'),
    ]);
    await executeSqlQuery({ sql: 'select 1' }, client, 'scope-a');

    expect(query).toHaveBeenCalledTimes(3);
  });
});

describe('sqlCallTimeoutMs', () => {
  it('counts the time sign-in and discovery already used against the request deadline', () => {
    const now = 1_000_000;
    expect(sqlCallTimeoutMs(undefined, now)).toBe(20_000);
    expect(sqlCallTimeoutMs(now + 60_000, now)).toBe(20_000);
    expect(sqlCallTimeoutMs(now + 12_000, now)).toBe(10_000);
    expect(sqlCallTimeoutMs(now - 5_000, now)).toBe(1_000);
  });
});

describe('formatSqlToolError', () => {
  it("passes through the API's messages written for the model", () => {
    expect(
      formatSqlToolError(
        new ValidationError('Function pg_sleep is not allowed', 422),
      ),
    ).toBe('Function pg_sleep is not allowed');
    expect(
      formatSqlToolError(
        new NotFoundError('Unknown guide. Available topics: method, lfd'),
      ),
    ).toBe('Unknown guide. Available topics: method, lfd');
  });

  it('asks the model to stop on a rate limit, with the wait', () => {
    expect(
      formatSqlToolError(
        new RateLimitError('Too many queries', 429, { retry_after: 20 }),
      ),
    ).toMatch(/^Rate limited\. Retry after 20 seconds\. .*stop querying/);
  });

  it('keeps other upstream failures generic', () => {
    expect(
      formatSqlToolError(
        new UpstreamError('PG::ConnectionBad at db-host', 500),
      ),
    ).toMatch(/^The query service failed\./);
    expect(formatSqlToolError(new Error('boom'))).toMatch(
      /^The query service failed\./,
    );
  });
});

describe('discoverAssistantSql', () => {
  beforeEach(() => resetSqlDiscoveryCache());
  afterEach(() => vi.unstubAllGlobals());

  function stubViews(response: () => Response | Promise<Response>) {
    const fetch = vi.fn(async () => response());
    vi.stubGlobal('fetch', fetch);
    return fetch;
  }

  it('needs an active account and does not ask the API without one', async () => {
    const fetch = stubViews(() => Response.json({ views: [] }));
    await expect(
      discoverAssistantSql('Bearer user', 'https://api.test/v2', undefined),
    ).resolves.toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lists the tools when the views load, and reuses the answer', async () => {
    const fetch = stubViews(() => Response.json({ views: [] }));
    for (let i = 0; i < 2; i++) {
      await expect(
        discoverAssistantSql('Bearer user', 'https://api.test/v2', 'acct'),
      ).resolves.toBe(true);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reuses the answer across requests by the caller's identity, not the per-request token", async () => {
    const fetch = stubViews(() => Response.json({ views: [] }));
    for (const minted of ['Bearer jwt-1', 'Bearer jwt-2', 'Bearer jwt-3']) {
      await expect(
        discoverAssistantSql(minted, 'https://api.test/v2', 'acct', {
          identity: 'Bearer oauth-token',
        }),
      ).resolves.toBe(true);
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the tools listed without asking when too little time is left', async () => {
    const fetch = stubViews(() => Response.json({ views: [] }));
    await expect(
      discoverAssistantSql('Bearer user', 'https://api.test/v2', 'acct', {
        deadlineAt: Date.now() + 1000,
      }),
    ).resolves.toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps answers apart per account', async () => {
    const fetch = stubViews(() => Response.json({ views: [] }));
    await discoverAssistantSql('Bearer user', 'https://api.test/v2', 'acct-a');
    await discoverAssistantSql('Bearer user', 'https://api.test/v2', 'acct-b');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('hides the tools when the API denies access or answers oddly', async () => {
    stubViews(() => Response.json({ error: 'Not enabled' }, { status: 403 }));
    await expect(
      discoverAssistantSql('Bearer user', 'https://api.test/v2', 'acct-a'),
    ).resolves.toBe(false);

    stubViews(() => Response.json({ unexpected: true }));
    await expect(
      discoverAssistantSql('Bearer user', 'https://api.test/v2', 'acct-b'),
    ).resolves.toBe(false);
  });

  it('stops waiting when the response body stalls, and keeps the tools listed', async () => {
    stubViews(
      () =>
        new Response(new ReadableStream({ start() {} }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const started = Date.now();
    await expect(
      discoverAssistantSql('Bearer user', 'https://api.test/v2', 'acct', {
        deadlineAt: Date.now() + 3100,
      }),
    ).resolves.toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('keeps the tools listed on a transient failure and asks again next time', async () => {
    const fetch = stubViews(() =>
      Response.json({ error: 'Unavailable' }, { status: 503 }),
    );
    for (let i = 0; i < 2; i++) {
      await expect(
        discoverAssistantSql('Bearer user', 'https://api.test/v2', 'acct'),
      ).resolves.toBe(true);
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('SQL tools over the MCP transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function call(name: string, args: Record<string, unknown>) {
    const handler = createMcpHandler(
      () =>
        createTerminal49McpServer(
          'Bearer user',
          'https://api.test/v2',
          'acct',
          {
            toolsets: ['analytics'],
            credentialType: 'user',
          },
        ),
      { legacy: 'stateless', responseMode: 'json' },
    );
    const client = new Client(
      { name: 'sql-tools-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
          fetch: (url, init) => handler.fetch(new Request(url, init)),
        }),
      );
      const names = (await client.listTools()).tools.map((tool) => tool.name);
      return {
        names,
        result: await client.callTool({ name, arguments: args }),
      };
    } finally {
      await client.close();
      await handler.close();
    }
  }

  it('lists the four SQL tools and returns a query preview as text and structured data', async () => {
    const requests: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | Request, init?: RequestInit) => {
        requests.push(
          input instanceof Request ? input : new Request(input, init),
        );
        return Response.json(PREVIEW);
      }),
    );

    const { names, result } = await call('sql_query', {
      sql: 'select pod, count(*) from assistant_containers group by 1',
    });

    expect(names).toEqual([
      'sql_query',
      'describe_views',
      'query_guide',
      'get_query_result',
    ]);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      result_id: PREVIEW.result_id,
      rows: [['USLAX', 12]],
    });
    expect(JSON.stringify(result.content)).toContain('USLAX');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe('POST');
    expect(new URL(requests[0]!.url).pathname).toBe('/v2/assistant_queries');
    expect(requests[0]!.headers.get('x-account-id')).toBe('acct');
  });

  it('reports a rejected query with the API message and does not retry', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: 'Only SELECT statements are allowed' },
        { status: 422 },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const { result } = await call('sql_query', { sql: 'delete from x' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      'Only SELECT statements are allowed',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry a rate-limited query', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: 'Too many queries', retry_after: 30 },
        { status: 429 },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const { result } = await call('sql_query', { sql: 'select 1' });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('Retry after 30 seconds');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects SQL over 8,000 bytes before calling the API', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    // 3,000 three-byte characters: under 8,000 characters, over 8,000 bytes.
    const { result } = await call('sql_query', {
      sql: `select '${'€'.repeat(3000)}'`,
    });

    expect(result.isError).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  // Payloads shaped like the API's responses, so an output schema that no
  // longer matches them fails here.
  it.each([
    [
      'describe_views',
      { view: null },
      '/v2/assistant_views',
      {
        views: [
          {
            name: 'assistant_containers',
            label: 'Containers',
            description: 'One row per container.',
            columns: ['container_number', 'pod_arrived_at'],
            metrics: ['dwell_days'],
          },
        ],
      },
    ],
    [
      'describe_views',
      { view: 'assistant_containers', columns: ['pod_arrived_at'] },
      '/v2/assistant_views/assistant_containers',
      {
        name: 'assistant_containers',
        label: 'Containers',
        description: 'One row per container.',
        columns: [
          {
            name: 'pod_arrived_at',
            type: 'timestamp with time zone',
            description: 'When the vessel arrived at the port of discharge.',
          },
        ],
        metrics: [
          {
            name: 'dwell_days',
            description: 'Days from discharge to pickup.',
            sql: 'extract(epoch from x) / 86400',
          },
        ],
      },
    ],
    [
      'query_guide',
      { topic: null },
      '/v2/assistant_guides',
      {
        guides: [
          { topic: 'method', title: 'Method', summary: 'How to measure.' },
        ],
      },
    ],
    [
      'query_guide',
      { topic: 'Last Free Day' },
      '/v2/assistant_guides/Last%20Free%20Day',
      { topic: 'last-free-days', body: '# Last free days\n…' },
    ],
    [
      'get_query_result',
      { result_id: PREVIEW.result_id, offset: 20, limit: 10 },
      `/v2/assistant_queries/${PREVIEW.result_id}`,
      {
        result_id: PREVIEW.result_id,
        expires_at: PREVIEW.expires_at,
        columns: ['pod'],
        column_types: ['text'],
        rows: [['USLAX']],
        offset: 20,
        page_row_count: 1,
        next_offset: null,
        row_count: 21,
        total_count: 21,
        truncated: false,
        row_limit: 500,
      },
    ],
  ])('%s returns the API payload (%j)', async (name, args, path, body) => {
    const requests: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | Request, init?: RequestInit) => {
        requests.push(
          input instanceof Request ? input : new Request(input, init),
        );
        return Response.json(body);
      }),
    );

    const { result } = await call(name, args);

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(body);
    expect(new URL(requests[0]!.url).pathname).toBe(path);
  });

  it('passes through the message when access to a stored result changed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            errors: [
              {
                status: '409',
                detail:
                  'Data access has changed. Run the query again to view its result.',
              },
            ],
          },
          { status: 409 },
        ),
      ),
    );

    const { result } = await call('get_query_result', {
      result_id: PREVIEW.result_id,
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      'Data access has changed. Run the query again to view its result.',
    );
  });
});
