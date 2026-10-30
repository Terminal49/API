/**
 * Calls the tracking lifecycle tools through the MCP client and the HTTP
 * handler. Each call builds a new server, as the stateless gateway does, so a
 * confirmed write proves the token survives between requests.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { callTool } from './test/call-tool.js';
import type { FakeRoutes } from './test/fake-api.js';
import {
  meBody,
  TEST_CONFIRMATION_SECRET,
  tokenOf,
} from './test/write-context.js';
import { cancelTrackingRequestOutputSchema } from './tools/cancel-tracking-request.js';
import { resumeShipmentTrackingOutputSchema } from './tools/resume-shipment-tracking.js';
import { stopShipmentTrackingOutputSchema } from './tools/stop-shipment-tracking.js';

vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';
const REQUEST_ID = '6c1f0d52-8a3e-4b9f-9d21-0e5f4a7b8c90';
const OPERATIONS = {
  toolsets: ['operations', 'tracking_lifecycle'] as const,
};
const CONFIRMING = {
  ...OPERATIONS,
  confirmationSecret: TEST_CONFIRMATION_SECRET,
};

function shipmentRoutes(): FakeRoutes {
  let stoppedAt: string | null = null;
  const shipment = () => ({
    body: {
      data: {
        id: SHIPMENT_ID,
        type: 'shipment',
        attributes: {
          bill_of_lading_number: 'MAEU123456789',
          shipping_line_scac: 'MAEU',
          line_tracking_stopped_at: stoppedAt,
          line_tracking_stopped_reason: null,
        },
        relationships: { containers: { data: [] } },
      },
    },
  });
  return {
    'GET /me': { body: meBody({ stop_tracking: { status: 'available' } }) },
    [`GET /shipments/${SHIPMENT_ID}`]: shipment,
    [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: () => {
      stoppedAt = '2026-10-17T12:00:00Z';
      return shipment();
    },
    [`PATCH /shipments/${SHIPMENT_ID}/resume_tracking`]: () => {
      stoppedAt = null;
      return shipment();
    },
  };
}

describe('tracking lifecycle tools over the MCP client transport', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(String(line));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stops and resumes a shipment across separate requests', async () => {
    const routes = shipmentRoutes();

    const preview = await callTool(
      'stop_shipment_tracking',
      { shipment_id: SHIPMENT_ID },
      routes,
      CONFIRMING,
    );
    expect(preview.isError).not.toBe(true);
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
    });
    expect(
      stopShipmentTrackingOutputSchema.safeParse(preview.structuredContent)
        .success,
    ).toBe(true);

    const stopped = await callTool(
      'stop_shipment_tracking',
      {
        shipment_id: SHIPMENT_ID,
        confirmation_token: tokenOf(preview.structuredContent),
      },
      routes,
      CONFIRMING,
    );
    expect(stopped.isError).not.toBe(true);
    expect(stopped.structuredContent).toMatchObject({
      status: 'stopped',
      undo: 'resume_shipment_tracking',
    });

    const resumed = await callTool(
      'resume_shipment_tracking',
      { shipment_id: SHIPMENT_ID },
      routes,
      CONFIRMING,
    );
    expect(resumed.isError).not.toBe(true);
    expect(resumed.structuredContent).toMatchObject({ status: 'resumed' });
    expect(
      resumeShipmentTrackingOutputSchema.safeParse(resumed.structuredContent)
        .success,
    ).toBe(true);
  });

  it('refuses tier C writes over HTTP without a confirmation secret, as a soft result', async () => {
    const result = await callTool(
      'stop_shipment_tracking',
      { shipment_id: SHIPMENT_ID },
      shipmentRoutes(),
      OPERATIONS,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ error: 'not_permitted' });
    expect(logged.join('\n')).toMatch(/"event":"mcp.config.error"/);
  });

  it('refuses a token signed with a different secret', async () => {
    const routes = shipmentRoutes();
    const preview = await callTool(
      'stop_shipment_tracking',
      { shipment_id: SHIPMENT_ID },
      routes,
      CONFIRMING,
    );

    const result = await callTool(
      'stop_shipment_tracking',
      {
        shipment_id: SHIPMENT_ID,
        confirmation_token: tokenOf(preview.structuredContent),
      },
      routes,
      {
        ...OPERATIONS,
        confirmationSecret: `${TEST_CONFIRMATION_SECRET}-rotated`,
      },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: 'invalid_confirmation',
    });
  });

  it('returns not_cancellable for a finished request as a soft result', async () => {
    const result = await callTool(
      'cancel_tracking_request',
      { tracking_request_id: REQUEST_ID },
      {
        'GET /me': { body: meBody() },
        [`GET /tracking_requests/${REQUEST_ID}`]: {
          body: {
            data: {
              id: REQUEST_ID,
              type: 'tracking_request',
              attributes: { request_number: 'MAEU1', status: 'created' },
            },
          },
        },
      },
      CONFIRMING,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: 'not_cancellable',
      tracking_request: { status: 'created' },
    });
    expect(
      cancelTrackingRequestOutputSchema.safeParse(result.structuredContent)
        .success,
    ).toBe(true);
  });

  it.each([
    [
      'stop_shipment_tracking',
      { shipment_id: SHIPMENT_ID },
      `No shipment found with id ${SHIPMENT_ID}.`,
    ],
    [
      'resume_shipment_tracking',
      { shipment_id: SHIPMENT_ID },
      `No shipment found with id ${SHIPMENT_ID}.`,
    ],
    [
      'cancel_tracking_request',
      { tracking_request_id: REQUEST_ID },
      `No tracking request found with id ${REQUEST_ID}.`,
    ],
  ])(
    'names the missing record when %s reads a 404',
    async (name, args, text) => {
      const result = await callTool(
        name,
        args,
        {
          'GET /me': {
            body: meBody({ stop_tracking: { status: 'available' } }),
          },
        },
        CONFIRMING,
      );

      expect(result.isError).toBe(true);
      expect(result.text).toBe(text);
    },
  );

  it('rejects arguments the schema does not name', async () => {
    const result = await callTool(
      'stop_shipment_tracking',
      { shipment_id: SHIPMENT_ID, force: true },
      shipmentRoutes(),
      CONFIRMING,
    );

    expect(result.isError).toBe(true);
  });

  it.each([
    [
      'resume_shipment_tracking',
      { shipment_id: SHIPMENT_ID },
      `GET /shipments/${SHIPMENT_ID}`,
    ],
    [
      'cancel_tracking_request',
      { tracking_request_id: REQUEST_ID },
      `GET /tracking_requests/${REQUEST_ID}`,
    ],
  ])(
    'returns rate_limited as a soft result when %s is limited on its read',
    async (name, args, read) => {
      const result = await callTool(
        name,
        args,
        {
          'GET /me': { body: meBody() },
          [read]: { status: 429, headers: { 'Retry-After': '0' } },
        },
        CONFIRMING,
      );

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: 'rate_limited',
        retry_after_s: 0,
      });
    },
  );
});
