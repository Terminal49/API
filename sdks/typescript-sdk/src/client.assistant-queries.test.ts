import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client, Terminal49Error } from './client.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const preview = {
  result_id: '11111111-1111-4111-8111-111111111111',
  expires_at: '2026-01-02T00:00:00Z',
  columns: ['count'],
  column_types: ['bigint'],
  rows: [[12]],
  preview_row_count: 1,
  row_count: 1,
  total_count: 1,
  truncated: false,
  row_limit: 10000,
};

describe('assistant query manager', () => {
  it('preserves the snapshot contract and delegated identity without JSON:API mapping', async () => {
    const { fetchImpl, calls } = createMockFetch({
      '/assistant_queries': () => jsonResponse(preview),
    });
    const client = new Terminal49Client({
      apiToken: 'Bearer delegated-test',
      accountId: 'account-test',
      apiBaseUrl: 'https://api.test',
      defaultFormat: 'mapped',
      fetchImpl,
    });
    expect(
      await client.assistantQueries.query(
        'SELECT count(*) FROM assistant_containers',
        5,
      ),
    ).toEqual(preview);
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      sql: 'SELECT count(*) FROM assistant_containers',
      preview_rows: 5,
    });
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('authorization')).toBe('Bearer delegated-test');
    expect(headers.get('x-account-id')).toBe('account-test');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('builds discovery, filters, guides and result paging requests', async () => {
    const page = {
      ...preview,
      offset: 2,
      page_row_count: 1,
      next_offset: null,
    };
    const { fetchImpl, calls } = createMockFetch({
      '/assistant_views': () => jsonResponse({ views: [] }),
      '/assistant_views/assistant_containers?columns=number,pod_name&search=port':
        () => jsonResponse({ columns: [] }),
      '/assistant_guides': () => jsonResponse({ guides: [] }),
      '/assistant_guides/method': () =>
        jsonResponse({ topic: 'method', body: 'Measure first.' }),
      [`/assistant_queries/${preview.result_id}?offset=2&limit=25`]: () =>
        jsonResponse(page),
    });
    const client = new Terminal49Client({
      apiToken: 'Bearer test',
      accountId: 'account-test',
      apiBaseUrl: 'https://api.test',
      fetchImpl,
    });
    expect(await client.assistantQueries.views()).toEqual({ views: [] });
    await client.assistantQueries.view(
      'assistant_containers',
      ['number', 'pod_name'],
      'port',
    );
    expect(await client.assistantQueries.guides()).toEqual({ guides: [] });
    expect(await client.assistantQueries.guide('method')).toEqual({
      topic: 'method',
      body: 'Measure first.',
    });
    expect(
      await client.assistantQueries.result(preview.result_id, 2, 25),
    ).toEqual(page);
    expect(calls).toHaveLength(5);
  });

  it('URL-encodes guide topic path segments exactly once', async () => {
    const { fetchImpl, calls } = createMockFetch({
      '/assistant_guides/Last%20Free%20Day': () =>
        jsonResponse({ topic: 'last-free-days', body: 'Guide' }),
    });
    const client = new Terminal49Client({
      apiToken: 'Bearer test',
      accountId: 'account-test',
      apiBaseUrl: 'https://api.test',
      fetchImpl,
    });
    expect(await client.assistantQueries.guide('Last Free Day')).toEqual({
      topic: 'last-free-days',
      body: 'Guide',
    });
    expect(calls[0].url.pathname).toBe(
      '/v2/assistant_guides/Last%20Free%20Day',
    );
  });

  it.each([401, 403, 422, 429, 500])(
    'does not retry query POST on %s and preserves error details',
    async (status) => {
      const body = { error: 'Synthetic failure', retry_after: 12 };
      const { fetchImpl, calls } = createMockFetch({
        '/assistant_queries': () => jsonResponse(body, status),
      });
      const client = new Terminal49Client({
        apiToken: 'test',
        accountId: 'account-test',
        apiBaseUrl: 'https://api.test',
        fetchImpl,
      });
      await expect(
        client.assistantQueries.query('SELECT 1'),
      ).rejects.toMatchObject({ status, details: body });
      expect(calls).toHaveLength(1);
    },
  );

  it('does not retry a failed POST after a network error', async () => {
    let count = 0;
    const client = new Terminal49Client({
      apiToken: 'test',
      accountId: 'account-test',
      fetchImpl: async () => {
        count++;
        throw new Error('offline');
      },
    });
    await expect(
      client.assistantQueries.query('SELECT 1'),
    ).rejects.toBeInstanceOf(Terminal49Error);
    expect(count).toBe(1);
  });
});

it('requires explicit account scope before calling an assistant endpoint', async () => {
  const { fetchImpl, calls } = createMockFetch({});
  const client = new Terminal49Client({ apiToken: 'Bearer test', fetchImpl });
  for (const request of [
    () => client.assistantQueries.query('SELECT 1'),
    () => client.assistantQueries.result(preview.result_id),
    () => client.assistantQueries.views(),
    () => client.assistantQueries.view('assistant_containers'),
    () => client.assistantQueries.guides(),
    () => client.assistantQueries.guide('method'),
  ]) {
    await expect(request()).rejects.toThrow('requires accountId');
  }
  expect(calls).toHaveLength(0);
});

it('encodes view filters without introducing query parameters', async () => {
  let requestedUrl: URL | undefined;
  const client = new Terminal49Client({
    apiToken: 'Bearer test',
    accountId: 'account-test',
    apiBaseUrl: 'https://api.test',
    fetchImpl: async (input) => {
      requestedUrl = new URL((input as Request).url);
      return jsonResponse({ columns: [] });
    },
  });
  await client.assistantQueries.view(
    'assistant_containers',
    ['number', 'pod_name'],
    'port & terminal',
  );
  expect(requestedUrl?.searchParams.get('columns')).toBe('number,pod_name');
  expect(requestedUrl?.searchParams.get('search')).toBe('port & terminal');
  expect(requestedUrl?.searchParams.size).toBe(2);
});
