import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { fakeApiClient, type FakeRoutes } from '../test/fake-api.js';
import {
  auditEvents,
  meBody,
  tokenOf,
  writeContext,
} from '../test/write-context.js';
import { STOP_TRACKING_NOT_ENABLED } from './shipment-tracking.js';
import { executeResumeShipmentTracking } from './resume-shipment-tracking.js';
import {
  executeStopShipmentTracking,
  stopShipmentTrackingOutputSchema,
} from './stop-shipment-tracking.js';

const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';
const STOPPED_AT = '2026-10-17T12:01:00Z';

const CONTAINER = {
  id: '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  type: 'container',
};
const ADDED_CONTAINER = {
  id: '6b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e',
  type: 'container',
};

const shipment = (
  stoppedAt: string | null,
  containers = [CONTAINER],
  billOfLading = 'MAEU123456789',
) => ({
  data: {
    id: SHIPMENT_ID,
    type: 'shipment',
    attributes: {
      bill_of_lading_number: billOfLading,
      shipping_line_scac: 'MAEU',
      line_tracking_stopped_at: stoppedAt,
      line_tracking_stopped_reason: stoppedAt ? 'user' : null,
    },
    relationships: { containers: { data: containers } },
  },
});

const enabled = { stop_tracking: { status: 'available' } };

/** API routes for a shipment that is tracked until a stop_tracking call. */
function trackedShipment(features = enabled) {
  let stoppedAt: string | null = null;
  let containers = [CONTAINER];
  let billOfLading = 'MAEU123456789';
  const routes: FakeRoutes = {
    'GET /me': { body: meBody(features) },
    [`GET /shipments/${SHIPMENT_ID}`]: () => ({
      body: shipment(stoppedAt, containers, billOfLading),
    }),
    [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: () => {
      stoppedAt = STOPPED_AT;
      return { body: shipment(stoppedAt, containers, billOfLading) };
    },
    [`PATCH /shipments/${SHIPMENT_ID}/resume_tracking`]: () => {
      stoppedAt = null;
      return { body: shipment(stoppedAt, containers, billOfLading) };
    },
  };
  return {
    ...fakeApiClient(routes),
    stopElsewhere: () => {
      stoppedAt = STOPPED_AT;
    },
    addContainer: () => {
      containers = [CONTAINER, ADDED_CONTAINER];
    },
    changeBillOfLading: () => {
      billOfLading = 'MAEU987654321';
    },
  };
}

function patches(requests: { method: string; path: string }[]) {
  return requests.filter((request) => request.method === 'PATCH');
}

describe('stop_shipment_tracking', () => {
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

  it('returns a preview and a token, and changes nothing, without a token', async () => {
    const { client, requests } = trackedShipment();

    const result = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: {
          bill_of_lading: 'MAEU123456789',
          container_count: 1,
          tracking: 'active',
        },
        proposed: { tracking: 'stopped' },
        reach: expect.stringContaining('Every container'),
      },
      confirmation_token: expect.stringMatching(/^t49ct1\./),
      expires_at: expect.any(String),
    });
    expect(stopShipmentTrackingOutputSchema.parse(result)).toEqual(result);
    expect(patches(requests)).toEqual([]);
  });

  it('refuses a token replayed after a resume restored the previewed state', async () => {
    const { client, requests } = trackedShipment();
    const context = writeContext(client);
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      context,
    );
    const confirmed = {
      shipment_id: SHIPMENT_ID,
      confirmation_token: tokenOf(preview),
    };
    await executeStopShipmentTracking(confirmed, client, context);
    await executeResumeShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      context,
    );

    const replay = await executeStopShipmentTracking(
      confirmed,
      client,
      context,
    );

    expect(replay).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'used',
    });
    expect(patches(requests).map((request) => request.path)).toEqual([
      `/shipments/${SHIPMENT_ID}/stop_tracking`,
      `/shipments/${SHIPMENT_ID}/resume_tracking`,
    ]);
  });

  it('accepts the same token again after Terminal49 rate limits the stop', async () => {
    let limited = true;
    let stoppedAt: string | null = null;
    const { client, requests } = fakeApiClient({
      'GET /me': { body: meBody(enabled) },
      [`GET /shipments/${SHIPMENT_ID}`]: () => ({ body: shipment(stoppedAt) }),
      [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: () => {
        if (limited) {
          limited = false;
          return { status: 429, headers: { 'Retry-After': '1' } };
        }
        stoppedAt = STOPPED_AT;
        return { body: shipment(stoppedAt) };
      },
    });
    const context = writeContext(client);
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      context,
    );
    const confirmed = {
      shipment_id: SHIPMENT_ID,
      confirmation_token: tokenOf(preview),
    };

    const first = await executeStopShipmentTracking(confirmed, client, context);
    const retry = await executeStopShipmentTracking(confirmed, client, context);

    expect(first).toMatchObject({ error: 'rate_limited' });
    expect(retry).toMatchObject({
      status: 'stopped',
      shipment: { tracking: 'stopped' },
    });
    expect(patches(requests)).toHaveLength(2);
  });

  it('accepts the same token again after Terminal49 refuses the stop with a 422', async () => {
    let refuse = true;
    let stoppedAt: string | null = null;
    const { client, requests } = fakeApiClient({
      'GET /me': { body: meBody(enabled) },
      [`GET /shipments/${SHIPMENT_ID}`]: () => ({ body: shipment(stoppedAt) }),
      [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: () => {
        if (refuse) {
          refuse = false;
          return {
            status: 422,
            body: { errors: [{ status: '422', detail: 'Cannot stop' }] },
          };
        }
        stoppedAt = STOPPED_AT;
        return { body: shipment(stoppedAt) };
      },
    });
    const context = writeContext(client);
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      context,
    );
    const confirmed = {
      shipment_id: SHIPMENT_ID,
      confirmation_token: tokenOf(preview),
    };

    const first = await executeStopShipmentTracking(confirmed, client, context);
    const retry = await executeStopShipmentTracking(confirmed, client, context);

    expect(first).toMatchObject({ status: 'noop' });
    expect(retry).toMatchObject({
      status: 'stopped',
      shipment: { tracking: 'stopped' },
    });
    expect(patches(requests)).toHaveLength(2);
  });

  it('refuses a token after a server error, since the stop may have happened', async () => {
    const { client, requests } = fakeApiClient({
      'GET /me': { body: meBody(enabled) },
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment(null) },
      [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: { status: 500 },
    });
    const context = writeContext(client);
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      context,
    );
    const confirmed = {
      shipment_id: SHIPMENT_ID,
      confirmation_token: tokenOf(preview),
    };

    await expect(
      executeStopShipmentTracking(confirmed, client, context),
    ).rejects.toMatchObject({ status: 500 });
    const retry = await executeStopShipmentTracking(confirmed, client, context);

    expect(retry).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'used',
    });
    expect(patches(requests)).toHaveLength(1);
  });

  it('stops once when two calls confirm with the same token at the same time', async () => {
    const { client, requests } = trackedShipment();
    const context = writeContext(client);
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      context,
    );
    const confirmed = {
      shipment_id: SHIPMENT_ID,
      confirmation_token: tokenOf(preview),
    };

    const results = await Promise.all([
      executeStopShipmentTracking(confirmed, client, context),
      executeStopShipmentTracking(confirmed, client, context),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'stopped' }),
        expect.objectContaining({
          error: 'invalid_confirmation',
          reason: 'used',
        }),
      ]),
    );
    expect(patches(requests)).toHaveLength(1);
  });

  it('stops tracking with the token from the preview', async () => {
    const { client, requests } = trackedShipment();
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    const result = await executeStopShipmentTracking(
      {
        shipment_id: SHIPMENT_ID,
        confirmation_token: tokenOf(preview),
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stopped',
      shipment: { tracking: 'stopped', tracking_stopped_at: STOPPED_AT },
      undo: 'resume_shipment_tracking',
    });
    expect(stopShipmentTrackingOutputSchema.parse(result)).toEqual(result);
    expect(patches(requests)).toHaveLength(1);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        phase: 'preview',
        outcome: 'confirmation_required',
      }),
      expect.objectContaining({
        tool: 'stop_shipment_tracking',
        tier: 'C',
        phase: 'execute',
        outcome: 'stopped',
        entity_id: SHIPMENT_ID,
      }),
    ]);
  });

  it('returns a new preview, and does not stop, when the shipment changed after the first one', async () => {
    const { client, requests, addContainer } = trackedShipment();
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );
    addContainer();

    const result = await executeStopShipmentTracking(
      {
        shipment_id: SHIPMENT_ID,
        confirmation_token: tokenOf(preview),
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: { current: { container_count: 2 } },
      confirmation_token: expect.stringMatching(/^t49ct1\./),
    });
    expect(tokenOf(result)).not.toBe(tokenOf(preview));
    expect(patches(requests)).toEqual([]);
  });

  it('returns a new preview, and does not stop, when the Bill of Lading changed after the first one', async () => {
    const { client, requests, changeBillOfLading } = trackedShipment();
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );
    changeBillOfLading();

    const result = await executeStopShipmentTracking(
      {
        shipment_id: SHIPMENT_ID,
        confirmation_token: tokenOf(preview),
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: { current: { bill_of_lading: 'MAEU987654321' } },
    });
    expect(patches(requests)).toEqual([]);
  });

  it('reports already_stopped when tracking was stopped after the preview', async () => {
    const { client, requests, stopElsewhere } = trackedShipment();
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );
    stopElsewhere();

    const result = await executeStopShipmentTracking(
      {
        shipment_id: SHIPMENT_ID,
        confirmation_token: tokenOf(preview),
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_stopped',
      shipment: { tracking: 'stopped' },
    });
    expect(patches(requests)).toEqual([]);
  });

  it('refuses a token issued for another shipment', async () => {
    const { client, requests } = trackedShipment();
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );
    const other = trackedShipment();

    const result = await executeStopShipmentTracking(
      {
        shipment_id: SHIPMENT_ID,
        confirmation_token: tokenOf(preview),
      },
      other.client,
      writeContext(other.client, { credentialHash: 'another-credential' }),
    );

    expect(result).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    expect(patches([...requests, ...other.requests])).toEqual([]);
  });

  it('returns FeatureNotEnabled before reading the shipment when stop_tracking is off', async () => {
    const { client, requests } = trackedShipment({
      stop_tracking: { status: 'requires_paid_plan' },
    });

    const result = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    expect(result).toEqual(STOP_TRACKING_NOT_ENABLED);
    expect(requests.map((request) => request.path)).toEqual(['/me']);
  });

  it('returns FeatureNotEnabled when the stop call answers a feature 403 after /me allowed it', async () => {
    const { client } = fakeApiClient({
      'GET /me': { body: meBody(enabled) },
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment(null) },
      [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: {
        status: 403,
        body: {
          errors: [
            { status: '403', detail: 'Stop tracking feature is not enabled' },
          ],
        },
      },
    });
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    const result = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(result).toEqual(STOP_TRACKING_NOT_ENABLED);
    expect(stopShipmentTrackingOutputSchema.parse(result)).toEqual(result);
  });

  it('refuses to preview or write without a confirmation secret', async () => {
    const { client, requests } = trackedShipment();

    const result = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client, { confirmationSecret: undefined }),
    );

    expect(result).toMatchObject({ error: 'not_permitted' });
    expect(requests).toEqual([]);
  });

  it('returns rate_limited when Terminal49 limits the stop call', async () => {
    const { client } = fakeApiClient({
      'GET /me': { body: meBody(enabled) },
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment(null) },
      [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: {
        status: 429,
        headers: { 'Retry-After': '30' },
      },
    });
    const preview = await executeStopShipmentTracking(
      { shipment_id: SHIPMENT_ID },
      client,
      writeContext(client),
    );

    await expect(
      executeStopShipmentTracking(
        {
          shipment_id: SHIPMENT_ID,
          confirmation_token: tokenOf(preview),
        },
        client,
        writeContext(client),
      ),
    ).resolves.toEqual({
      error: 'rate_limited',
      message: expect.stringContaining('Nothing was changed.'),
      alternative: 'Wait 30 seconds and try again.',
      retry_after_s: 30,
    });
  });

  it.each([
    ['the feature check', { 'GET /me': { status: 429 } }],
    [
      'the shipment read',
      {
        'GET /me': { body: meBody(enabled) },
        [`GET /shipments/${SHIPMENT_ID}`]: {
          status: 429,
          headers: { 'Retry-After': '30' },
        },
      },
    ],
  ])(
    'returns rate_limited when Terminal49 limits %s',
    async (_step, routes: FakeRoutes) => {
      const { client, requests } = fakeApiClient(routes);

      const result = await executeStopShipmentTracking(
        { shipment_id: SHIPMENT_ID },
        client,
        writeContext(client),
      );

      expect(result).toMatchObject({ error: 'rate_limited' });
      expect(stopShipmentTrackingOutputSchema.parse(result)).toEqual(result);
      expect(patches(requests)).toEqual([]);
      expect(auditEvents(logged)).toEqual([
        expect.objectContaining({ phase: 'preview', outcome: 'rate_limited' }),
      ]);
    },
  );

  it.each([
    ['already_stopped', STOPPED_AT],
    ['noop', null],
  ])(
    'reads the shipment again and returns %s when Terminal49 refuses the stop',
    async (status, stoppedAfter) => {
      let refused = false;
      const { client } = fakeApiClient({
        'GET /me': { body: meBody(enabled) },
        [`GET /shipments/${SHIPMENT_ID}`]: () => ({
          body: shipment(refused ? stoppedAfter : null),
        }),
        [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: () => {
          refused = true;
          return {
            status: 422,
            body: { errors: [{ status: '422', detail: 'Cannot stop' }] },
          };
        },
      });
      const preview = await executeStopShipmentTracking(
        { shipment_id: SHIPMENT_ID },
        client,
        writeContext(client),
      );

      const result = await executeStopShipmentTracking(
        { shipment_id: SHIPMENT_ID, confirmation_token: tokenOf(preview) },
        client,
        writeContext(client),
      );

      expect(result).toMatchObject({
        status,
        shipment: { tracking: stoppedAfter ? 'stopped' : 'active' },
      });
      expect(stopShipmentTrackingOutputSchema.parse(result)).toEqual(result);
      expect(auditEvents(logged).at(-1)).toMatchObject({ outcome: status });
    },
  );
});
