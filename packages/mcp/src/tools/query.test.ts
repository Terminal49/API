import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { executeQuery } from './query.js';

afterEach(() => vi.unstubAllGlobals());

describe('executeQuery', () => {
  it('posts SQL with delegated bearer auth and account context', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          columns: ['container_count'],
          rows: [[3]],
          row_count: 1,
          truncated: false,
          row_limit: 500,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    expect(
      await executeQuery(
        'SELECT count(*) FROM assistant_containers',
        'Bearer delegated-token',
        'https://api.example.com/v2',
        'account-123',
      ),
    ).toMatchObject({ rows: [[3]] });
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.example.com/v2/assistant_queries'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer delegated-token',
          'X-Account-ID': 'account-123',
        }),
        body: JSON.stringify({
          sql: 'SELECT count(*) FROM assistant_containers',
        }),
      }),
    );
  });

  it('passes safe validation errors back for SQL repair', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Only SELECT is allowed' }), {
          status: 422,
        }),
      ),
    );
    expect(
      await executeQuery('DELETE FROM assistant_containers', 'token'),
    ).toEqual({
      error: 'Only SELECT is allowed',
    });
  });
});
