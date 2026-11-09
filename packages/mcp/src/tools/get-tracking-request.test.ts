import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  executeGetTrackingRequest,
  getTrackingRequestOutputSchema,
} from './get-tracking-request.js';
import { CUSTOM_FIELDS_AUTH_NOTE } from './custom-fields.js';

const REQUEST_ID = '6c1f0d52-8a3e-4b9f-9d21-0e5f4a7b8c90';
const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';

const trackingRequest = (attributes: Record<string, unknown>) => ({
  data: {
    id: REQUEST_ID,
    type: 'tracking_request',
    attributes: {
      request_number: 'MAEU123456789',
      request_type: 'bill_of_lading',
      scac: 'MAEU',
      ref_numbers: ['PO-1'],
      tags: [],
      is_retrying: false,
      retry_count: 0,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:05:00Z',
      ...attributes,
    },
    relationships: {
      tracked_object: {
        data:
          attributes.status === 'created'
            ? { id: SHIPMENT_ID, type: 'shipment' }
            : null,
      },
    },
  },
});

describe('get_tracking_request', () => {
  it('returns the status and the shipment a succeeded request created', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /tracking_requests/${REQUEST_ID}`]: {
        body: trackingRequest({ status: 'created', failed_reason: null }),
      },
    });

    const result = await executeGetTrackingRequest({ id: REQUEST_ID }, client);

    expect(requests.map((request) => request.path)).toEqual([
      `/tracking_requests/${REQUEST_ID}`,
    ]);
    expect(result).toEqual({
      id: REQUEST_ID,
      request_number: 'MAEU123456789',
      request_type: 'bill_of_lading',
      status: 'created',
      failed_reason: null,
      scac: 'MAEU',
      ref_numbers: ['PO-1'],
      tags: [],
      is_retrying: false,
      retry_count: 0,
      shipment_id: SHIPMENT_ID,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:05:00Z',
    });
    expect(getTrackingRequestOutputSchema.parse(result)).toEqual(result);
  });

  it('reports why a request failed and that it has no shipment', async () => {
    const { client } = fakeApiClient({
      [`GET /tracking_requests/${REQUEST_ID}`]: {
        body: trackingRequest({ status: 'failed', failed_reason: 'not_found' }),
      },
    });

    const result = await executeGetTrackingRequest({ id: REQUEST_ID }, client);

    expect(result).toMatchObject({
      status: 'failed',
      failed_reason: 'not_found',
      shipment_id: null,
    });
    expect(result).not.toHaveProperty('custom_fields');
  });

  it('loads custom fields only when asked', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /tracking_requests/${REQUEST_ID}`]: {
        body: trackingRequest({ status: 'pending' }),
      },
      [`GET /tracking_requests/${REQUEST_ID}/custom_fields`]: {
        body: {
          data: [
            {
              id: 'cf-1',
              type: 'custom_field',
              attributes: {
                api_slug: 'po_number',
                value: 'PO-77',
                display_value: 'PO-77',
              },
            },
          ],
        },
      },
    });

    const result = await executeGetTrackingRequest(
      { id: REQUEST_ID, include_custom_fields: true },
      client,
    );

    expect(requests).toHaveLength(2);
    expect(result.custom_fields).toEqual([
      expect.objectContaining({ slug: 'po_number', value: 'PO-77' }),
    ]);
  });

  it('explains custom fields an API key cannot read instead of failing', async () => {
    const { client } = fakeApiClient({
      [`GET /tracking_requests/${REQUEST_ID}`]: {
        body: trackingRequest({ status: 'pending' }),
      },
      [`GET /tracking_requests/${REQUEST_ID}/custom_fields`]: { status: 401 },
    });

    const result = await executeGetTrackingRequest(
      { id: REQUEST_ID, include_custom_fields: true },
      client,
    );

    expect(result).toMatchObject({
      status: 'pending',
      custom_fields: null,
      custom_fields_note: CUSTOM_FIELDS_AUTH_NOTE,
    });
  });

  it('reads tags from shipment_tags, the name the API sends', async () => {
    const { client } = fakeApiClient({
      [`GET /tracking_requests/${REQUEST_ID}`]: {
        body: trackingRequest({
          status: 'pending',
          tags: undefined,
          shipment_tags: ['hot', 'priority'],
        }),
      },
    });

    const result = await executeGetTrackingRequest({ id: REQUEST_ID }, client);

    expect(result.tags).toEqual(['hot', 'priority']);
    expect(result).not.toHaveProperty('shipment_tags');
  });

  it('rejects an unknown id with the SDK not-found error', async () => {
    const { client } = fakeApiClient({});

    await expect(
      executeGetTrackingRequest({ id: REQUEST_ID }, client),
    ).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});
