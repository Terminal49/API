import { describe, expect, it } from 'vitest';
import { Terminal49Client, ValidationError } from './client.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';

function buildSearchParams(entries: Array<[string, string]>) {
  return entries.map(([key, value]) => `${key}=${value}`).join('&');
}

describe('Terminal49Client request building', () => {
  it('normalizes base URL without /v2', async () => {
    const { fetchImpl, calls } = createMockFetch({
      '/shipping_lines': () => jsonResponse({ data: [] }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: 'https://api.test',
      fetchImpl,
    });

    await client.listShippingLines();
    expect(calls[0].url.toString()).toBe('https://api.test/v2/shipping_lines');
  });

  it('uses defaultFormat when no format override is provided', async () => {
    const { fetchImpl } = createMockFetch({
      '/shipping_lines': () =>
        jsonResponse({
          data: [
            {
              type: 'shipping_line',
              id: '1',
              attributes: { scac: 'MAEU', name: 'Maersk' },
            },
          ],
        }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
      defaultFormat: 'mapped',
    });

    const result = (await client.listShippingLines()) as any[];
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].scac).toBe('MAEU');
    expect((result as any).data).toBeUndefined();
  });

  it('supports format=both to return raw and mapped data', async () => {
    const { fetchImpl } = createMockFetch({
      '/shipping_lines': () =>
        jsonResponse({
          data: [
            {
              type: 'shipping_line',
              id: '1',
              attributes: { scac: 'MAEU', name: 'Maersk' },
            },
          ],
        }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.listShippingLines(undefined, {
      format: 'both',
    })) as any;
    expect(result.raw?.data).toBeDefined();
    expect(result.mapped?.[0]?.scac).toBe('MAEU');
  });

  it('builds listShipments include + pagination and omits unsupported filters', async () => {
    const search = buildSearchParams([
      [
        'include',
        'containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal',
      ],
      ['page[number]', '2'],
      ['page[size]', '50'],
    ]);

    const { fetchImpl, calls } = createMockFetch({
      [`/shipments?${search}`]: () => jsonResponse({ data: [] }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = await client.listShipments(
      {
        status: 'in_transit',
        port: 'USLAX',
        carrier: 'MAEU',
        updatedAfter: '2024-01-01',
      },
      { page: 2, pageSize: 50, format: 'mapped' },
    );

    const params = calls[0].url.searchParams;
    // The v2 API does not support these filter[*] keys, so the SDK omits them
    // instead of sending no-op params.
    expect(params.get('filter[status]')).toBeNull();
    expect(params.get('filter[pod_locode]')).toBeNull();
    expect(params.get('filter[line_scac]')).toBeNull();
    expect(params.get('filter[updated_at]')).toBeNull();
    expect(params.get('page[number]')).toBe('2');
    expect(params.get('page[size]')).toBe('50');
    // ...and reports them back so callers know they were dropped. Sort both
    // sides so the assertion does not couple to UNSUPPORTED_FILTER_KEYS order.
    expect(result.unsupportedFilters?.sort()).toEqual(
      ['status', 'port', 'carrier', 'updatedAfter'].sort(),
    );
  });

  it('removes containers from include when includeContainers=false', async () => {
    const search = buildSearchParams([
      [
        'include',
        'pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal',
      ],
    ]);

    const { fetchImpl, calls } = createMockFetch({
      [`/shipments?${search}`]: () => jsonResponse({ data: [] }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.listShipments({ includeContainers: false });

    const include = calls[0].url.searchParams.get('include');
    expect(include).not.toContain('containers');
  });

  it('accepts comma-separated listShipments include strings', async () => {
    const search = buildSearchParams([['include', 'containers,pod_terminal']]);

    const { fetchImpl, calls } = createMockFetch({
      [`/shipments?${search}`]: () => jsonResponse({ data: [] }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.listShipments({
      status: 'in_transit',
      include: 'containers,pod_terminal',
    });

    const params = calls[0].url.searchParams;
    expect(params.get('include')).toBe('containers,pod_terminal');
    // Unsupported filter is dropped rather than forwarded as a no-op.
    expect(params.get('filter[status]')).toBeNull();
  });

  it('builds listContainers include + pagination and omits unsupported filters', async () => {
    const search = buildSearchParams([
      ['include', 'shipment,pod_terminal,transport_events'],
      ['page[number]', '3'],
      ['page[size]', '10'],
    ]);

    const { fetchImpl, calls } = createMockFetch({
      [`/containers?${search}`]: () => jsonResponse({ data: [] }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = await client.listContainers(
      {
        status: 'in_transit',
        include: ['shipment', 'pod_terminal', 'transport_events'],
      },
      { page: 3, pageSize: 10, format: 'mapped' },
    );

    const params = calls[0].url.searchParams;
    expect(params.get('include')).toBe(
      'shipment,pod_terminal,transport_events',
    );
    // `filter[status]` is unsupported on /containers, so it is omitted.
    expect(params.get('filter[status]')).toBeNull();
    expect(params.get('page[number]')).toBe('3');
    expect(params.get('page[size]')).toBe('10');
    expect(result.unsupportedFilters).toEqual(['status']);
  });

  it('accepts comma-separated listContainers include strings', async () => {
    const search = buildSearchParams([['include', 'shipment,pod_terminal']]);

    const { fetchImpl, calls } = createMockFetch({
      [`/containers?${search}`]: () => jsonResponse({ data: [] }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.listContainers({
      status: 'available',
      include: 'shipment,pod_terminal',
    });

    const params = calls[0].url.searchParams;
    expect(params.get('include')).toBe('shipment,pod_terminal');
    // Unsupported filter is dropped rather than forwarded as a no-op.
    expect(params.get('filter[status]')).toBeNull();
  });

  it('hits container raw events and refresh endpoints', async () => {
    const { fetchImpl, calls } = createMockFetch({
      '/containers/cont-1/raw_events': () => jsonResponse({ data: [] }),
      '/containers/cont-1/refresh': () =>
        jsonResponse({ data: { id: 'cont-1' } }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.getContainerRawEvents('cont-1');
    await client.refreshContainer('cont-1');

    expect(
      calls[0].url.pathname.endsWith('/containers/cont-1/raw_events'),
    ).toBe(true);
    expect(calls[1].url.pathname.endsWith('/containers/cont-1/refresh')).toBe(
      true,
    );
    expect(calls[1].init?.method).toBe('PATCH');
  });

  it('lists tracking requests with pagination and supports alias', async () => {
    const search = buildSearchParams([
      ['page[number]', '2'],
      ['page[size]', '25'],
    ]);

    const { fetchImpl, calls } = createMockFetch({
      [`/tracking_requests?${search}`]: () => jsonResponse({ data: [] }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.listTrackingRequests({}, { page: 2, pageSize: 25 });
    await client.listTrackRequests({}, { page: 2, pageSize: 25 });

    expect(calls.length).toBe(2);
  });

  it('accepts comma-separated tracking request include strings', async () => {
    const search = buildSearchParams([
      ['filter[status]', 'pending'],
      ['include', 'shipment,container'],
    ]);

    const { fetchImpl, calls } = createMockFetch({
      [`/tracking_requests?${search}`]: () => jsonResponse({ data: [] }),
      '/tracking_requests/tr-1?include=shipment,container': () =>
        jsonResponse({ data: { id: 'tr-1' } }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.listTrackingRequests({
      'filter[status]': 'pending',
      include: 'shipment,container',
    });
    await client.getTrackingRequest('tr-1', {
      include: 'shipment,container',
    });

    expect(calls[0].url.searchParams.get('include')).toBe('shipment,container');
    expect(calls[1].url.searchParams.get('include')).toBe('shipment,container');
  });

  it('sends JSON:API payload for updateTrackingRequest', async () => {
    let captured: any = null;
    const { fetchImpl } = createMockFetch({
      '/tracking_requests/tr-1': (init) => {
        captured = JSON.parse(String(init?.body));
        return jsonResponse({ data: { id: 'tr-1' } });
      },
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.updateTrackingRequest('tr-1', { status: 'paused' });

    expect(captured).toEqual({
      data: {
        type: 'tracking_request',
        id: 'tr-1',
        attributes: { status: 'paused' },
      },
    });
  });

  it('uses inferred selected scac when creating tracking request from infer', async () => {
    let captured: any = null;
    const { fetchImpl } = createMockFetch({
      '/tracking_requests/infer_number': () =>
        jsonResponse({
          data: {
            attributes: {
              number_type: 'container',
              shipping_line: { selected: { scac: 'MAEU' }, candidates: [] },
            },
          },
        }),
      '/tracking_requests': (init) => {
        captured = JSON.parse(String(init?.body));
        return jsonResponse({ data: { id: 'tr-1' } }, 201);
      },
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.createTrackingRequestFromInfer('MSCU1234567');
    expect(captured.data.attributes.scac).toBe('MAEU');
  });

  it('uses inferred candidate scac when only one is present', async () => {
    let captured: any = null;
    const { fetchImpl } = createMockFetch({
      '/tracking_requests/infer_number': () =>
        jsonResponse({
          data: {
            attributes: {
              number_type: 'container',
              shipping_line: { candidates: [{ scac: 'CAND' }] },
            },
          },
        }),
      '/tracking_requests': (init) => {
        captured = JSON.parse(String(init?.body));
        return jsonResponse({ data: { id: 'tr-2' } }, 201);
      },
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.createTrackingRequestFromInfer('MSCU1234567');
    expect(captured.data.attributes.scac).toBe('CAND');
  });

  it('throws when infer does not provide number type', async () => {
    const { fetchImpl } = createMockFetch({
      '/tracking_requests/infer_number': () =>
        jsonResponse({
          data: {
            attributes: {
              shipping_line: { selected: { scac: 'MAEU' } },
            },
          },
        }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await expect(
      client.createTrackingRequestFromInfer('MSCU1234567'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('throws when infer does not provide scac', async () => {
    const { fetchImpl } = createMockFetch({
      '/tracking_requests/infer_number': () =>
        jsonResponse({
          data: {
            attributes: {
              number_type: 'container',
              shipping_line: { candidates: [] },
            },
          },
        }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await expect(
      client.createTrackingRequestFromInfer('MSCU1234567'),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sends JSON:API payloads for shipment updates and tracking controls', async () => {
    let updatePayload: any = null;
    let stopPayload: any = null;
    let resumePayload: any = null;

    const { fetchImpl, calls } = createMockFetch({
      '/shipments/ship-1': (init) => {
        updatePayload = JSON.parse(String(init?.body));
        return jsonResponse({ data: { id: 'ship-1' } });
      },
      '/shipments/ship-1/stop_tracking': (init) => {
        stopPayload = JSON.parse(String(init?.body));
        return jsonResponse({ data: { id: 'ship-1' } });
      },
      '/shipments/ship-1/resume_tracking': (init) => {
        resumePayload = JSON.parse(String(init?.body));
        return jsonResponse({ data: { id: 'ship-1' } });
      },
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.updateShipment('ship-1', { status: 'paused' });
    await client.stopTrackingShipment('ship-1');
    await client.resumeTrackingShipment('ship-1');

    expect(updatePayload).toEqual({
      data: {
        type: 'shipment',
        id: 'ship-1',
        attributes: { status: 'paused' },
      },
    });
    expect(stopPayload).toEqual({
      data: { type: 'shipment', id: 'ship-1' },
    });
    expect(resumePayload).toEqual({
      data: { type: 'shipment', id: 'ship-1' },
    });

    expect(calls[0].init?.method).toBe('PATCH');
    expect(calls[1].init?.method).toBe('PATCH');
    expect(calls[2].init?.method).toBe('PATCH');
  });

  it('derives demurrage fields from container attributes', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/cont-1?include=pod_terminal': () =>
        jsonResponse({
          data: {
            id: 'cont-1',
            attributes: {
              pickup_lfd: '2024-02-01',
              pickup_appointment_at: '2024-02-02T00:00:00Z',
              available_for_pickup: true,
              fees_at_pod_terminal: [{ amount: 10 }],
              holds_at_pod_terminal: [{ type: 'customs' }],
              pod_arrived_at: '2024-01-30T00:00:00Z',
              pod_discharged_at: '2024-01-31T00:00:00Z',
            },
          },
        }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const demurrage = await client.getDemurrage('cont-1');
    expect(demurrage).toEqual({
      container_id: 'cont-1',
      pickup_lfd: '2024-02-01',
      pickup_appointment_at: '2024-02-02T00:00:00Z',
      available_for_pickup: true,
      fees_at_pod_terminal: [{ amount: 10 }],
      holds_at_pod_terminal: [{ type: 'customs' }],
      pod_arrived_at: '2024-01-30T00:00:00Z',
      pod_discharged_at: '2024-01-31T00:00:00Z',
    });
  });

  it('filters rail milestones to rail events only', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/cont-1?include=transport_events': () =>
        jsonResponse({
          data: {
            id: 'cont-1',
            attributes: {
              pod_rail_carrier_scac: 'BNSF',
              ind_rail_carrier_scac: 'NS',
              pod_rail_loaded_at: '2024-01-01T00:00:00Z',
              pod_rail_departed_at: '2024-01-02T00:00:00Z',
              ind_rail_arrived_at: '2024-01-05T00:00:00Z',
              ind_rail_unloaded_at: '2024-01-06T00:00:00Z',
              ind_eta_at: '2024-01-04T00:00:00Z',
              ind_ata_at: '2024-01-05T00:00:00Z',
            },
          },
          included: [
            {
              id: 'rail-1',
              type: 'transport_event',
              attributes: {
                event: 'rail.loaded',
                event_time: '2024-01-02T00:00:00Z',
              },
            },
            {
              id: 'truck-1',
              type: 'transport_event',
              attributes: {
                event: 'truck.arrived',
                event_time: '2024-01-03T00:00:00Z',
              },
            },
          ],
        }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = await client.getRailMilestones('cont-1');
    expect(result.rail_events.length).toBe(1);
    expect(result.rail_events[0].event).toBe('rail.loaded');
  });

  it('supports manual search endpoint', async () => {
    const { fetchImpl } = createMockFetch({
      '/search?query=ABC123': () => jsonResponse({ hits: 2 }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = await client.search('ABC123');
    expect(result).toEqual({ hits: 2 });
  });

  it('provides an async iterator for paginated endpoints', async () => {
    const { fetchImpl } = createMockFetch({
      '/shipments?include=containers%2Cpod_terminal%2Cport_of_lading%2Cport_of_discharge%2Cdestination%2Cdestination_terminal&page%5Bnumber%5D=1&page%5Bsize%5D=1':
        () =>
          jsonResponse({
            data: [
              {
                id: 'ship-1',
                type: 'shipment',
                attributes: { status: 'in_transit' },
              },
            ],
            links: { next: 'page=2' },
          }),
      '/shipments?include=containers%2Cpod_terminal%2Cport_of_lading%2Cport_of_discharge%2Cdestination%2Cdestination_terminal&page%5Bnumber%5D=2&page%5Bsize%5D=1':
        () =>
          jsonResponse({
            data: [
              {
                id: 'ship-2',
                type: 'shipment',
                attributes: { status: 'discharged' },
              },
            ],
            links: { next: null },
          }),
      '/shipments?include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal&page[number]=1&page[size]=1':
        () =>
          jsonResponse({
            data: [
              {
                id: 'ship-1',
                type: 'shipment',
                attributes: { status: 'in_transit' },
              },
            ],
            links: { next: 'page=2' },
          }),
      '/shipments?include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal&page[number]=2&page[size]=1':
        () =>
          jsonResponse({
            data: [
              {
                id: 'ship-2',
                type: 'shipment',
                attributes: { status: 'discharged' },
              },
            ],
            links: { next: null },
          }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const items = [];
    for await (const shipment of client.shipments.iterate(
      {},
      { pageSize: 1 },
    )) {
      items.push(shipment);
    }

    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('ship-1');
    expect(items[0].status).toBe('in_transit');
    expect(items[1].id).toBe('ship-2');
    expect(items[1].status).toBe('discharged');
  });

  it('preserves Content-Type from openapi-fetch Request on POST writes', async () => {
    // Regression for a bug that caused 422 on every write: previously
    // `authedFetch` (now AuthInterceptor) created fresh Headers from init
    // only and replaced the Request's headers — dropping Content-Type and
    // making the body unparseable server-side. The current implementation
    // mutates `request.headers` in place, which preserves whatever
    // openapi-fetch set. Asserts the regression stays fixed.
    const { fetchImpl, calls } = createMockFetch({
      '/tracking_requests/infer_number': () =>
        jsonResponse({
          data: {
            type: 'infer_number_results',
            attributes: { number_type: 'bill_of_lading' },
          },
        }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.trackingRequests.inferNumber('HLCUAMM260301785');

    expect(calls.length).toBe(1);
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('Authorization')).toBe('Token token-123');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(calls[0].init?.body).toBe(
      JSON.stringify({ number: 'HLCUAMM260301785' }),
    );
  });
});
