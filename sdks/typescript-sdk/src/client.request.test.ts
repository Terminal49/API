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

  it('builds listShipments filters and pagination', async () => {
    const search = buildSearchParams([
      [
        'include',
        'containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal',
      ],
      ['filter[status]', 'in_transit'],
      ['filter[pod_locode]', 'USLAX'],
      ['filter[line_scac]', 'MAEU'],
      ['filter[updated_at]', '2024-01-01'],
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

    await client.listShipments(
      {
        status: 'in_transit',
        port: 'USLAX',
        carrier: 'MAEU',
        updatedAfter: '2024-01-01',
      },
      { page: 2, pageSize: 50 },
    );

    const params = calls[0].url.searchParams;
    expect(params.get('filter[status]')).toBe('in_transit');
    expect(params.get('filter[pod_locode]')).toBe('USLAX');
    expect(params.get('filter[line_scac]')).toBe('MAEU');
    expect(params.get('filter[updated_at]')).toBe('2024-01-01');
    expect(params.get('page[number]')).toBe('2');
    expect(params.get('page[size]')).toBe('50');
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

  it('builds listContainers filters and pagination with custom include', async () => {
    const search = buildSearchParams([
      ['include', 'shipment,pod_terminal,transport_events'],
      ['filter[status]', 'in_transit'],
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

    await client.listContainers(
      {
        status: 'in_transit',
        include: 'shipment,pod_terminal,transport_events',
      },
      { page: 3, pageSize: 10 },
    );

    const params = calls[0].url.searchParams;
    expect(params.get('include')).toBe(
      'shipment,pod_terminal,transport_events',
    );
    expect(params.get('filter[status]')).toBe('in_transit');
    expect(params.get('page[number]')).toBe('3');
    expect(params.get('page[size]')).toBe('10');
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
});
