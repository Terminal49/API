import { describe, expect, it, vi } from 'vite-plus/test';
import { Terminal49Client } from '@terminal49/sdk';
import { executeListContainers } from './list-containers.js';
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

describe('party lookup continuation and disambiguation', () => {
  it('preserves nickname and roles for companies with the same name', async () => {
    const { client } = fakeClient([
      {
        ...party('1', 'Acme'),
        attributes: {
          company_name: 'Acme',
          nickname: 'West',
          role_names: ['customer'],
        },
      },
      {
        ...party('2', 'Acme'),
        attributes: {
          company_name: 'Acme',
          nickname: 'East',
          role_names: ['shipper'],
        },
      },
    ]);
    const result = await executeListParties({ search: 'acme' }, client);
    expect(result.parties).toEqual([
      { id: '1', name: 'Acme', nickname: 'West', role_names: ['customer'] },
      { id: '2', name: 'Acme', nickname: 'East', role_names: ['shipper'] },
    ]);
    expect(result.usage).toContain('ask the user');
  });

  it('uses the API continuation even when the backend page size is smaller than requested', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [party('1', 'Acme')],
            meta: { total: 2 },
            links: { next: '/v2/parties?page[number]=2' },
          }),
        ),
    );
    const client = new Terminal49Client({ apiToken: 'TEST_KEY', fetchImpl });
    const result = await executeListParties(
      { search: 'acme', limit: 50 },
      client,
    );
    expect(result.next_page).toBe(2);
    expect(result.truncated).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not claim a later final page is the complete set', async () => {
    const { client, requestedUrl } = fakeClient([party('3', 'Acme')], 3);
    const result = await executeListParties(
      { search: 'acme', page: 2, limit: 2 },
      client,
    );
    expect(requestedUrl().searchParams.get('page[number]')).toBe('2');
    expect(requestedUrl().searchParams.get('query')).toBe('acme');
    expect(result).toMatchObject({
      page: 2,
      next_page: null,
      truncated: true,
      total_matched: 3,
    });
  });

  it('resolves a company on the next page and uses its role and ID to retrieve containers', async () => {
    const targetId = '00000000-0000-4000-8000-000000000002';
    const urls: URL[] = [];
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      urls.push(url);
      if (url.pathname.endsWith('/parties')) {
        const second = url.searchParams.get('page[number]') === '2';
        return new Response(
          JSON.stringify({
            data: [
              {
                id: second ? targetId : '00000000-0000-4000-8000-000000000001',
                type: 'party',
                attributes: {
                  company_name: 'Acme',
                  nickname: second ? 'West' : 'East',
                  role_names: ['customer'],
                },
              },
            ],
            meta: { total: 2 },
            links: { next: second ? null : '/v2/parties?page[number]=2' },
          }),
        );
      }
      expect(url.pathname).toBe('/v2/containers');
      expect(url.searchParams.get('filter[parties][customer]')).toBe(targetId);
      expect(url.searchParams.get('filter[actively_tracked]')).toBe('true');
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'container-1',
              type: 'container',
              attributes: { number: 'MSCU1234567' },
            },
          ],
          meta: { total: 1 },
          links: { next: null },
        }),
      );
    });
    const client = new Terminal49Client({ apiToken: 'TEST_KEY', fetchImpl });
    const first = await executeListParties(
      { search: 'acme', limit: 1 },
      client,
    );
    expect(first.next_page).toBe(2);
    const second = await executeListParties(
      { search: 'acme', limit: 1, page: first.next_page! },
      client,
    );
    const selected = second.parties.find(
      (item) =>
        item.nickname === 'West' && item.role_names?.includes('customer'),
    );
    expect(selected).toBeDefined();
    const containers = await executeListContainers(
      { advanced_filters: { parties: { customer: selected!.id } } },
      client,
    );
    expect(containers.items[0].number).toBe('MSCU1234567');
    expect(urls).toHaveLength(3);
    expect(second.next_page).toBeNull();
  });
});
