import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  ALREADY_TRACKED_UNKNOWN_NOTE,
  executeIdentifyTrackingNumber,
  identifyTrackingNumberOutputSchema,
  RATE_LIMITED,
} from './identify-tracking-number.js';

const CONTAINER_ID = '3f9a1c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const REQUEST_ID = '6c1f0d52-8a3e-4b9f-9d21-0e5f4a7b8c90';
const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';

const inferred = (attributes: Record<string, unknown>) => ({
  data: {
    id: 'req_1',
    type: 'infer_number_results',
    attributes: {
      number_type: 'container',
      validation: {
        is_valid: true,
        type: 'container',
        check_digit_passed: true,
        parsed_number: null,
        reason: null,
      },
      shipping_line: {
        decision: 'auto_select',
        selected: { scac: 'MAEU', name: 'Maersk', confidence: 0.97 },
        candidates: [{ scac: 'MAEU', name: 'Maersk', confidence: 0.97 }],
      },
      ...attributes,
    },
  },
});

const searchResult = (attributes: Record<string, unknown>, id: string) => ({
  id,
  type: 'search_result',
  attributes,
});

describe('identify_tracking_number', () => {
  it('predicts the carrier for an untracked number and creates nothing', async () => {
    const { client, requests } = fakeApiClient({
      'POST /tracking_requests/infer_number': { body: inferred({}) },
      'GET /search': { body: { data: [] } },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: ' caiu 2885402 ' },
      client,
    );

    expect(result).toEqual({
      number: 'CAIU2885402',
      number_type: 'container',
      is_valid: true,
      check_digit_passed: true,
      invalid_reason: null,
      carrier: {
        decision: 'auto_select',
        selected: { scac: 'MAEU', name: 'Maersk', confidence: 0.97 },
        candidates: [{ scac: 'MAEU', name: 'Maersk', confidence: 0.97 }],
      },
      already_tracked: null,
    });
    expect(identifyTrackingNumberOutputSchema.parse(result)).toEqual(result);
    expect(
      requests.map((request) => `${request.method} ${request.path}`).sort(),
    ).toEqual(['GET /search', 'POST /tracking_requests/infer_number']);
    expect(requests.find((request) => request.method === 'POST')?.body).toEqual(
      { number: 'CAIU2885402' },
    );
  });

  it('names booking numbers the way track_container does', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': {
        body: inferred({
          number_type: 'booking',
          shipping_line: {
            decision: 'needs_confirmation',
            selected: null,
            candidates: [
              { scac: 'MAEU', name: 'Maersk', confidence: 0.5 },
              { scac: 'SEAU', name: 'Sealand', confidence: 0.4 },
            ],
          },
        }),
      },
      'GET /search': { body: { data: [] } },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: '254285462' },
      client,
    );

    expect(result).toMatchObject({
      number_type: 'booking_number',
      carrier: {
        decision: 'needs_confirmation',
        selected: null,
        candidates: [
          { scac: 'MAEU', name: 'Maersk', confidence: 0.5 },
          { scac: 'SEAU', name: 'Sealand', confidence: 0.4 },
        ],
      },
    });
  });

  it('reports containers the account already tracks under that exact number', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': { body: inferred({}) },
      'GET /search': {
        body: {
          data: [
            searchResult(
              {
                entity_type: 'container',
                number: 'CAIU2885402',
                scac: 'MAEU',
              },
              CONTAINER_ID,
            ),
            searchResult(
              { entity_type: 'container', number: 'CAIU28854020' },
              'other-container',
            ),
          ],
        },
      },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: 'CAIU2885402' },
      client,
    );

    expect(result).toMatchObject({
      already_tracked: {
        containers: [{ id: CONTAINER_ID, shipping_line: 'MAEU' }],
        in_progress_request: null,
      },
    });
  });

  it('reports a tracking request that is still in progress', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': { body: inferred({}) },
      'GET /search': {
        body: {
          data: [
            searchResult(
              {
                entity_type: 'tracking_request',
                number: 'CAIU2885402',
                status: 'awaiting_manifest',
                scac: 'MAEU',
              },
              REQUEST_ID,
            ),
          ],
        },
      },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: 'CAIU2885402' },
      client,
    );

    expect(result).toMatchObject({
      already_tracked: {
        containers: [],
        in_progress_request: {
          id: REQUEST_ID,
          status: 'awaiting_manifest',
          request_number: 'CAIU2885402',
          scac: 'MAEU',
        },
      },
    });
  });

  it('reports a shipment the account already tracks under that Bill of Lading', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': {
        body: inferred({ number_type: 'bill_of_lading' }),
      },
      'GET /search': {
        body: {
          data: [
            searchResult(
              {
                entity_type: 'shipment',
                number: 'MAEU123456789',
                scac: 'MAEU',
                containers_count: 2,
              },
              SHIPMENT_ID,
            ),
            searchResult(
              { entity_type: 'shipment', number: 'MAEU1234567890' },
              'other-shipment',
            ),
          ],
        },
      },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: 'MAEU123456789' },
      client,
    );

    expect(result).toMatchObject({
      number_type: 'bill_of_lading',
      already_tracked: {
        containers: [],
        shipments: [{ id: SHIPMENT_ID, shipping_line: 'MAEU' }],
        in_progress_request: null,
      },
    });
    expect(result).not.toHaveProperty('already_tracked_note');
    expect(identifyTrackingNumberOutputSchema.parse(result)).toEqual(result);
  });

  it('says it could not check when the search fails, instead of not tracked', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': { body: inferred({}) },
      'GET /search': { status: 500 },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: 'CAIU2885402' },
      client,
    );

    expect(result).toMatchObject({
      carrier: { selected: { scac: 'MAEU' } },
      already_tracked: null,
      already_tracked_note: ALREADY_TRACKED_UNKNOWN_NOTE,
    });
    expect(identifyTrackingNumberOutputSchema.parse(result)).toEqual(result);
  });

  it('says it could not check when a full page of search hits has no exact match', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': { body: inferred({}) },
      'GET /search': {
        body: {
          data: Array.from({ length: 25 }, (_, index) =>
            searchResult(
              { entity_type: 'shipment', number: `BL${index}`, scac: 'MAEU' },
              `shipment-${index}`,
            ),
          ),
        },
      },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: 'CAIU2885402' },
      client,
    );

    expect(result).toMatchObject({
      already_tracked: null,
      already_tracked_note: ALREADY_TRACKED_UNKNOWN_NOTE,
    });
  });

  it.each([
    ['data is missing', {}],
    ['data is not a list', { data: { id: 'x' } }],
    ['a row is unreadable', { data: [{ id: 7, type: 'search_result' }] }],
  ])(
    'says it could not check when %s, instead of not tracked',
    async (_, body) => {
      const { client } = fakeApiClient({
        'POST /tracking_requests/infer_number': { body: inferred({}) },
        'GET /search': { body },
      });

      const result = await executeIdentifyTrackingNumber(
        { number: 'CAIU2885402' },
        client,
      );

      expect(result).toMatchObject({
        already_tracked: null,
        already_tracked_note: ALREADY_TRACKED_UNKNOWN_NOTE,
      });
    },
  );

  it('turns a 429 from the duplicate search into a rate_limited result', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': { body: inferred({}) },
      'GET /search': { status: 429 },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: 'CAIU2885402' },
      client,
    );

    expect(result).toEqual(RATE_LIMITED);
  });

  it('turns a 429 from infer_number into a rate_limited result', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': {
        status: 429,
        body: { errors: [{ status: '429', title: 'Too Many Requests' }] },
      },
      'GET /search': { body: { data: [] } },
    });

    const result = await executeIdentifyTrackingNumber(
      { number: 'CAIU2885402' },
      client,
    );

    expect(result).toEqual(RATE_LIMITED);
    expect(identifyTrackingNumberOutputSchema.parse(result)).toEqual(result);
  });

  it('lets other API errors fail the call', async () => {
    const { client } = fakeApiClient({
      'POST /tracking_requests/infer_number': {
        status: 422,
        body: { errors: [{ detail: 'Number is not valid' }] },
      },
      'GET /search': { body: { data: [] } },
    });

    await expect(
      executeIdentifyTrackingNumber({ number: 'NOT-A-NUMBER' }, client),
    ).rejects.toMatchObject({ status: 422 });
  });
});
