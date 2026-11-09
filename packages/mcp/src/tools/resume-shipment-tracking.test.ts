import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  auditEvents,
  meBody,
  TEST_ACCOUNT_ID,
  writeContext,
} from '../test/write-context.js';
import {
  executeResumeShipmentTracking,
  RESUME_NOTE,
  resumeShipmentTrackingOutputSchema,
} from './resume-shipment-tracking.js';
import { STOP_TRACKING_NOT_ENABLED } from './shipment-tracking.js';

const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';
const STOPPED_AT = '2026-10-10T08:00:00Z';

const shipment = (stoppedAt: string | null) => ({
  data: {
    id: SHIPMENT_ID,
    type: 'shipment',
    attributes: {
      bill_of_lading_number: 'MAEU123456789',
      shipping_line_scac: 'MAEU',
      line_tracking_stopped_at: stoppedAt,
      line_tracking_stopped_reason: stoppedAt ? 'user' : null,
    },
    relationships: {
      containers: {
        data: [
          { id: '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', type: 'container' },
          { id: '6b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e', type: 'container' },
        ],
      },
    },
  },
});

describe('resume_shipment_tracking', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resumes a stopped shipment and names the tool that undoes it', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment(STOPPED_AT) },
      [`PATCH /shipments/${SHIPMENT_ID}/resume_tracking`]: {
        body: shipment(null),
      },
    });

    const result = await executeResumeShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'resumed',
      message: RESUME_NOTE,
      shipment: {
        id: SHIPMENT_ID,
        bill_of_lading: 'MAEU123456789',
        shipping_line_scac: 'MAEU',
        container_count: 2,
        tracking: 'active',
        tracking_stopped_at: null,
        tracking_stopped_reason: null,
      },
      undo: 'stop_shipment_tracking',
    });
    expect(resumeShipmentTrackingOutputSchema.parse(result)).toEqual(result);
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PATCH']);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'resume_shipment_tracking',
        tier: 'A',
        outcome: 'resumed',
        entity_type: 'shipment',
        entity_id: SHIPMENT_ID,
      }),
    ]);
  });

  it('resumes a shipment that has a stop reason but no stop time', async () => {
    const active = shipment(null);
    const stopped = {
      data: {
        ...active.data,
        attributes: {
          ...active.data.attributes,
          line_tracking_stopped_reason: 'cancelled_by_user',
        },
      },
    };
    const { client, requests } = fakeApiClient({
      [`GET /shipments/${SHIPMENT_ID}`]: { body: stopped },
      [`PATCH /shipments/${SHIPMENT_ID}/resume_tracking`]: {
        body: shipment(null),
      },
    });

    const result = await executeResumeShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ status: 'resumed' });
    expect(requests.map((request) => request.method)).toEqual(['GET', 'PATCH']);
  });

  it('audits a session the gateway named no account for under the /me account', async () => {
    const { client } = fakeApiClient({
      'GET /me': { body: meBody() },
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment(STOPPED_AT) },
      [`PATCH /shipments/${SHIPMENT_ID}/resume_tracking`]: {
        body: shipment(null),
      },
    });

    await executeResumeShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client, { gatewayAccountId: undefined }),
    );

    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        outcome: 'resumed',
        account_id: TEST_ACCOUNT_ID,
      }),
    ]);
  });

  it('returns rate_limited when Terminal49 limits the resume call', async () => {
    const { client } = fakeApiClient({
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment(STOPPED_AT) },
      [`PATCH /shipments/${SHIPMENT_ID}/resume_tracking`]: {
        status: 429,
        headers: { 'Retry-After': '20' },
      },
    });

    const result = await executeResumeShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      error: 'rate_limited',
      message: expect.stringContaining('Nothing was changed.'),
      alternative: 'Wait 20 seconds and try again.',
      retry_after_s: 20,
    });
    expect(resumeShipmentTrackingOutputSchema.parse(result)).toEqual(result);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ outcome: 'rate_limited' }),
    ]);
  });

  it('returns rate_limited when Terminal49 limits the read before the resume', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /shipments/${SHIPMENT_ID}`]: {
        status: 429,
        headers: { 'Retry-After': '5' },
      },
    });

    const result = await executeResumeShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ error: 'rate_limited', retry_after_s: 5 });
    expect(requests.map((request) => request.method)).toEqual(['GET']);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ outcome: 'rate_limited' }),
    ]);
  });

  it('changes nothing when the shipment is already tracked', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment(null) },
    });

    const result = await executeResumeShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_tracking',
      shipment: { tracking: 'active' },
    });
    expect(requests.map((request) => request.method)).toEqual(['GET']);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ outcome: 'already_tracking' }),
    ]);
  });

  it('returns a soft FeatureNotEnabled result when the account cannot resume', async () => {
    const { client } = fakeApiClient({
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment(STOPPED_AT) },
      [`PATCH /shipments/${SHIPMENT_ID}/resume_tracking`]: {
        status: 403,
        body: {
          errors: [
            { status: '403', detail: 'Stop tracking feature is not enabled' },
          ],
        },
      },
    });

    await expect(
      executeResumeShipmentTracking(
        { shipment_id: SHIPMENT_ID },
        client,
        writeContext(client),
      ),
    ).resolves.toEqual(STOP_TRACKING_NOT_ENABLED);
  });

  it.each([
    ['already_tracking', null],
    ['noop', STOPPED_AT],
  ])(
    'reads the shipment again and returns %s when Terminal49 refuses the resume',
    async (status, stoppedAfter) => {
      let refused = false;
      const { client } = fakeApiClient({
        [`GET /shipments/${SHIPMENT_ID}`]: () => ({
          body: shipment(refused ? stoppedAfter : STOPPED_AT),
        }),
        [`PATCH /shipments/${SHIPMENT_ID}/resume_tracking`]: () => {
          refused = true;
          return {
            status: 422,
            body: { errors: [{ status: '422', detail: 'Cannot resume' }] },
          };
        },
      });

      const result = await executeResumeShipmentTracking(
        { shipment_id: SHIPMENT_ID },
        client,
        writeContext(client),
      );

      expect(result).toMatchObject({
        status,
        shipment: { tracking: stoppedAfter ? 'stopped' : 'active' },
      });
      expect(resumeShipmentTrackingOutputSchema.parse(result)).toEqual(result);
      expect(auditEvents(logged).at(-1)).toMatchObject({ outcome: status });
    },
  );

  it('rejects extra keys before calling the API', async () => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeResumeShipmentTracking(
        // SAFETY: the extra key is the point of the test.
        { shipment_id: SHIPMENT_ID, force: true } as never,
        client,
        writeContext(client),
      ),
    ).rejects.toThrow();
    expect(requests).toEqual([]);
  });
});
