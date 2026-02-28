import { describe, expect, it } from 'vitest';
import {
  FeatureNotEnabledError,
  NotFoundError,
  Terminal49Client,
  ValidationError,
} from './client.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';

describe('Terminal49Client', () => {
  it('retries on 500 and succeeds on second attempt', async () => {
    let attempt = 0;
    const { fetchImpl, calls } = createMockFetch({
      '/containers/abc/route?include=port,vessel,route_location': () => {
        attempt += 1;
        if (attempt === 1) {
          return jsonResponse({ errors: [{ detail: 'server error' }] }, 500);
        }
        return jsonResponse({ data: { id: 'route-1' } });
      },
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
      maxRetries: 1,
    } as any);

    const result = await client.getContainerRoute('abc');
    expect(result.data.id).toBe('route-1');
    expect(calls.length).toBe(2);
  });

  it('maps 404 responses to NotFoundError', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/missing?include=shipment,pod_terminal': () =>
        jsonResponse({ errors: [{ detail: 'not found' }] }, 404),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await expect(client.getContainer('missing')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('adds auth header and include params when fetching container', async () => {
    const { fetchImpl, calls } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ data: { id: 'abc', attributes: {} } }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = await client.getContainer('abc');

    expect(result.data.id).toBe('abc');
    expect(calls.length).toBe(1);

    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('Authorization')).toBe('Token token-123');
    expect(calls[0].url.searchParams.get('include')).toBe(
      'shipment,pod_terminal',
    );
  });

  it('preserves Bearer-prefixed tokens when building auth header', async () => {
    const { fetchImpl, calls } = createMockFetch({
      '/containers/abc?include=shipment,pod_terminal': () =>
        jsonResponse({ data: { id: 'abc', attributes: {} } }),
    });

    const client = new Terminal49Client({
      apiToken: 'Bearer jwt-token-value',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.getContainer('abc');

    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer jwt-token-value');
  });

  it('sets include params on shipment and lists shipping lines with search', async () => {
    const { fetchImpl, calls } = createMockFetch({
      '/shipments/ship-1?include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal':
        () => jsonResponse({ data: { id: 'ship-1' } }),
      '/shipping_lines?search=MAEU': () =>
        jsonResponse({
          data: [{ attributes: { scac: 'MAEU', name: 'Maersk' } }],
        }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.getShipment('ship-1');
    await client.listShippingLines('MAEU');

    const includeCall = calls.find((c) =>
      c.url.pathname.endsWith('/shipments/ship-1'),
    );
    expect(includeCall).toBeDefined();
    expect(includeCall?.url.searchParams.get('include')).toContain(
      'containers',
    );

    const shippingCall = calls.find((c) =>
      c.url.pathname.endsWith('/shipping_lines'),
    );
    expect(shippingCall).toBeDefined();
    expect(shippingCall?.url.searchParams.get('search')).toBe('MAEU');
  });

  it('sends JSON:API payload when tracking container', async () => {
    let capturedBody: any = null;
    const { fetchImpl } = createMockFetch({
      '/tracking_requests': (init) => {
        capturedBody = JSON.parse(String(init?.body));
        return jsonResponse({ data: { id: 'tr-1', attributes: {} } }, 201);
      },
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await client.trackContainer({
      containerNumber: 'MSCU1234567',
      scac: 'MSCU',
    });

    expect(capturedBody).toEqual({
      data: {
        type: 'tracking_request',
        attributes: {
          request_type: 'container',
          request_number: 'MSCU1234567',
          scac: 'MSCU',
          ref_numbers: undefined,
        },
      },
    });
  });

  it('uses deserialize helper to flatten JSON:API with included', async () => {
    const doc = {
      data: {
        id: 'cont-1',
        type: 'container',
        attributes: { number: 'MSCU1234567' },
        relationships: {
          shipment: { data: { type: 'shipment', id: 'ship-1' } },
        },
      },
      included: [
        {
          id: 'ship-1',
          type: 'shipment',
          attributes: { bill_of_lading_number: 'BL123' },
        },
      ],
    };

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl: async () => jsonResponse(doc),
    });

    const result = await client.getContainer('cont-1');
    const simplified = client.deserialize<any>(result);

    expect(simplified.id).toBe('cont-1');
    expect(simplified.shipment?.id).toBe('ship-1');
    expect(simplified.shipment?.bill_of_lading_number).toBe('BL123');
  });

  it('maps tracking request with linked shipment/container', async () => {
    const doc = {
      data: {
        id: 'tr-1',
        type: 'tracking_request',
        attributes: {
          request_type: 'container',
          request_number: 'MSCU1234567',
          status: 'created',
          scac: 'MSCU',
        },
        relationships: {
          shipment: { data: { type: 'shipment', id: 'ship-1' } },
          container: { data: { type: 'container', id: 'cont-1' } },
        },
      },
      included: [
        {
          id: 'ship-1',
          type: 'shipment',
          attributes: {
            bill_of_lading_number: 'BL123',
            shipping_line_scac: 'MSCU',
          },
        },
        {
          id: 'cont-1',
          type: 'container',
          attributes: { number: 'MSCU1234567', status: 'in_transit' },
        },
      ],
    };

    const { fetchImpl } = createMockFetch({
      '/tracking_requests/tr-1': () => jsonResponse(doc),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = await client.getTrackingRequest('tr-1', {
      format: 'mapped',
    });
    expect((result as any).shipment?.id).toBe('ship-1');
    expect((result as any).container?.number).toBe('MSCU1234567');
  });

  it('maps container list with equipment and terminals when included', async () => {
    const doc = {
      data: [
        {
          id: 'cont-1',
          type: 'container',
          attributes: {
            number: 'MSCU1234567',
            status: 'in_transit',
            equipment_type: 'dry',
            equipment_length: 40,
            equipment_height: 9,
            weight_in_lbs: 22000,
            location_at_pod_terminal: 'LAX',
            available_for_pickup: true,
            pod_arrived_at: '2024-01-01T00:00:00Z',
            pod_discharged_at: '2024-01-02T00:00:00Z',
            pickup_lfd: '2024-01-05',
            pickup_appointment_at: '2024-01-04T00:00:00Z',
          },
          relationships: {
            pod_terminal: { data: { type: 'terminal', id: 'term-1' } },
          },
        },
      ],
      included: [
        {
          id: 'term-1',
          type: 'terminal',
          attributes: {
            name: 'Terminal 1',
            nickname: 'T1',
            firms_code: 'F123',
          },
        },
      ],
    };

    const { fetchImpl } = createMockFetch({
      '/containers?include=shipment,pod_terminal': () => jsonResponse(doc),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.listContainers(
      {},
      { format: 'mapped' },
    )) as any;
    expect(result.items[0].equipment?.type).toBe('dry');
    expect(result.items[0].terminals?.podTerminal?.name).toBe('Terminal 1');
  });

  it('maps transport events with location/terminal', async () => {
    const doc = {
      data: [
        {
          id: 'ev-1',
          type: 'transport_event',
          attributes: {
            event: 'container.transport.vessel_loaded',
            event_time: '2024-01-01T00:00:00Z',
          },
          relationships: {
            location: { data: { id: 'loc-1', type: 'location' } },
            terminal: { data: { id: 'term-1', type: 'terminal' } },
          },
        },
      ],
      included: [
        {
          id: 'loc-1',
          type: 'location',
          attributes: { name: 'Los Angeles', locode: 'USLAX' },
        },
        {
          id: 'term-1',
          type: 'terminal',
          attributes: { name: 'Yusen', nickname: 'YUS', firms_code: 'Y790' },
        },
      ],
    };

    const { fetchImpl } = createMockFetch({
      '/containers/abc/transport_events?include=location,terminal': () =>
        jsonResponse(doc),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const events = (await client.getContainerTransportEvents('abc', {
      format: 'mapped',
    })) as any[];
    expect(events[0].event).toBe('container.transport.vessel_loaded');
    expect(events[0].location?.locode).toBe('USLAX');
    expect(events[0].terminal?.firmsCode).toBe('Y790');
  });

  it('maps 403 feature gating to FeatureNotEnabledError', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers/abc/route?include=port,vessel,route_location': () =>
        jsonResponse({ errors: [{ detail: 'Feature not enabled' }] }, 403),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await expect(client.getContainerRoute('abc')).rejects.toBeInstanceOf(
      FeatureNotEnabledError,
    );
  });

  it('handles validation errors with proper message extraction', async () => {
    const { fetchImpl } = createMockFetch({
      '/tracking_requests': () =>
        jsonResponse(
          {
            errors: [
              {
                detail: 'request_number is required',
                source: { pointer: '/data/attributes/request_number' },
              },
            ],
          },
          400,
        ),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    await expect(
      client.trackContainer({ bookingNumber: '', refNumbers: ['a'] }),
    ).rejects.toThrowError(
      /request_number is required \(\/data\/attributes\/request_number\)/,
    );

    await expect(
      client.trackContainer({ bookingNumber: '', refNumbers: ['a'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('supports manual search endpoint', async () => {
    const { fetchImpl } = createMockFetch({
      '/search?query=ABC123': () => jsonResponse({ hits: 1 }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = await client.search('ABC123');
    expect(result).toEqual({ hits: 1 });
  });
});
