import fs from 'node:fs';
import { describe, expect, it, vi } from 'vite-plus/test';
import { Terminal49Client, ValidationError } from './client.js';
import {
  CONTAINER_FILTER_KINDS,
  SHIPMENT_FILTER_KINDS,
} from './generated/list-filters.js';
import {
  buildContainerListQuery,
  buildShipmentListQuery,
  clampPageSize,
  MAX_PAGE_SIZE,
} from './client/query.js';

function clientFixture(body: unknown = { data: [], meta: { total: 0 } }) {
  const urls: URL[] = [];
  const fetchImpl = vi.fn(async (input: Request | URL | string) => {
    urls.push(new URL(input instanceof Request ? input.url : String(input)));
    return new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const client = new Terminal49Client({
    apiToken: 'test-key',
    apiBaseUrl: 'https://api.test/v2',
    fetchImpl: fetchImpl as typeof fetch,
  });
  return { client, fetchImpl, urls };
}

const spec = JSON.parse(
  fs.readFileSync(
    new URL('../../../docs/openapi.json', import.meta.url),
    'utf8',
  ),
);
describe('OpenAPI and SDK filter parity', () => {
  for (const [entity, catalog] of [
    ['shipment', SHIPMENT_FILTER_KINDS],
    ['container', CONTAINER_FILTER_KINDS],
  ] as const) {
    it(`${entity} exposes every confirmed OpenAPI filter`, () => {
      const apiKeys = spec.paths[`/${entity}s`].get.parameters
        .filter((p: any) => p['x-t49-filter-kind'])
        .map((p: any) => p['x-t49-filter-key'] || p.name.slice(7, -1));
      expect(Object.keys(catalog).sort()).toEqual(apiKeys.sort());
    });
  }
});

describe('every confirmed filter reaches the API with its documented wire key', () => {
  for (const entity of ['shipments', 'containers'] as const) {
    for (const parameter of spec.paths[`/${entity}`].get.parameters.filter(
      (p: any) => p['x-t49-filter-kind'],
    )) {
      const key = parameter['x-t49-filter-key'] || parameter.name.slice(7, -1);
      it(`${entity}: ${key}`, async () => {
        const { client, urls } = clientFixture();
        const kind = parameter['x-t49-filter-kind'];
        let value: unknown = key.endsWith('_id')
          ? '00000000-0000-4000-8000-000000000001'
          : 'TESTFILTER';
        if (kind === 'boolean' || kind === 'selector') value = true;
        if (kind === 'voyage') value = 'arrived';
        if (kind === 'status') value = 'available';
        if (kind === 'date') value = '>=2026-10-01';
        if (kind === 'datetime') value = '>=2026-10-01T00:00:00Z';
        if (kind === 'range') value = ['2026-10-01', '2026-10-05'];
        if (kind === 'party')
          value = {
            value: '00000000-0000-4000-8000-000000000001',
            operator: 'all',
          };
        if (kind === 'parties')
          value = { shipper: '00000000-0000-4000-8000-000000000001' };
        const filters: any = { [key]: value };
        if (key === 'tags_and') filters.tags = 'TESTTAG';
        await client[entity].list(filters);
        const wireKeys = [...urls[0].searchParams.keys()].filter((k) =>
          k.startsWith(parameter.name),
        );
        expect(wireKeys.length).toBeGreaterThan(0);
        if (typeof value !== 'object')
          expect(urls[0].searchParams.get(parameter.name)).toBe(String(value));
        if (kind === 'range')
          expect(urls[0].searchParams.getAll(`filter[${key}][]`)).toEqual(
            value,
          );
      });
    }
  }
});

describe('request serialization and collection results', () => {
  it('preserves customer account/party ID AND terms without assuming distinct IDs cannot identify the same customer', async () => {
    const { client, urls } = clientFixture();
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    await client.shipments.list({ customer_id: ids });
    expect(urls[0].searchParams.getAll('filter[customer_id][]')).toEqual(ids);
  });
  it('serializes a combined container worklist, preserves false, and caps page size', async () => {
    const { client, urls } = clientFixture();
    await client.listContainers(
      {
        current_status: 'available,on_ship',
        pod_code: 'USLAX',
        shipping_line_scac: 'MAEU',
        has_holds: false,
        pickup_lfd: ['>=2026-10-01', '<=2026-10-15'],
        sort: 'pickup_lfd,-updated_at',
      },
      { page: 2, pageSize: 100 },
    );
    const p = urls[0].searchParams;
    expect(p.get('filter[current_status]')).toBe('available,on_ship');
    expect(p.get('filter[pod_code]')).toBe('USLAX');
    expect(p.get('filter[shipping_line_scac]')).toBe('MAEU');
    expect(p.get('filter[has_holds]')).toBe('false');
    expect(p.getAll('filter[pickup_lfd][]')).toEqual([
      '>=2026-10-01',
      '<=2026-10-15',
    ]);
    expect(p.has('filter[pickup_lfd]')).toBe(false);
    expect(p.get('page[size]')).toBe('50');
    expect(p.get('page[number]')).toBe('2');
    expect(p.get('sort')).toBe('pickup_lfd,-updated_at');
  });
  it('serializes exact shipment arrays, timestamps, and nested party matching', async () => {
    const { client, urls } = clientFixture();
    await client.listShipments({
      number: ['MSC/1234', 'TEST-BOL-2'],
      tracking_stopped: false,
      created_at: ['>=2026-10-01T00:00:00Z', '<2026-10-02T00:00:00Z'],
      party_id: {
        value: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
        ],
        operator: 'all',
      },
    });
    const p = urls[0].searchParams;
    expect(p.getAll('filter[number][]')).toEqual(['MSC/1234', 'TEST-BOL-2']);
    expect(p.get('filter[tracking_stopped]')).toBe('false');
    expect(p.getAll('filter[created_at][]')).toHaveLength(2);
    expect(p.getAll('filter[party_id][value][]')).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
    expect(p.get('filter[party_id][operator]')).toBe('all');
  });
  it('keeps comma-containing shipment numbers literal', async () => {
    const { client, urls } = clientFixture();
    await client.shipments.list({ number: 'A,B' });
    expect(urls[0].searchParams.get('filter[number]')).toBe('A,B');
  });
  it('serializes dynamic party roles and two-date LFD ranges', async () => {
    const { client, urls } = clientFixture();
    await client.containers.list({
      parties: {
        shipper: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002',
        ],
        pickup_dray_carrier: '@not_exists',
      },
      last_free_day_on: ['2026-10-01', '2026-10-05'],
    });
    const p = urls[0].searchParams;
    expect(p.getAll('filter[parties][shipper][]')).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
    expect(p.get('filter[parties][pickup_dray_carrier]')).toBe('@not_exists');
    expect(p.getAll('filter[last_free_day_on][]')).toEqual([
      '2026-10-01',
      '2026-10-05',
    ]);
  });
  it('maps only semantically equivalent legacy aliases', async () => {
    const { client, urls } = clientFixture();
    await client.containers.list({
      status: 'available',
      port: 'USLAX',
      carrier: 'MAEU',
    });
    expect(urls[0].searchParams.get('filter[current_status]')).toBe(
      'available',
    );
    expect(urls[0].searchParams.get('filter[shipping_line_scac]')).toBe('MAEU');
    await client.shipments.list({ trackingStopped: false, port: 'USLAX' });
    expect(urls[1].searchParams.get('filter[tracking_stopped]')).toBe('false');
    expect(urls[1].searchParams.get('filter[pod_code]')).toBe('USLAX');
  });
  for (const format of ['raw', 'mapped', 'both'] as const) {
    it(`preserves response envelope in ${format} format`, async () => {
      const document = {
        data: [],
        meta: { total: 7 },
        links: { next: 'https://api.test/v2/containers?page[number]=2' },
      };
      const { client } = clientFixture(document);
      const r = await client.containers.list({ has_holds: true }, { format });
      const raw = format === 'both' ? r.raw : r;
      const mapped = format === 'both' ? r.mapped : r;
      if (format !== 'mapped') expect(raw).toEqual(document);
      if (format !== 'raw') {
        expect(mapped.meta.total).toBe(7);
        expect(mapped.links.next).toBe(document.links.next);
        expect(mapped.unsupportedFilters).toEqual([]);
      }
    });
  }
  it('retains filters across iterator pages and stops at the row cap', async () => {
    const urls: URL[] = [];
    const fetchImpl = vi.fn(async (request: Request) => {
      urls.push(new URL(request.url));
      return new Response(
        JSON.stringify({
          data: [
            {
              type: 'container',
              id: String(urls.length),
              attributes: {
                number: 'TEST1234567',
                current_status: 'available',
              },
            },
          ],
          links: { next: 'https://api.test/v2/containers?page[number]=2' },
        }),
      );
    });
    const client = new Terminal49Client({
      apiToken: 'test',
      apiBaseUrl: 'https://api.test/v2',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const rows = [];
    for await (const row of client.containers.iterate(
      { has_holds: true },
      { maxRows: 2, pageSize: 100 },
    ))
      rows.push(row);
    expect(rows).toHaveLength(2);
    expect(
      urls.every((u) => u.searchParams.get('filter[has_holds]') === 'true'),
    ).toBe(true);
    expect(urls.every((u) => u.searchParams.get('page[size]') === '50')).toBe(
      true,
    );
  });
});

describe('invalid queries fail before any network request', () => {
  const invalidContainers: Array<[string, unknown]> = [
    ['unknown key', { has_hold: true }],
    ['sparse array', { pickup_lfd: Array(1) }],
    ['inherited key', { constructor: 'not-a-filter' }],
    ['invalid identifier', { customer_id: 'not-a-uuid' }],
    ['invalid text search', { search_by_number: '>2026-10-05' }],
    ['invented status', { current_status: 'in_transit' }],
    ['string boolean', { has_holds: 'false' }],
    ['non-finite date', { created_at: '2026-02-30' }],
    ['datetime on date field', { updated_at: '>=2026-10-01T00:00:00Z' }],
    ['reversed bounds', { pickup_lfd: ['>=2026-10-15', '<=2026-10-01'] }],
    ['strict empty interval', { pickup_lfd: ['>2026-10-01', '<=2026-10-01'] }],
    ['unknown presence', { pickup_lfd: '@something' }],
    ['no-op selector', { eta_changed_in_last_24h: false }],
    ['incomplete LFD range', { last_free_day_on: ['2026-10-01'] }],
    [
      'operator LFD range',
      { last_free_day_on: ['>=2026-10-01', '<=2026-10-05'] },
    ],
    [
      'unknown role',
      { parties: { made_up_role: '00000000-0000-4000-8000-000000000001' } },
    ],
    ['unknown sort', { sort: 'made_up_sort' }],
    ['tags modifier alone', { tags_and: true }],
    ['unsupported search operator', { number: '~TEST' }],
    ['unsupported search operator in alternatives', { number: 'TEST1,~TEST2' }],
    ['contradictory exact array', { number: ['TEST1', 'TEST2'] }],
    ['ambiguous legacy timestamp', { updatedAfter: '2026-10-01T00:00:00Z' }],
    ['conflicting alias', { status: 'available', current_status: 'on_ship' }],
    ['broken deployed date filter', { pod_eta_at: '@exists' }],
    ['ignored custom field', { custom_fields: { test_slug: '@exists' } }],
  ];
  for (const [name, filters] of invalidContainers) {
    it(`container: ${name}`, async () => {
      const { client, fetchImpl } = clientFixture();
      await expect(
        client.containers.list(filters as any),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  }
  const invalidShipments: Array<[string, unknown]> = [
    ['invented voyage status', { voyage_status: 'in_transit' }],
    ['null filter object', null],
    ['ambiguous legacy status', { status: 'in_transit' }],
    ['unsupported carrier', { carrier: 'MAEU' }],
    ['missing timestamp offset', { created_at: '2026-10-01T00:00:00' }],
    ['relative timestamp', { created_at: '>=3.days.ago' }],
    ['false arriving selector', { arriving_today: false }],
    [
      'conflicting tracking state',
      { actively_tracked: true, tracking_stopped: true },
    ],
    [
      'conflicting tracking inverse',
      { actively_tracked: false, tracking_stopped: false },
    ],
    [
      'missing ETA lower bound',
      { pod_eta_changed_at: '<=2026-10-05T00:00:00Z' },
    ],
    [
      'ETA stopped conflict',
      { pod_eta_changed_at: '>=2026-10-01T00:00:00Z', tracking_stopped: true },
    ],
    [
      'arrival presence conflict',
      { voyage_status: 'arrived', pod_ata_at: '@not_exists' },
    ],
    [
      'unknown party operator',
      {
        party_id: {
          value: '00000000-0000-4000-8000-000000000001',
          operator: 'none',
        },
      },
    ],
    ['scope presence unsupported', { pod_code: '@exists' }],
  ];
  for (const [name, filters] of invalidShipments)
    it(`shipment: ${name}`, async () => {
      const { client, fetchImpl } = clientFixture();
      await expect(client.listShipments(filters as any)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  it('identifies the invalid filter without echoing the supplied value', () => {
    expect(() =>
      buildContainerListQuery({ current_status: 'SECRET_INPUT' as any }),
    ).toThrow('current_status');
    expect(() =>
      buildContainerListQuery({ current_status: 'SECRET_INPUT' as any }),
    ).not.toThrow('SECRET_INPUT');
  });
});

describe('builder defaults and generic page cap', () => {
  it('keeps include and shape knobs separate from filter keys', () => {
    expect(
      buildShipmentListQuery({ number: 'BOL123', includeContainers: false }, [
        'pod_terminal',
      ]).query,
    ).toEqual({ 'filter[number]': 'BOL123', include: 'pod_terminal' });
    expect(
      buildContainerListQuery({ include: [] }, ['shipment']).query,
    ).toEqual({});
  });
  it('preserves the legacy generic SDK cap while the container endpoint uses 50', () => {
    expect(clampPageSize(9999)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(undefined)).toBeUndefined();
  });
});
