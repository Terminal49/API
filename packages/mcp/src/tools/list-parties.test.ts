import { describe, expect, it, vi } from 'vite-plus/test';
import { Terminal49Client } from '@terminal49/sdk';
import { executeListParties, PARTY_ROLES } from './list-parties.js';

const party = (id: string, company_name: string) => ({
  id,
  type: 'party',
  attributes: { company_name },
});

function fakeClient(pages: unknown[][]) {
  const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL((input as Request).url ?? String(input));
    const page = Number(url.searchParams.get('page[number]') ?? 1);
    const data = pages[page - 1] ?? [];
    const next =
      page < pages.length
        ? `${url.origin}/v2/parties?page[number]=${page + 1}`
        : null;
    return new Response(JSON.stringify({ data, links: { next } }), {
      status: 200,
      headers: { 'content-type': 'application/vnd.api+json' },
    });
  });
  return {
    client: new Terminal49Client({ apiToken: 'TEST_KEY', fetchImpl }),
    fetchImpl,
  };
}

describe('list_parties', () => {
  it('ranks exact, prefix, then contains matches across pages', async () => {
    const { client, fetchImpl } = fakeClient([
      [party('1', 'Big Ray Drayage'), party('2', 'Acme Imports')],
      [party('3', 'Ray Drayage'), party('4', 'Raymond Supply')],
    ]);
    const result = await executeListParties({ search: 'ray drayage' }, client);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.parties.map((p) => p.name)).toEqual([
      'Ray Drayage',
      'Big Ray Drayage',
    ]);
    expect(result.total_matched).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('ignores case and punctuation', async () => {
    const { client } = fakeClient([
      [party('1', "Southern Glazer's W&S Of America")],
    ]);
    const result = await executeListParties(
      { search: 'southern glazers' },
      client,
    );
    expect(result.parties).toEqual([
      { id: '1', name: "Southern Glazer's W&S Of America" },
    ]);
  });

  it('lists alphabetically without a search and honors the limit', async () => {
    const { client } = fakeClient([
      [party('1', 'Zeta'), party('2', 'Alpha'), party('3', 'Mid')],
    ]);
    const result = await executeListParties({ limit: 2 }, client);
    expect(result.parties.map((p) => p.name)).toEqual(['Alpha', 'Mid']);
    expect(result.total_matched).toBe(3);
  });

  it('explains how to use the id with the container party filter', async () => {
    const { client } = fakeClient([[]]);
    const result = await executeListParties({}, client);
    expect(PARTY_ROLES).toContain('customer');
    expect(PARTY_ROLES).toContain('pickup_dray_carrier');
    expect(result.usage).toContain('advanced_filters.parties');
  });

  it('reports truncation when the account has more parties than it loads', async () => {
    const pages = Array.from({ length: 11 }, (_, i) => [
      party(String(i), `Party ${i}`),
    ]);
    const { client, fetchImpl } = fakeClient(pages);
    const result = await executeListParties({}, client);
    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(result.truncated).toBe(true);
  });

  it('reports truncation when the limit drops matches', async () => {
    const { client } = fakeClient([
      [
        party('1', 'Ray Drayage East'),
        party('2', 'Ray Drayage West'),
        party('3', 'Ray Drayage North'),
      ],
    ]);
    const result = await executeListParties(
      { search: 'ray drayage', limit: 2 },
      client,
    );
    expect(result.total_matched).toBe(3);
    expect(result.parties).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('does not treat unrelated non-ASCII names as exact matches', async () => {
    const { client } = fakeClient([
      [party('1', '北京物流'), party('2', '上海物流')],
    ]);
    const result = await executeListParties({ search: '上海物流' }, client);
    expect(result.parties.map((p) => p.id)).toEqual(['2']);
  });
});
