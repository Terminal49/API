import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vite-plus/test';
import { Terminal49Client } from '@terminal49/sdk';
import {
  shipmentListInputSchema,
  containerListInputSchema,
  getShipmentFilters,
  getContainerFilters,
  SHIPMENT_FILTER_KEYS,
  CONTAINER_FILTER_KEYS,
  getListResponseMetadata,
} from './list-filters.js';
import { executeListShipments } from './list-shipments.js';
import { executeListContainers } from './list-containers.js';
const spec = JSON.parse(
  readFileSync(
    new URL('../../../../docs/openapi.json', import.meta.url),
    'utf8',
  ),
);
const sourceFilters = (endpoint: string) =>
  spec.paths[endpoint].get.parameters.filter(
    (p: Record<string, unknown>) => p['x-t49-filter-kind'],
  );

const CUSTOM_FIELD_DEFINITIONS = {
  data: [
    {
      id: 'def-po',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'purchase_order_number',
        display_name: 'Purchase Order Number',
        data_type: 'short_text',
      },
    },
  ],
};

function fakeClient(links: unknown = { next: null }) {
  const fetchImpl = vi.fn(
    async (input: Parameters<typeof fetch>[0]) =>
      new Response(
        JSON.stringify(
          String((input as Request).url ?? input).includes(
            '/custom_field_definitions',
          )
            ? CUSTOM_FIELD_DEFINITIONS
            : { data: [], links, meta: { total: 100 } },
        ),
        {
          status: 200,
          headers: { 'content-type': 'application/vnd.api+json' },
        },
      ),
  );
  return {
    client: new Terminal49Client({
      apiToken: 'TEST_KEY',
      accountId: 'acct-1',
      fetchImpl,
    }),
    fetchImpl,
  };
}

describe('confirmed list filter inputs', () => {
  for (const [endpoint, schema, keys, helper, execute] of [
    [
      '/shipments',
      shipmentListInputSchema,
      SHIPMENT_FILTER_KEYS,
      getShipmentFilters,
      executeListShipments,
    ],
    [
      '/containers',
      containerListInputSchema,
      CONTAINER_FILTER_KEYS,
      getContainerFilters,
      executeListContainers,
    ],
  ] as const) {
    it(`${endpoint} exposes every confirmed OpenAPI filter and no extra filter`, () => {
      expect([...keys]).toEqual(
        sourceFilters(endpoint).map((p: any) => p['x-t49-filter-key']),
      );
      expect(Object.keys(schema.shape.advanced_filters.unwrap().shape)).toEqual(
        [...keys],
      );
    });
    for (const p of sourceFilters(endpoint)) {
      const key = p['x-t49-filter-key'];
      it(`${endpoint} forwards ${key} through the real SDK`, async () => {
        const { client, fetchImpl } = fakeClient();
        const filters = {
          [key]: p.example,
          ...(key === 'tags_and' ? { tags: 'priority' } : {}),
        };
        const args = { advanced_filters: filters };
        expect((helper as any)(args)).toEqual(filters);
        await (execute as any)(args, client);
        expect(fetchImpl).toHaveBeenCalledTimes(
          key === 'custom_fields' ? 2 : 1,
        );
        const url = new URL(
          (fetchImpl.mock.calls.at(-1) as unknown as [Request])[0].url,
        );
        expect(
          [...url.searchParams.keys()].some(
            (k) => k === `filter[${key}]` || k.startsWith(`filter[${key}][`),
          ),
        ).toBe(true);
      });
    }
  }
  it('rejects duplicates including identical values before I/O', async () => {
    const { client, fetchImpl } = fakeClient();
    await expect(
      executeListContainers(
        { has_holds: false, advanced_filters: { has_holds: false } },
        client,
      ),
    ).rejects.toThrow('duplicate filter');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('retains false, nested party arrays and the LFD two-date tuple', async () => {
    const { client, fetchImpl } = fakeClient({
      next: '/containers?page[number]=3',
    });
    const result = await executeListContainers(
      {
        has_holds: false,
        advanced_filters: {
          parties: { shipper: ['@not_exists'] },
          last_free_day_on: ['2026-10-01', '2026-10-07'],
        },
        page: 2,
        page_size: 100,
      },
      client,
    );
    const url = new URL(
      (fetchImpl.mock.calls[0] as unknown as [Request])[0].url,
    );
    expect(url.searchParams.get('filter[has_holds]')).toBe('false');
    expect(url.searchParams.getAll('filter[parties][shipper][]')).toEqual([
      '@not_exists',
    ]);
    expect(url.searchParams.getAll('filter[last_free_day_on][]')).toEqual([
      '2026-10-01',
      '2026-10-07',
    ]);
    expect(url.searchParams.get('page[size]')).toBe('25');
    expect(result._metadata).toMatchObject({
      has_more: true,
      next_page: 3,
      page: 2,
      page_size: 25,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('forwards shipment bounds, party operators and sort without metadata contamination', async () => {
    const { client, fetchImpl } = fakeClient();
    const result = await executeListShipments(
      {
        created_at: ['>=2026-10-01T00:00:00Z', '<2026-10-08T00:00:00Z'],
        advanced_filters: {
          party_id: {
            value: ['00000000-0000-4000-8000-000000000001'],
            operator: 'all',
          },
        },
        sort: '-pod_arrival',
        include_containers: true,
      },
      client,
    );
    const url = new URL(
      (fetchImpl.mock.calls[0] as unknown as [Request])[0].url,
    );
    expect(url.searchParams.getAll('filter[created_at][]')).toHaveLength(2);
    expect(url.searchParams.get('filter[party_id][operator]')).toBe('all');
    expect(url.searchParams.get('sort')).toBe('-pod_arrival');
    expect(result._metadata.applied_filters).not.toHaveProperty('sort');
    expect(result._metadata.applied_filters).not.toHaveProperty(
      'includeContainers',
    );
    expect(result._metadata.has_more).toBe(false);
  });
  for (const args of [
    { advanced_filters: { custom_fields: { 'Not A Slug': '@exists' } } },
    { advanced_filters: { pod_eta_at: 'today' } },
    { advanced_filters: { eta_changed_in_last_24h: false } },
    { advanced_filters: { parties: { invented_role: '@exists' } } },
    { current_status: 'invented_status' },
    { advanced_filters: { last_free_day_on: ['2026-10-01'] } },
    { advanced_filters: { last_free_day_on: ['2026-10-07', '2026-10-01'] } },
    { arrival: '2026-99-99' },
    { number: '~ABC' },
    { sort: 'invented_sort' },
    { page: 0 },
    { unrecognized: 'value' },
  ])
    it(`rejects malformed container input ${JSON.stringify(args)} before I/O`, async () => {
      const { client, fetchImpl } = fakeClient();
      await expect(
        executeListContainers(args as any, client),
      ).rejects.toThrow();
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  it('rejects malformed shipment bounds before I/O', async () => {
    const { client, fetchImpl } = fakeClient();
    await expect(
      executeListShipments({ created_at: '2026-10-01' }, client),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    [undefined, null],
    [{}, null],
    [{ next: null }, false],
    [{ next: '' }, false],
    [{ next: '/containers?page[number]=2' }, true],
  ])('reports link state %j as %j', (links, expected) => {
    expect(getListResponseMetadata({ links }, {}, {}, 25).has_more).toBe(
      expected,
    );
  });
});

describe('container number alternatives', () => {
  it.each(['common', 'advanced'] as const)(
    'preserves valid CSV alternatives longer than 64 characters through %s inputs',
    async (location) => {
      const number =
        'MSCU1234567,TCLU1234567,CAIU1234567,MAEU1234567,APLU1234567,OOLU1234567';
      const { client, fetchImpl } = fakeClient();
      await executeListContainers(
        location === 'common' ? { number } : { advanced_filters: { number } },
        client,
      );
      const request = fetchImpl.mock.calls[0][0];
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      expect(url.searchParams.get('filter[number]')).toBe(number);
    },
  );
});

describe('review regressions', () => {
  it.each([
    { tags: 'priority', advanced_filters: { tag: 'expedite' } },
    { advanced_filters: { tags: 'priority', tag: 'expedite' } },
  ])(
    'rejects competing shipment tag aliases before API access',
    async (args) => {
      const { client, fetchImpl } = fakeClient();
      await expect(executeListShipments(args, client)).rejects.toThrow(
        'tag and tags',
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
  it.each(['@exists', '@not_exists', 'available,on_ship', '=available'])(
    'forwards supported status array expression %s',
    async (status) => {
      const { client, fetchImpl } = fakeClient();
      await executeListContainers({ current_status: [status] }, client);
      const request = fetchImpl.mock.calls[0][0];
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      expect(url.searchParams.getAll('filter[current_status][]')).toEqual([
        status,
      ]);
    },
  );
  it.each([
    { number: ' MAEU123456789 ' },
    { advanced_filters: { number: ' MAEU123456789 ' } },
    { number: [' MAEU123456789 '] },
  ])(
    'normalizes pasted shipment numbers in the request and metadata',
    async (args) => {
      const { client, fetchImpl } = fakeClient();
      const result = await executeListShipments(args, client);
      const request = fetchImpl.mock.calls[0][0];
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      expect(
        url.searchParams.get('filter[number]') ??
          url.searchParams.get('filter[number][]'),
      ).toBe('MAEU123456789');
      expect(result._metadata.applied_filters.number).toEqual(
        Array.isArray(args.number) ? ['MAEU123456789'] : 'MAEU123456789',
      );
    },
  );
});
