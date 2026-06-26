import { describe, expect, it } from 'vitest';
import { Terminal49Client } from './client.js';
import {
  buildContainerListQuery,
  buildShipmentListQuery,
  clampPageSize,
  MAX_PAGE_SIZE,
} from './client/query.js';

const baseUrl = 'https://api.test/v2';

/**
 * Permissive fetch that records each call and always returns an empty
 * JSON:API document, regardless of query string. Lets us assert on the
 * emitted query keys without registering exact URLs.
 */
function createRecordingFetch() {
  const calls: URL[] = [];
  const fetchImpl = (async (input: Request | URL | string) => {
    const urlString =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push(new URL(urlString));
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function makeClient(fetchImpl: typeof fetch) {
  return new Terminal49Client({
    apiToken: 'token-123',
    apiBaseUrl: baseUrl,
    fetchImpl,
  });
}

describe('pure list-query builders', () => {
  it('drops every unsupported container filter and reports them', () => {
    const { query, unsupportedFilters } = buildContainerListQuery({
      status: 'in_transit',
      port: 'USLAX',
      carrier: 'MAEU',
      updatedAfter: '2024-01-01',
    });

    expect(query['filter[status]' as keyof typeof query]).toBeUndefined();
    expect(query['filter[pod_locode]' as keyof typeof query]).toBeUndefined();
    expect(query['filter[line_scac]' as keyof typeof query]).toBeUndefined();
    expect(query['filter[updated_at]' as keyof typeof query]).toBeUndefined();
    expect(unsupportedFilters.sort()).toEqual(
      ['carrier', 'port', 'status', 'updatedAfter'].sort(),
    );
  });

  it('keeps supported container keys (include) and reports nothing unsupported', () => {
    const { query, unsupportedFilters } = buildContainerListQuery({
      include: 'shipment,pod_terminal',
    });
    expect(query.include).toBe('shipment,pod_terminal');
    expect(unsupportedFilters).toEqual([]);
  });

  it('drops unsupported shipment filters but keeps supported ones', () => {
    const { query, unsupportedFilters } = buildShipmentListQuery({
      status: 'in_transit',
      port: 'USLAX',
      carrier: 'MAEU',
      updatedAfter: '2024-01-01',
      trackingStopped: true,
      number: 'TRK-1',
      include: 'containers',
    });

    // unsupported keys are never emitted
    expect(query['filter[status]' as keyof typeof query]).toBeUndefined();
    expect(query['filter[pod_locode]' as keyof typeof query]).toBeUndefined();
    expect(query['filter[line_scac]' as keyof typeof query]).toBeUndefined();
    expect(query['filter[updated_at]' as keyof typeof query]).toBeUndefined();

    // supported keys ARE emitted
    expect(query['filter[tracking_stopped]']).toBe(true);
    expect(query.number).toBe('TRK-1');
    expect(query.include).toBe('containers');

    expect(unsupportedFilters.sort()).toEqual(
      ['carrier', 'port', 'status', 'updatedAfter'].sort(),
    );
  });

  it('clamps page size to the API maximum and floors at 1', () => {
    expect(clampPageSize(9999)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(MAX_PAGE_SIZE + 1)).toBe(MAX_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(-5)).toBe(1);
    expect(clampPageSize(25)).toBe(25);
    expect(clampPageSize(undefined)).toBeUndefined();
  });
});

describe('ContainerManager.list filter correctness', () => {
  it('does NOT emit filter[*] keys for unsupported status/port/carrier/updatedAfter', async () => {
    const { fetchImpl, calls } = createRecordingFetch();
    const client = makeClient(fetchImpl);

    await client.listContainers({
      status: 'in_transit',
      port: 'USLAX',
      carrier: 'MAEU',
      updatedAfter: '2024-01-01',
    });

    const params = calls[0].searchParams;
    expect(params.get('filter[status]')).toBeNull();
    expect(params.get('filter[pod_locode]')).toBeNull();
    expect(params.get('filter[line_scac]')).toBeNull();
    expect(params.get('filter[updated_at]')).toBeNull();
    // include (a supported key) is still emitted
    expect(params.get('include')).toContain('shipment');
  });

  it('reports the dropped filters via unsupportedFilters on the mapped result', async () => {
    const { fetchImpl } = createRecordingFetch();
    const client = makeClient(fetchImpl);

    const result = (await client.listContainers(
      { status: 'in_transit', port: 'USLAX' },
      { format: 'mapped' },
    )) as { unsupportedFilters?: string[] };

    expect(result.unsupportedFilters?.sort()).toEqual(['port', 'status']);
  });

  it('clamps an over-large page size before sending', async () => {
    const { fetchImpl, calls } = createRecordingFetch();
    const client = makeClient(fetchImpl);

    await client.listContainers({}, { pageSize: 9999 });

    expect(calls[0].searchParams.get('page[size]')).toBe(String(MAX_PAGE_SIZE));
  });
});

describe('ShipmentManager.list filter correctness', () => {
  it('does NOT emit filter[*] keys for unsupported status/port/carrier/updatedAfter', async () => {
    const { fetchImpl, calls } = createRecordingFetch();
    const client = makeClient(fetchImpl);

    await client.listShipments({
      status: 'in_transit',
      port: 'USLAX',
      carrier: 'MAEU',
      updatedAfter: '2024-01-01',
    });

    const params = calls[0].searchParams;
    expect(params.get('filter[status]')).toBeNull();
    expect(params.get('filter[pod_locode]')).toBeNull();
    expect(params.get('filter[line_scac]')).toBeNull();
    expect(params.get('filter[updated_at]')).toBeNull();
  });

  it('emits the supported filter[tracking_stopped] key when requested', async () => {
    const { fetchImpl, calls } = createRecordingFetch();
    const client = makeClient(fetchImpl);

    // trackingStopped is a manager-level filter (the wrapper keeps its
    // historical signature), so exercise the manager directly.
    await client.shipments.list({ trackingStopped: true });

    expect(calls[0].searchParams.get('filter[tracking_stopped]')).toBe('true');
  });

  it('reports the dropped filters via unsupportedFilters on the mapped result', async () => {
    const { fetchImpl } = createRecordingFetch();
    const client = makeClient(fetchImpl);

    const result = (await client.listShipments(
      { carrier: 'MAEU', updatedAfter: '2024-01-01' },
      { format: 'mapped' },
    )) as { unsupportedFilters?: string[] };

    expect(result.unsupportedFilters?.sort()).toEqual([
      'carrier',
      'updatedAfter',
    ]);
  });
});
