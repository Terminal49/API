import { describe, expect, it, vi } from 'vite-plus/test';
import { buildQueryUrl, executeQuery } from './query.js';

describe('query', () => {
  it('confines requests to Rails v2 and separates query parameters', () => {
    const url = buildQueryUrl('https://api.example.com/v2', {
      path: '/containers/abc/transport_events',
      params: { 'page[number]': '2', include: ['shipment', 'pod_terminal'] },
    });
    expect(url.pathname).toBe('/v2/containers/abc/transport_events');
    expect(url.searchParams.get('page[number]')).toBe('2');
    expect(url.searchParams.getAll('include')).toEqual([
      'shipment',
      'pod_terminal',
    ]);
    for (const path of [
      'https://evil.test/',
      '//evil.test/',
      '/../accounts',
      '/%2e%2e/accounts',
      '/containers?x=1',
      '/containers#x',
    ]) {
      expect(() =>
        buildQueryUrl('https://api.example.com/v2', { path }),
      ).toThrow();
    }
  });

  it('serializes Rails array arrival bounds as repeated bracketed query keys', () => {
    const url = buildQueryUrl('https://api.example.com/v2', {
      path: '/containers',
      params: {
        'filter[pod_code]': 'USLAX',
        'filter[arrival][]': ['>=2026-09-21', '<=2026-09-27'],
        sort: 'arrival',
        'page[size]': '25',
      },
    });
    expect(url.searchParams.getAll('filter[arrival][]')).toEqual([
      '>=2026-09-21',
      '<=2026-09-27',
    ]);
    expect(url.searchParams.get('filter[pod_code]')).toBe('USLAX');
  });

  it('forwards delegated authorization and preserves Rails pagination metadata', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'one', type: 'container' }],
          links: {
            next: 'https://api.example.com/v2/containers?page[number]=2',
          },
          meta: { total: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const result = await executeQuery(
      { path: '/containers', params: { 'page[size]': '1' } },
      {
        apiToken: 'Bearer delegated-token',
        accountId: 'account-id',
        apiBaseUrl: 'https://api.example.com/v2',
      },
      fetchImpl,
    );
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url.toString()).toBe(
      'https://api.example.com/v2/containers?page%5Bsize%5D=1',
    );
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer delegated-token');
    expect(init.headers['x-account-id']).toBe('account-id');
    expect(init.redirect).toBe('error');
    expect(result.body).toMatchObject({
      meta: { total: 2 },
      links: { next: expect.any(String) },
    });
  });

  it('preserves Rails authorization errors without escalating credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [{ status: '403' }] }), {
        status: 403,
      }),
    );
    const result = await executeQuery(
      { path: '/documents' },
      { apiToken: 'key', apiBaseUrl: 'https://api.example.com/v2' },
      fetchImpl,
    );
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Token key');
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ errors: [{ status: '403' }] });
  });

  it('rejects oversized responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: 'x'.repeat(130 * 1024) }), {
        status: 200,
      }),
    );
    await expect(
      executeQuery({ path: '/containers' }, { apiToken: 'key' }, fetchImpl),
    ).rejects.toThrow('smaller page');
  });
});
