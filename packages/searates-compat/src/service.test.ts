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
      message: 'API_KEY_REQUIRED',
      data: null,
    });
    await expect(gateway.tracking('wrong-key', query)).resolves.toEqual({
      status: 'error',
      message: 'API_KEY_WRONG',
      data: null,
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
      data: null,
    });
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
