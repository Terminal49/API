import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { fakeApiClient, type FakeRoutes } from '../test/fake-api.js';
import { auditEvents, tokenOf, writeContext } from '../test/write-context.js';
import {
  cancelTrackingRequestOutputSchema,
  executeCancelTrackingRequest,
} from './cancel-tracking-request.js';

const REQUEST_ID = '6c1f0d52-8a3e-4b9f-9d21-0e5f4a7b8c90';
const OTHER_ACCOUNT_ID = 'c8f3d0b2-6e4a-4f9c-8d1b-2a3f4e5d6c7b';

const trackingRequest = (status: string) => ({
  data: {
    id: REQUEST_ID,
    type: 'tracking_request',
    attributes: {
      request_number: 'MAEU123456780',
      request_type: 'bill_of_lading',
      scac: 'MAEU',
      status,
      failed_reason: status === 'failed' ? 'Cancelled by user' : null,
      ref_numbers: [],
      tags: [],
      is_retrying: false,
      retry_count: 0,
      created_at: '2026-10-17T10:00:00Z',
      updated_at: '2026-10-17T10:00:00Z',
    },
    relationships: { tracked_object: { data: null } },
  },
});

/** A tracking request in `status` that a cancel call moves to cancelled. */
function request(initial = 'pending', cancel?: FakeRoutes[string]) {
  let status = initial;
  const routes: FakeRoutes = {
    [`GET /tracking_requests/${REQUEST_ID}`]: () => ({
      body: trackingRequest(status),
    }),
    [`PATCH /tracking_requests/${REQUEST_ID}/cancel`]:
      cancel ??
      (() => {
        status = 'cancelled';
        return { body: {} };
      }),
  };
  return {
    ...fakeApiClient(routes),
    setStatus: (next: string) => {
      status = next;
    },
  };
}

const call = (
  client: Parameters<typeof executeCancelTrackingRequest>[1],
  confirmation_token?: string,
  context = writeContext(client),
) =>
  executeCancelTrackingRequest(
    { tracking_request_id: REQUEST_ID, confirmation_token },
    client,
    context,
  );

function patches(requests: { method: string }[]) {
  return requests.filter((entry) => entry.method === 'PATCH');
}

describe('cancel_tracking_request', () => {
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

  it('previews a pending request without cancelling it', async () => {
    const { client, requests } = request();

    const result = await call(client);

    expect(result).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: {
          id: REQUEST_ID,
          request_number: 'MAEU123456780',
          scac: 'MAEU',
          status: 'pending',
        },
        proposed: { status: 'cancelled' },
        reach: expect.stringContaining('cannot be undone'),
      },
    });
    expect(cancelTrackingRequestOutputSchema.parse(result)).toEqual(result);
    expect(patches(requests)).toEqual([]);
  });

  it('cancels with the token and reads back the new status', async () => {
    const { client, requests } = request('awaiting_manifest');
    const preview = await call(client);

    const result = await call(client, tokenOf(preview));

    expect(result).toMatchObject({
      status: 'cancelled',
      tracking_request: { id: REQUEST_ID, status: 'cancelled' },
    });
    expect(cancelTrackingRequestOutputSchema.parse(result)).toEqual(result);
    expect(patches(requests)).toHaveLength(1);
    expect(auditEvents(logged).at(-1)).toMatchObject({
      tool: 'cancel_tracking_request',
      tier: 'C',
      phase: 'execute',
      outcome: 'cancelled',
      entity_type: 'tracking_request',
      entity_id: REQUEST_ID,
    });
  });

  it.each(['created', 'failed', 'cancelled', 'tracking_stopped'])(
    'returns not_cancellable and no token for a %s request',
    async (status) => {
      const { client, requests } = request(status);

      const result = await call(client);

      expect(result).toMatchObject({
        error: 'not_cancellable',
        tracking_request: { status },
      });
      expect(result).not.toHaveProperty('confirmation_token');
      expect(cancelTrackingRequestOutputSchema.parse(result)).toEqual(result);
      expect(patches(requests)).toEqual([]);
    },
  );

  it.each([
    [
      'created',
      'The request already created a shipment. To stop its updates, stop tracking that shipment instead.',
    ],
    ['failed', 'Nothing needs to be cancelled.'],
  ])(
    'tells the caller what to do instead for a %s request',
    async (status, alternative) => {
      const { client } = request(status);

      await expect(call(client)).resolves.toMatchObject({
        error: 'not_cancellable',
        alternative,
      });
    },
  );

  it('returns a new preview when the status changed after the first one', async () => {
    const { client, requests, setStatus } = request('pending');
    const preview = await call(client);
    setStatus('awaiting_manifest');

    const result = await call(client, tokenOf(preview));

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: { current: { status: 'awaiting_manifest' } },
    });
    expect(patches(requests)).toEqual([]);
  });

  it('returns not_cancellable when the request finished after the preview', async () => {
    const { client, requests, setStatus } = request('pending');
    const preview = await call(client);
    setStatus('created');

    await expect(call(client, tokenOf(preview))).resolves.toMatchObject({
      error: 'not_cancellable',
      tracking_request: { status: 'created' },
    });
    expect(patches(requests)).toEqual([]);
  });

  it('returns not_cancellable with the current status when the API answers 422', async () => {
    const { client, setStatus } = request('pending', () => {
      setStatus('created');
      return { status: 422 };
    });
    const preview = await call(client);

    await expect(call(client, tokenOf(preview))).resolves.toMatchObject({
      error: 'not_cancellable',
      tracking_request: { status: 'created' },
    });
  });

  it('returns noop, not not_cancellable, when the API answers 422 and the request is still pending', async () => {
    const { client } = request('pending', { status: 422 });
    const preview = await call(client);

    const result = await call(client, tokenOf(preview));

    expect(result).toMatchObject({
      status: 'noop',
      message: expect.stringContaining('Nothing was changed.'),
      alternative: expect.stringContaining('Terminal49 dashboard'),
      tracking_request: { status: 'pending' },
    });
    expect(result).not.toHaveProperty('error');
    expect(cancelTrackingRequestOutputSchema.parse(result)).toEqual(result);
    expect(auditEvents(logged).at(-1)).toMatchObject({ outcome: 'noop' });
  });

  it('accepts the same token again after the API refuses the cancel with a 422', async () => {
    let refuse = true;
    const { client, requests, setStatus } = request('pending', () => {
      if (refuse) {
        refuse = false;
        return { status: 422 };
      }
      setStatus('cancelled');
      return { body: {} };
    });
    const token = tokenOf(await call(client));

    const first = await call(client, token);
    const retry = await call(client, token);

    expect(first).toMatchObject({ status: 'noop' });
    expect(retry).toMatchObject({
      status: 'cancelled',
      tracking_request: { status: 'cancelled' },
    });
    expect(patches(requests)).toHaveLength(2);
  });

  it('reports the cancel when the read after it fails', async () => {
    let cancelled = false;
    const { client } = fakeApiClient({
      [`GET /tracking_requests/${REQUEST_ID}`]: () =>
        cancelled ? { status: 503 } : { body: trackingRequest('pending') },
      [`PATCH /tracking_requests/${REQUEST_ID}/cancel`]: () => {
        cancelled = true;
        return { body: {} };
      },
    });
    const preview = await call(client);

    const result = await call(client, tokenOf(preview));

    expect(result).toMatchObject({
      status: 'cancelled',
      tracking_request: {
        id: REQUEST_ID,
        request_number: 'MAEU123456780',
        status: 'cancelled',
      },
    });
    expect(cancelTrackingRequestOutputSchema.parse(result)).toEqual(result);
    expect(auditEvents(logged).at(-1)).toMatchObject({
      phase: 'execute',
      outcome: 'cancelled',
    });
  });

  it('returns rate_limited without a wait when the API sends no Retry-After', async () => {
    const { client } = request('pending', { status: 429 });
    const preview = await call(client);

    const result = await call(client, tokenOf(preview));

    expect(result).toEqual({
      error: 'rate_limited',
      message: expect.stringContaining('Nothing was changed.'),
      alternative: 'Wait a minute and try again.',
    });
    expect(cancelTrackingRequestOutputSchema.parse(result)).toEqual(result);
  });

  it('returns rate_limited when Terminal49 limits the read before the cancel', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /tracking_requests/${REQUEST_ID}`]: {
        status: 429,
        headers: { 'Retry-After': '10' },
      },
    });

    const result = await call(client, 'any-token');

    expect(result).toMatchObject({ error: 'rate_limited', retry_after_s: 10 });
    expect(cancelTrackingRequestOutputSchema.parse(result)).toEqual(result);
    expect(patches(requests)).toEqual([]);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ phase: 'execute', outcome: 'rate_limited' }),
    ]);
  });

  it('refuses a token issued for another account', async () => {
    const { client, requests } = request();
    const preview = await call(client);

    const result = await call(
      client,
      tokenOf(preview),
      writeContext(client, { gatewayAccountId: OTHER_ACCOUNT_ID }),
    );

    expect(result).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    expect(patches(requests)).toEqual([]);
  });

  it('refuses to preview or cancel without a confirmation secret', async () => {
    const { client, requests } = request();

    await expect(
      call(
        client,
        undefined,
        writeContext(client, { confirmationSecret: undefined }),
      ),
    ).resolves.toMatchObject({ error: 'not_permitted' });
    expect(patches(requests)).toEqual([]);
  });
});
