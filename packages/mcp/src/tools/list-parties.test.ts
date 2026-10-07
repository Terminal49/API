import { describe, expect, it, vi } from 'vite-plus/test';
import { Terminal49Client } from '@terminal49/sdk';
import { executeListParties, PARTY_ROLES } from './list-parties.js';

const party = (id: string, company_name: string) => ({
  id,
  type: 'party',
  attributes: { company_name },
});

function fakeClient(data: unknown[], total = data.length) {
  const fetchImpl = vi.fn(
    async (_input: Parameters<typeof fetch>[0]) =>
      new Response(JSON.stringify({ data, meta: { total } }), {
        status: 200,
        headers: { 'content-type': 'application/vnd.api+json' },
      }),
  );
  return {
    client: new Terminal49Client({ apiToken: 'TEST_KEY', fetchImpl }),
    requestedUrl: () => {
      const input = fetchImpl.mock.calls[0][0];
      return new URL((input as Request).url ?? String(input));
    },
  };
}

describe('list_parties', () => {
  it('asks the API to search by name in one request', async () => {
    const { client, requestedUrl } = fakeClient([
      party('1', 'Bluewave Home Goods'),
    ]);
    const result = await executeListParties(
      { search: 'bluewave', limit: 10 },
      client,
    );

    const url = requestedUrl();
    expect(url.pathname).toBe('/v2/parties');
    expect(url.searchParams.get('query')).toBe('bluewave');
    expect(url.searchParams.get('page[size]')).toBe('10');
    expect(result).toMatchObject({
      total_matched: 1,
      parties: [{ id: '1', name: 'Bluewave Home Goods' }],
      truncated: false,
    });
  });

  it('lists parties without a search', async () => {
    const { client, requestedUrl } = fakeClient([party('1', 'Acme')]);
    await executeListParties({}, client);
    expect(requestedUrl().searchParams.has('query')).toBe(false);
    expect(requestedUrl().searchParams.get('page[size]')).toBe('25');
  });

  it('reports truncation when more parties match than it returns', async () => {
    const { client } = fakeClient([party('1', 'Acme East')], 40);
    const result = await executeListParties(
      { search: 'acme', limit: 1 },
      client,
    );
    expect(result).toMatchObject({ total_matched: 40, truncated: true });
  });

  it('skips parties without a name', async () => {
    const { client } = fakeClient([party('1', '  '), party('2', 'Acme')]);
    const result = await executeListParties({ search: 'acme' }, client);
    expect(result.parties).toEqual([{ id: '2', name: 'Acme' }]);
  });

  it('explains how to use the id with the container party filter', async () => {
    const { client } = fakeClient([]);
    const result = await executeListParties({ search: 'acme' }, client);
    expect(result.usage).toContain('advanced_filters.parties');
    for (const role of PARTY_ROLES) expect(result.usage).toContain(role);
  });
});
