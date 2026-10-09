import type { Terminal49Client } from '@terminal49/sdk';
import { describe, expect, it, vi } from 'vite-plus/test';
import {
  executeGetImporterProfile,
  executeGetTradeBreakdown,
  executeGetTradeDataCoverage,
  executeGetTradeTrends,
  executeRankImporters,
  executeSearchCommodities,
  executeSearchImporters,
  getTradeTrendsInputSchema,
  getTradeBreakdownInputSchema,
  previousMonth,
  searchImportersInputSchema,
} from './trade-intel.js';

function fakeClient(overrides: Record<string, unknown>) {
  const tradeIntel = {
    meta: vi.fn(),
    searchCompanies: vi.fn(),
    companyProfile: vi.fn(),
    searchCommodities: vi.fn(),
    topImporters: vi.fn(),
    trends: vi.fn(),
    breakdown: vi.fn(),
    ...overrides,
  };
  // SAFETY: the executors only touch client.tradeIntel, which is fully stubbed.
  return { client: { tradeIntel } as unknown as Terminal49Client, tradeIntel };
}

const named = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    name: `${prefix} ${i + 1}`,
    containers: 100 - i,
    teus: 190.06,
  }));

describe('trade intelligence input schemas', () => {
  it('rejects months outside 01-12 and accepts real ones', () => {
    expect(() =>
      getTradeTrendsInputSchema.parse({ since: '2026-13' }),
    ).toThrow();
    expect(() =>
      getTradeTrendsInputSchema.parse({ until: '2026-00' }),
    ).toThrow();
    expect(
      getTradeTrendsInputSchema.parse({ since: '2022-01', until: '2026-09' }),
    ).toMatchObject({ since: '2022-01', until: '2026-09' });
  });

  it('rejects unknown dimensions, more than two group_by, and stray keys', () => {
    expect(() =>
      getTradeTrendsInputSchema.parse({ group_by: ['shipper'] }),
    ).toThrow();
    expect(() =>
      getTradeTrendsInputSchema.parse({
        group_by: ['pod', 'carrier', 'hs4'],
      }),
    ).toThrow();
    expect(() => getTradeBreakdownInputSchema.parse({ dims: [] })).toThrow();
    expect(() =>
      getTradeTrendsInputSchema.parse({ filters: { shipper: 'x' } }),
    ).toThrow();
    expect(() =>
      getTradeTrendsInputSchema.parse({ filters: { pod_coast: 'NORTH' } }),
    ).toThrow();
    expect(() => searchImportersInputSchema.parse({ limit: 26 })).toThrow();
  });

  it('accepts names and filters up to the API limit of 200 characters', () => {
    const at = 'A'.repeat(200);
    const over = 'A'.repeat(201);
    expect(searchImportersInputSchema.parse({ name: at }).name).toBe(at);
    expect(() => searchImportersInputSchema.parse({ name: over })).toThrow();
    expect(
      getTradeTrendsInputSchema.parse({ filters: { company: at } }).filters
        ?.company,
    ).toBe(at);
    expect(() =>
      getTradeTrendsInputSchema.parse({ filters: { company: over } }),
    ).toThrow();
  });

  it('applies defaults that keep answers bounded', () => {
    expect(getTradeTrendsInputSchema.parse({})).toEqual({
      measure: 'containers',
      interval: 'month',
      top: 10,
    });
    expect(searchImportersInputSchema.parse({})).toEqual({ limit: 10 });
  });
});

describe('previousMonth', () => {
  it('steps back across a year boundary', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-10')).toBe('2026-09');
    expect(previousMonth('not a month')).toBeUndefined();
  });
});

describe('search_importers', () => {
  it('sends the filters with an uppercased state and compacts each row', async () => {
    const { client, tradeIntel } = fakeClient({
      searchCompanies: vi.fn().mockResolvedValue({
        index: { since_month: '2025-09', until_month_exclusive: '2026-09' },
        results: [
          {
            company_name: 'EXAMPLE OUTDOOR SUPPLY',
            company_state: null,
            containers: 1240,
            containers_as_consignee: 1180,
            containers_as_notify_party: 60,
            teus: 2310.55,
            estimated_value: 48200000.4,
            reefer_share: 0.123,
            first_month: '2025-09',
            last_month: '2026-08',
            top_ports: named('PORT', 8),
            top_origins: named('ORIGIN', 2),
            top_carriers: named('CARRIER', 6),
            top_commodities: [
              {
                hs4: '9401',
                description: 'Seats',
                estimated_value: 31000000.6,
                containers: 800,
              },
            ],
            score: 0.97,
          },
        ],
      }),
    });

    const result = await executeSearchImporters(
      { imports: 'office chairs', state: 'ga' },
      client,
    );

    expect(tradeIntel.searchCompanies).toHaveBeenCalledWith({
      imports: 'office chairs',
      state: 'GA',
      limit: 10,
    });
    expect(result).toMatchObject({
      period: { from: '2025-09', to: '2026-08' },
    });
    const row = (result as any).importers[0];
    expect(row).toMatchObject({
      state: null,
      share_as_notify_party: 0.05,
      teus: 2310.6,
      estimated_value_usd: 48200000,
      reefer_share: 0.12,
      top_products: [{ hs4: '9401', estimated_value_usd: 31000001 }],
    });
    expect(row.top_ports).toHaveLength(5);
    expect(row.top_carriers).toHaveLength(5);
    expect(row.top_origins).toHaveLength(2);
    expect(row.more_not_shown).toEqual({ top_ports: 3, top_carriers: 1 });
    expect(row).not.toHaveProperty('score');
  });
});

describe('get_importer_profile', () => {
  it('defaults to 12 months, caps long lists, and reports what was left out', async () => {
    const { client, tradeIntel } = fakeClient({
      companyProfile: vi.fn().mockResolvedValue({
        company_name: 'EXAMPLE OUTDOOR SUPPLY',
        company_state: null,
        since: '2025-10',
        until: '2026-09',
        found: true,
        totals: {
          containers: 200,
          containers_as_consignee: 50,
          containers_as_notify_party: 150,
          teus: 380.04,
          states: ['GA', 'CA'],
        },
        monthly: Array.from({ length: 12 }, (_, i) => ({
          month: `2026-${String(i + 1).padStart(2, '0')}`,
          containers: 10,
          teus: 19.04,
        })),
        ports_of_discharge: named('PORT', 14),
        origin_countries: named('ORIGIN', 3),
        carriers: named('CARRIER', 10),
        destination_states: named('STATE', 11),
        commodities_hs4: [],
        notes: ['volume is physical containers, each counted once'],
      }),
    });

    const result: any = await executeGetImporterProfile(
      { company_name: 'EXAMPLE OUTDOOR SUPPLY' },
      client,
    );

    expect(tradeIntel.companyProfile).toHaveBeenCalledWith({
      company_name: 'EXAMPLE OUTDOOR SUPPLY',
      months: 12,
    });
    expect(result.totals.share_as_notify_party).toBe(0.75);
    expect(result.monthly).toHaveLength(12);
    expect(result.ports_of_discharge).toHaveLength(10);
    expect(result.carriers).toHaveLength(10);
    expect(result.more_not_shown).toEqual({
      ports_of_discharge: 4,
      destination_states: 1,
    });
    expect(result.notes).toEqual([
      'volume is physical containers, each counted once',
    ]);
  });

  it('explains a miss instead of returning empty totals', async () => {
    const { client } = fakeClient({
      companyProfile: vi.fn().mockResolvedValue({
        company_name: 'EXAMPL OUTDOOR',
        company_state: null,
        since: '2025-10',
        until: '2026-09',
        found: false,
      }),
    });

    const result: any = await executeGetImporterProfile(
      { company_name: 'EXAMPL OUTDOOR', months: 24 },
      client,
    );

    expect(result.found).toBe(false);
    expect(result.message).toMatch(/exact company_name from search_importers/);
    expect(result).not.toHaveProperty('totals');
  });
});

describe('search_commodities', () => {
  it('caps the goods list, counts what was cut, and drops match scores', async () => {
    const { client, tradeIntel } = fakeClient({
      searchCommodities: vi.fn().mockResolvedValue({
        results: [
          {
            hs4: '9401',
            description: 'Seats',
            estimated_value: 9800000000.2,
            companies: 4200,
            common_goods: Array.from({ length: 20 }, (_, i) => `good ${i}`),
            score: 0.9,
          },
        ],
      }),
    });

    const result: any = await executeSearchCommodities(
      { query: 'office chairs' },
      client,
    );

    expect(tradeIntel.searchCommodities).toHaveBeenCalledWith({
      query: 'office chairs',
      limit: 8,
    });
    expect(result.products[0]).toEqual({
      hs4: '9401',
      description: 'Seats',
      common_goods: Array.from({ length: 15 }, (_, i) => `good ${i}`),
      common_goods_not_shown: 5,
      importers: 4200,
      estimated_value_usd_12_months: 9800000000,
    });
  });
});

describe('rank_importers', () => {
  it('numbers the ranking and only reports value when the API gave one', async () => {
    const { client, tradeIntel } = fakeClient({
      topImporters: vi.fn().mockResolvedValue({
        since: '2025-10',
        until: '2026-09',
        ranked_by: 'containers',
        filters: { port_of_discharge: 'savannah' },
        notes: [],
        importers: [
          { company_name: 'A', states: ['GA'], containers: 9, teus: 17.01 },
          { company_name: 'B', states: ['SC'], containers: 4, teus: 8 },
        ],
      }),
    });

    const result: any = await executeRankImporters(
      { port_of_discharge: 'savannah' },
      client,
    );

    expect(tradeIntel.topImporters).toHaveBeenCalledWith({
      port_of_discharge: 'savannah',
      months: 12,
      limit: 20,
    });
    expect(result.importers[0]).toEqual({
      rank: 1,
      company_name: 'A',
      states: ['GA'],
      containers: 9,
      teus: 17,
    });
    expect(result.importers[1].rank).toBe(2);
  });
});

describe('get_trade_trends', () => {
  it('uppercases code filters, drops internal fields, and caps the series', async () => {
    const series = Array.from({ length: 620 }, (_, i) => ({
      period: `p${i}`,
      origin_country: 'VIETNAM',
      value: 10.6,
    }));
    const { client, tradeIntel } = fakeClient({
      trends: vi.fn().mockResolvedValue({
        measure: 'containers',
        interval: 'month',
        since: '2024-10',
        until: '2026-10',
        group_by: ['origin_country'],
        filters: { hs4: '9401' },
        fact: 'internal_table_name',
        notes: ['the latest month is partial'],
        series,
      }),
    });

    const result: any = await executeGetTradeTrends(
      {
        group_by: ['origin_country'],
        filters: { hs4: '9401', dest_state: 'tx', scac: 'maeu' },
      },
      client,
    );

    expect(tradeIntel.trends).toHaveBeenCalledWith({
      measure: 'containers',
      interval: 'month',
      top: 10,
      group_by: ['origin_country'],
      filters: {
        hs4: '9401',
        dest_state: 'TX',
        scac: 'MAEU',
        company_state: undefined,
      },
    });
    expect(result).not.toHaveProperty('fact');
    expect(result.series).toHaveLength(500);
    expect(result.series[0].value).toBe(11);
    expect(result.truncated).toBe(true);
    expect(result.total_rows).toBe(620);
    expect(result.period).toEqual({ from: '2024-10', to: '2026-10' });
  });
});

describe('get_trade_breakdown', () => {
  it('keeps one decimal for TEUs and passes the hierarchy through', async () => {
    const { client, tradeIntel } = fakeClient({
      breakdown: vi.fn().mockResolvedValue({
        measure: 'teus',
        dims: ['pod_coast', 'pod'],
        filters: {},
        since: '2025-10',
        until: '2026-09',
        fact: 'internal_table_name',
        notes: [],
        rows: [
          { level: 0, value: 1000.26 },
          { level: 1, pod_coast: 'WEST', value: 600.04 },
        ],
      }),
    });

    const result: any = await executeGetTradeBreakdown(
      {
        dims: ['pod_coast', 'pod'],
        measure: 'teus',
        since: '2025-10',
        until: '2026-09',
      },
      client,
    );

    expect(tradeIntel.breakdown).toHaveBeenCalledWith(
      expect.objectContaining({ dims: ['pod_coast', 'pod'], top: 10 }),
    );
    expect(result.rows).toEqual([
      { level: 0, value: 1000.3 },
      { level: 1, pod_coast: 'WEST', value: 600 },
    ]);
    expect(result).not.toHaveProperty('fact');
    expect(result).not.toHaveProperty('truncated');
  });
});

describe('get_trade_data_coverage', () => {
  it('states where history starts and which month is incomplete, without internals', async () => {
    const { client } = fakeClient({
      meta: vi.fn().mockResolvedValue({
        since_month: '2025-09',
        until_month_exclusive: '2026-09',
        months: 12,
        min_containers: 5,
        companies: 250000,
        hs_codes: 1200,
        facts_since_month: '2022-01',
        facts_until_exclusive: '2026-11',
        partial_month: '2026-10',
        mode: 'local',
        facts_hash: 'abc',
        refreshed_since: '2026-10-01',
        fact_rows: { lane_month: 1 },
        volume_measure: 'containers',
        built_at: '2026-10-08T06:12:44Z',
      }),
    });

    const result = await executeGetTradeDataCoverage(client);

    expect(result).toEqual({
      source:
        'US ocean import bill-of-lading records (US Customs vessel manifests)',
      history_starts: '2022-01',
      latest_month: '2026-10',
      latest_month_is_partial: true,
      last_full_month: '2026-09',
      search_window: { from: '2025-09', to: '2026-08' },
      importers_indexed: 250000,
      product_codes_indexed: 1200,
      volume_unit: 'physical containers, each counted once',
      built_at: '2026-10-08T06:12:44Z',
    });
  });
});
