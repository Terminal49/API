import { describe, expect, it } from 'vite-plus/test';
import { Terminal49PublicClient } from './client.js';
import type { TrackingType } from './types.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}

describe('tracking request shaping', () => {
  it.each([
    ['CT', 'container'],
    ['BL', 'bill_of_lading'],
    ['BK', 'booking_number'],
  ] as const)('maps %s to T49 request_type %s', async (type, expected) => {
    const requests: Array<{ init?: RequestInit; url: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ init, url });
      if (url.includes('/tracking_requests?')) {
        return jsonResponse({ data: [] });
      }
      return jsonResponse(
        {
          data: {
            id: 'request-1',
            type: 'tracking_request',
            attributes: { status: 'pending' },
            relationships: { tracked_object: { data: null } },
          },
        },
        201,
      );
    };
    const client = new Terminal49PublicClient({
      apiToken: 'test-token',
      baseUrl: 'https://api.example.test/v2',
      fetchImpl,
      pollTimeoutMs: 0,
    });

    await client.resolveTrackingRequest({
      number: 'EXAMPLE123',
      scac: 'MSCU',
      type: type as TrackingType,
    });

    const create = requests.find((request) => request.init?.method === 'POST');
    expect(JSON.parse(String(create?.init?.body))).toMatchObject({
      data: {
        type: 'tracking_request',
        attributes: {
          request_number: 'EXAMPLE123',
          request_type: expected,
          scac: 'MSCU',
        },
      },
    });
    expect(create?.init?.headers).toMatchObject({
      Authorization: 'Token test-token',
    });
  });

  it('reuses only an active request with the matching request type', async () => {
    const requests: Array<{ init?: RequestInit; url: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      requests.push({ init, url });
      return jsonResponse({
        data: [
          {
            id: 'failed-bl',
            type: 'tracking_request',
            attributes: {
              request_type: 'bill_of_lading',
              status: 'failed',
              updated_at: '2026-08-03T00:00:00Z',
            },
          },
          {
            id: 'tracked-booking',
            type: 'tracking_request',
            attributes: {
              request_type: 'booking_number',
              status: 'created',
              updated_at: '2026-08-02T00:00:00Z',
            },
            relationships: {
              tracked_object: {
                data: { id: 'wrong-shipment', type: 'shipment' },
              },
            },
          },
          {
            id: 'pending-bl',
            type: 'tracking_request',
            attributes: {
              request_type: 'bill_of_lading',
              status: 'pending',
              updated_at: '2026-08-01T00:00:00Z',
            },
          },
        ],
      });
    };
    const client = new Terminal49PublicClient({
      apiToken: 'test-token',
      fetchImpl,
      pollTimeoutMs: 0,
    });

    await expect(
      client.resolveTrackingRequest({
        number: 'MEDUFR030802',
        type: 'BL',
      }),
    ).resolves.toEqual({ state: 'pending' });
    expect(requests.some((request) => request.init?.method === 'POST')).toBe(
      false,
    );
  });

  it('uses asynchronous carrier detection when sealine is omitted', async () => {
    const bodies: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      if (String(input).includes('/tracking_requests?')) {
        return jsonResponse({ data: [] });
      }
      bodies.push(String(init?.body));
      return jsonResponse(
        {
          data: {
            id: 'request-1',
            type: 'tracking_request',
            attributes: { status: 'pending' },
          },
        },
        201,
      );
    };
    const client = new Terminal49PublicClient({
      apiToken: 'test-token',
      fetchImpl,
      pollTimeoutMs: 0,
    });

    await client.resolveTrackingRequest({
      number: 'MEDUFR030802',
      type: 'BL',
    });

    expect(JSON.parse(bodies[0])).toMatchObject({
      data: { attributes: { auto_detect_vocc_scac: true } },
    });
  });
});
