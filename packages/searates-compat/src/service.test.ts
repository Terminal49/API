import { describe, expect, it } from 'vite-plus/test';
import {
  eventsFixture,
  shipmentFixture,
  shippingLinesFixture,
} from './__fixtures__/t49.js';
import { SeaRatesCompatibilityGateway } from './service.js';
import type { TrackingQuery } from './types.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

const query: TrackingQuery = {
  ais: false,
  forceUpdate: false,
  number: 'MEDUFR030802',
  route: false,
  sealine: 'MSCU',
  type: 'BL',
};

describe('SeaRates compatibility gateway', () => {
  it('returns the documented contract from fixture-backed public API calls', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('/shipments?')) {
        return response({
          data: [shipmentFixture.data],
          included: shipmentFixture.included,
        });
      }
      if (url.includes('/shipments/shipment-1')) {
        return response(shipmentFixture);
      }
      if (url.includes('/transport_events')) return response(eventsFixture);
      throw new Error(`Unexpected fixture request: ${url}`);
    };
    const gateway = new SeaRatesCompatibilityGateway({
      apiBaseUrl: 'https://api.example.test/v2',
      fetchImpl,
    });

    const result = await gateway.tracking('pass-through-key', query);

    expect(result).toMatchObject({
      status: 'success',
      message: 'OK',
      data: {
        metadata: { number: 'MEDUFR030802', type: 'BL' },
        locations: expect.any(Array),
        facilities: expect.any(Array),
        route: expect.any(Object),
        vessels: expect.any(Array),
        containers: [{ events: expect.any(Array) }],
      },
    });
  });

  it('returns SeaRates errors for missing and bad api_key values', async () => {
    const gateway = new SeaRatesCompatibilityGateway({
      clientSecret: 'gateway-key',
      serviceApiToken: 'service-token',
    });
    await expect(gateway.tracking(undefined, query)).resolves.toEqual({
      status: 'error',
      message: 'WRONG_PARAMETERS',
      data: {},
    });
    await expect(gateway.tracking('wrong-key', query)).resolves.toEqual({
      status: 'error',
      message: 'API_KEY_WRONG',
      data: {},
    });
  });

  it('maps an upstream authentication rejection to API_KEY_WRONG', async () => {
    const gateway = new SeaRatesCompatibilityGateway({
      fetchImpl: async () =>
        response(
          {
            errors: [{ status: '401', title: 'Unauthorized' }],
            data: null,
          },
          401,
        ),
    });
    await expect(gateway.tracking('bad-t49-key', query)).resolves.toEqual({
      status: 'error',
      message: 'API_KEY_WRONG',
      data: {},
    });
  });

  it('returns NO_TRACKING_INFO while T49 is still pending', async () => {
    const gateway = new SeaRatesCompatibilityGateway({
      pollTimeoutMs: 0,
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/shipments?')) return response({ data: [] });
        if (url.includes('/tracking_requests?')) {
          return response({
            data: [
              {
                id: 'request-1',
                type: 'tracking_request',
                attributes: {
                  request_type: 'bill_of_lading',
                  status: 'pending',
                },
                relationships: { tracked_object: { data: null } },
              },
            ],
          });
        }
        throw new Error(`Unexpected fixture request: ${url}`);
      },
    });

    await expect(gateway.tracking('pass-through-key', query)).resolves.toEqual({
      status: 'error',
      message: 'NO_TRACKING_INFO',
      data: {},
    });
  });

  it('does not exceed the ten-container force-refresh limit', async () => {
    if (!shipmentFixture.data || Array.isArray(shipmentFixture.data)) {
      throw new Error('Shipment fixture must contain one resource');
    }
    const included = Array.from({ length: 11 }, (_, index) => ({
      id: `container-${index}`,
      type: 'container',
      attributes: { number: `MSCU12345${String(index).padStart(2, '0')}` },
    }));
    let refreshCalls = 0;
    const document = {
      data: shipmentFixture.data,
      included,
    };
    const gateway = new SeaRatesCompatibilityGateway({
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (init?.method === 'PATCH') {
          refreshCalls += 1;
          return response({ data: null });
        }
        if (url.includes('/shipments?')) {
          return response({ data: [shipmentFixture.data] });
        }
        return response(document);
      },
    });

    await expect(
      gateway.tracking('pass-through-key', { ...query, forceUpdate: true }),
    ).resolves.toEqual({
      status: 'error',
      message: 'API_KEY_RATE_LIMIT',
      data: {},
    });
    expect(refreshCalls).toBe(0);
  });

  it('fetches events only for the requested CT shipment member', async () => {
    if (!shipmentFixture.data || Array.isArray(shipmentFixture.data)) {
      throw new Error('Shipment fixture must contain one resource');
    }
    const sibling = {
      id: 'container-sibling',
      type: 'container',
      attributes: {
        number: 'TCLU7654321',
        current_status: 'on_ship',
      },
    };
    const shipmentDocument = {
      ...shipmentFixture,
      included: [sibling, ...(shipmentFixture.included || [])],
    };
    const eventContainerIds: string[] = [];
    const gateway = new SeaRatesCompatibilityGateway({
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes('/containers?')) {
          return response({
            data: [
              {
                id: 'container-1',
                type: 'container',
                relationships: {
                  shipment: {
                    data: { id: 'shipment-1', type: 'shipment' },
                  },
                },
              },
            ],
          });
        }
        if (url.includes('/shipments/shipment-1')) {
          return response(shipmentDocument);
        }
        const eventMatch = url.match(/\/containers\/([^/]+)\/transport_events/);
        if (eventMatch?.[1]) {
          eventContainerIds.push(eventMatch[1]);
          return response(eventsFixture);
        }
        throw new Error(`Unexpected fixture request: ${url}`);
      },
    });

    await expect(
      gateway.tracking('pass-through-key', {
        ...query,
        number: 'MSCU1234567',
        type: 'CT',
      }),
    ).resolves.toMatchObject({ status: 'success', message: 'OK' });
    expect(eventContainerIds).toEqual(['container-1']);
  });

  it('does not serve the pre-refresh shipment when refresh stays unresolved', async () => {
    let refreshCalls = 0;
    let refreshAccepted = false;
    const requestOnlyUpdate = {
      ...shipmentFixture,
      included: (shipmentFixture.included || []).map((resource) =>
        resource.type === 'container'
          ? {
              ...resource,
              attributes: {
                ...resource.attributes,
                pod_last_tracking_request_at: '2026-08-20T12:00:00Z',
                shipment_last_tracking_request_at: '2026-08-20T12:00:00Z',
              },
            }
          : resource,
      ),
    };
    const gateway = new SeaRatesCompatibilityGateway({
      pollIntervalMs: 0,
      pollTimeoutMs: 5,
      fetchImpl: async (input, init) => {
        const url = String(input);
        if (init?.method === 'PATCH') {
          refreshCalls += 1;
          refreshAccepted = true;
          return response({ data: null });
        }
        if (url.includes('/shipments?')) {
          return response({ data: [shipmentFixture.data] });
        }
        return response(refreshAccepted ? requestOnlyUpdate : shipmentFixture);
      },
    });

    await expect(
      gateway.tracking('pass-through-key', { ...query, forceUpdate: true }),
    ).resolves.toEqual({
      status: 'error',
      message: 'NO_TRACKING_INFO',
      data: {},
    });
    expect(refreshCalls).toBe(1);
  });

  it('serves the sealines dictionary from /shipping_lines', async () => {
    const gateway = new SeaRatesCompatibilityGateway({
      serviceApiToken: 'service-token',
      fetchImpl: async (input) => {
        expect(String(input).endsWith('/shipping_lines')).toBe(true);
        return response(shippingLinesFixture);
      },
    });
    const result = await gateway.shippingLines();
    expect(result).toMatchObject({
      status: 'success',
      message: 'OK',
      data: [{ scac_codes: ['MSCU', 'MEDU'] }],
    });
  });
});
