/**
 * Runs a tier C tool through the HTTP handler and the MCP client on both
 * confirmation channels: a 2026-07-28 request that declares form elicitation
 * gets an input_required round the client answers for the user, and any
 * other request gets the preview-then-token flow.
 */
import type { Client } from '@modelcontextprotocol/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { CONFIRMATION_TTL_MS } from './tools/write-kit.js';
import { fakeApiFetch, type FakeRoutes } from './test/fake-api.js';
import {
  answerWith,
  asksTheUser,
  connect,
  modern,
  type Session,
} from './test/gateway-session.js';
import { meBody, tokenOf } from './test/write-context.js';

const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';
const STOPPED_AT = '2026-10-17T12:01:00Z';

/** Routes for a tracked shipment whose stop_tracking call is counted. */
function trackedShipment() {
  let stoppedAt: string | null = null;
  let billOfLading = 'MAEU123456789';
  const shipment = () => ({
    body: {
      data: {
        id: SHIPMENT_ID,
        type: 'shipment',
        attributes: {
          bill_of_lading_number: billOfLading,
          shipping_line_scac: 'MAEU',
          line_tracking_stopped_at: stoppedAt,
          line_tracking_stopped_reason: null,
        },
        relationships: { containers: { data: [] } },
      },
    },
  });
  const routes: FakeRoutes = {
    'GET /me': { body: meBody({ stop_tracking: { status: 'available' } }) },
    [`GET /shipments/${SHIPMENT_ID}`]: shipment,
    [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: () => {
      stoppedAt = STOPPED_AT;
      return shipment();
    },
  };
  const api = fakeApiFetch(routes);
  return {
    api,
    stops: () => api.requests.filter((request) => request.method === 'PATCH'),
    reads: () =>
      api.requests.filter(
        (request) => request.path === `/shipments/${SHIPMENT_ID}`,
      ),
    rebill: (next: string) => {
      billOfLading = next;
    },
  };
}

async function stop(client: Client, args: Record<string, unknown> = {}) {
  return client.callTool({
    name: 'stop_shipment_tracking',
    arguments: { shipment_id: SHIPMENT_ID, ...args },
  });
}

describe('confirming a tier C write', () => {
  let session: Session | undefined;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    await session?.close();
    session = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('asks the user through the client and writes once on accept', async () => {
    const { api, stops } = trackedShipment();
    vi.stubGlobal('fetch', api.fetch);
    session = await connect(asksTheUser);
    const asked = answerWith(session.client, {
      action: 'accept',
      content: { confirm: true },
    });

    const result = await stop(session.client);

    expect(result.structuredContent).toMatchObject({ status: 'stopped' });
    expect(stops()).toHaveLength(1);
    expect(asked).toHaveBeenCalledOnce();
    expect(asked.mock.calls[0]?.[0]).toMatchObject({
      params: {
        message: expect.stringContaining('Every container on this shipment'),
        requestedSchema: { required: ['confirm'] },
      },
    });
    // The first round changed nothing and carried the state the client echoed.
    expect(session.results[0]).toMatchObject({
      resultType: 'input_required',
      requestState: expect.stringMatching(/^t49ct1\./),
    });
    expect(session.calls[1]?.params).toMatchObject({
      requestState: (session.results[0] as { requestState: string })
        .requestState,
      inputResponses: {
        confirm: { action: 'accept', content: { confirm: true } },
      },
    });
  });

  it('writes nothing when the user declines', async () => {
    const { api, stops } = trackedShipment();
    vi.stubGlobal('fetch', api.fetch);
    session = await connect(asksTheUser);
    answerWith(session.client, { action: 'decline' });

    const result = await stop(session.client);

    expect(result.structuredContent).toEqual({
      status: 'declined',
      message: 'The user declined this change. Nothing was changed.',
    });
    expect(stops()).toEqual([]);
  });

  it.each(
    (['decline', 'cancel', 'unticked accept'] as const).flatMap((answer) =>
      (['expired', 'stale'] as const).map(
        (preview) => [answer, preview] as const,
      ),
    ),
  )(
    'returns declined for a %s when the preview went %s before the user answered',
    async (answer, preview) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const shipment = trackedShipment();
      vi.stubGlobal('fetch', shipment.api.fetch);
      session = await connect(asksTheUser);
      session.client.setRequestHandler('elicitation/create', async () => {
        if (preview === 'expired') {
          vi.setSystemTime(Date.now() + CONFIRMATION_TTL_MS);
        } else {
          shipment.rebill('MAEU999999999');
        }
        return answer === 'unticked accept'
          ? { action: 'accept' as const, content: { confirm: false } }
          : { action: answer };
      });

      const result = await stop(session.client);

      expect(result.structuredContent).toEqual({
        status: 'declined',
        message:
          answer === 'cancel'
            ? 'The user dismissed the confirmation without answering. Nothing was changed.'
            : 'The user declined this change. Nothing was changed.',
      });
      expect(session.calls).toHaveLength(2);
      expect(shipment.reads()).toHaveLength(1);
      expect(shipment.stops()).toEqual([]);
    },
  );

  it('refuses a confirmation_token from a client that asks the user', async () => {
    const { api, stops } = trackedShipment();
    vi.stubGlobal('fetch', api.fetch);
    session = await connect(asksTheUser);
    const asked = answerWith(session.client, {
      action: 'accept',
      content: { confirm: true },
    });

    const result = await stop(session.client, {
      confirmation_token: 't49ct1.aaaa.bbbb.cccc',
    });

    expect(result.structuredContent).toMatchObject({
      error: 'token_not_accepted',
    });
    expect(asked).not.toHaveBeenCalled();
    expect(stops()).toEqual([]);
  });

  it('refuses an edited requestState and writes nothing', async () => {
    const { api, stops } = trackedShipment();
    vi.stubGlobal('fetch', api.fetch);
    session = await connect(asksTheUser, (body) => {
      const state = body.params?.requestState;
      return typeof state === 'string'
        ? { ...body, params: { ...body.params, requestState: `${state}x` } }
        : body;
    });
    answerWith(session.client, {
      action: 'accept',
      content: { confirm: true },
    });

    const result = await stop(session.client);

    expect(result.structuredContent).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'malformed',
    });
    expect(stops()).toEqual([]);
  });

  it.each([
    ['a 2026-07-28 client without elicitation', modern],
    ['a 2025-era client', {}],
  ])('keeps the preview-then-token flow for %s', async (_label, options) => {
    const { api, stops } = trackedShipment();
    vi.stubGlobal('fetch', api.fetch);
    session = await connect(options);

    const preview = await stop(session.client);
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
    });
    expect(stops()).toEqual([]);

    const stopped = await stop(session.client, {
      confirmation_token: tokenOf(preview.structuredContent),
    });
    expect(stopped.structuredContent).toMatchObject({ status: 'stopped' });
    expect(stops()).toHaveLength(1);
  });

  it('marks only tier C tools as needing the user, and tells the model both ways', async () => {
    vi.stubGlobal('fetch', trackedShipment().api.fetch);
    session = await connect(modern);

    const { tools } = await session.client.listTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    expect(byName.get('stop_shipment_tracking')?._meta).toEqual({
      'anthropic/requiresUserInteraction': true,
    });
    expect(byName.get('cancel_tracking_request')?._meta).toEqual({
      'anthropic/requiresUserInteraction': true,
    });
    expect(byName.get('resume_shipment_tracking')?._meta).toBeUndefined();
    expect(byName.get('search_container')?._meta).toBeUndefined();
    expect(byName.get('stop_shipment_tracking')?.description).toMatch(
      /On a client that can ask the user \(form elicitation\).*never pass confirmation_token there\. On any other client, the first call returns the preview with a confirmation_token/,
    );
  });
});
