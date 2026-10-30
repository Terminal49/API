import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { CLIENT_CAPABILITIES_META_KEY } from '@modelcontextprotocol/server';
import {
  CONFIRM_REQUEST_KEY,
  type ConfirmationChannel,
  confirmationChannel,
  createToolContext,
  type ToolSession,
} from './context.js';

const captureMcpEvent = vi.hoisted(() => vi.fn());
vi.mock('../posthog.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../posthog.js')>()),
  captureMcpEvent,
}));

import {
  CONFIRMATION_TTL_MS,
  runConfirmedWrite,
  runWrite,
  type ConfirmedWriteRead,
} from './write-kit.js';

const SECRET = 'a-test-secret-that-is-long-enough-to-sign';
const ACCOUNT_ID = 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a';
const OTHER_ACCOUNT_ID = 'c8f3d0b2-6e4a-4f9c-8d1b-2a3f4e5d6c7b';
const RECORD_ID = '1f0e8a52-3c4d-4b6e-9f7a-8b9c0d1e2f3a';

function context(
  session: Partial<ToolSession> = {},
  me = vi.fn().mockResolvedValue({ account: { id: ACCOUNT_ID } }),
  confirmation: ConfirmationChannel = { kind: 'token' },
) {
  return createToolContext(
    { me },
    {
      credentialType: 'api_key',
      toolsets: ['core'],
      writeToolsAvailable: true,
      credentialHash: 'credential-1',
      confirmationSecret: SECRET,
      ...session,
    },
    confirmation,
  );
}

/** A context for a request that declared form elicitation. */
function elicitingContext(
  round: Partial<Extract<ConfirmationChannel, { kind: 'elicitation' }>> = {},
  session: Partial<ToolSession> = {},
) {
  return context(session, undefined, {
    kind: 'elicitation',
    requestState: undefined,
    answer: undefined,
    ...round,
  });
}

/** The requestState an input_required result carries. */
function stateOf(result: unknown): string {
  const state = (result as { requestState?: unknown }).requestState;
  if (typeof state !== 'string') {
    throw new Error(`no requestState in ${JSON.stringify(result)}`);
  }
  return state;
}

type Preview = { status: string };
type Read = ConfirmedWriteRead<Preview, { status: 'nothing_to_do' }>;

/** A record whose status the test can change between calls. */
function record(initial = 'active') {
  let status = initial;
  const write = vi.fn(async () => {
    status = 'changed';
    return { status: 'done' as const };
  });
  return {
    write,
    setStatus: (next: string) => {
      status = next;
    },
    plan: (args: Record<string, unknown>) => ({
      tool: 'track_container' as const,
      entityType: 'tracking_request' as const,
      entityId: RECORD_ID,
      args: { id: RECORD_ID, ...args },
      read: async (): Promise<Read> =>
        status === 'idle'
          ? { stop: { status: 'nothing_to_do' } }
          : status === 'additive'
            ? { additive: { status } }
            : { state: { status }, preview: { status } },
      write,
    }),
  };
}

/** Changes the first character of the token's state tag. */
function flipStateTag(token: string): string {
  const parts = token.split('.');
  const tag = parts[2] ?? '';
  parts[2] = (tag.startsWith('A') ? 'B' : 'A') + tag.slice(1);
  return parts.join('.');
}

function auditLines(lines: string[]) {
  return lines
    .map((line) => JSON.parse(line))
    .filter((event) => event.event === 'mcp.write.audit');
}

describe('runConfirmedWrite', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('previews without writing, then writes with the token', async () => {
    const target = record();
    const ctx = context();

    const preview = await runConfirmedWrite(ctx, target.plan({}));
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: { status: 'active' },
      confirmation_token: expect.stringMatching(/^t49ct1\./),
      expires_at: expect.any(String),
    });
    expect(target.write).not.toHaveBeenCalled();

    const token = (preview as { confirmation_token: string })
      .confirmation_token;
    await expect(
      runConfirmedWrite(ctx, target.plan({ confirmation_token: token })),
    ).resolves.toEqual({ status: 'done' });
    expect(target.write).toHaveBeenCalledOnce();
    expect(auditLines(logged)).toEqual([
      expect.objectContaining({
        phase: 'preview',
        outcome: 'confirmation_required',
        account_id: ACCOUNT_ID,
      }),
      expect.objectContaining({ phase: 'execute', outcome: 'done' }),
    ]);
  });

  it('returns a new preview and does not write when the record changed', async () => {
    const target = record();
    const ctx = context();
    const preview = await runConfirmedWrite(ctx, target.plan({}));
    target.setStatus('paused');

    const result = await runConfirmedWrite(
      ctx,
      target.plan({
        confirmation_token: (preview as { confirmation_token: string })
          .confirmation_token,
      }),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: { status: 'paused' },
      confirmation_token: expect.stringMatching(/^t49ct1\./),
    });
    expect(target.write).not.toHaveBeenCalled();
  });

  it.each([
    ['with an edited state tag', flipStateTag, {}],
    ['for other arguments', (token: string) => token, { extra: true }],
  ])(
    'refuses a token %s',
    async (_label, edit, extraArgs: Record<string, unknown>) => {
      const target = record();
      const ctx = context();
      const preview = (await runConfirmedWrite(ctx, target.plan({}))) as {
        confirmation_token: string;
      };

      const result = await runConfirmedWrite(
        ctx,
        target.plan({
          ...extraArgs,
          confirmation_token: edit(preview.confirmation_token),
        }),
      );

      expect(result).toMatchObject({
        error: 'invalid_confirmation',
        reason: 'mismatch',
      });
      expect(target.write).not.toHaveBeenCalled();
    },
  );

  it('refuses a token from another account or credential', async () => {
    const target = record();
    const preview = (await runConfirmedWrite(context(), target.plan({}))) as {
      confirmation_token: string;
    };
    const plan = target.plan({
      confirmation_token: preview.confirmation_token,
    });

    await expect(
      runConfirmedWrite(context({ gatewayAccountId: OTHER_ACCOUNT_ID }), plan),
    ).resolves.toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    await expect(
      runConfirmedWrite(context({ credentialHash: 'credential-2' }), plan),
    ).resolves.toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    expect(target.write).not.toHaveBeenCalled();
  });

  it('refuses an expired token', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-17T12:00:00Z') });
    const target = record();
    const ctx = context();
    const preview = (await runConfirmedWrite(ctx, target.plan({}))) as {
      confirmation_token: string;
    };
    vi.advanceTimersByTime(CONFIRMATION_TTL_MS);

    await expect(
      runConfirmedWrite(
        ctx,
        target.plan({ confirmation_token: preview.confirmation_token }),
      ),
    ).resolves.toMatchObject({
      error: 'invalid_confirmation',
      reason: 'expired',
    });
    expect(target.write).not.toHaveBeenCalled();
  });

  it('runs a change that needs no approval without a secret', async () => {
    const target = record('additive');

    await expect(
      runConfirmedWrite(
        context({ confirmationSecret: undefined }),
        target.plan({}),
      ),
    ).resolves.toEqual({ status: 'done' });
    expect(target.write).toHaveBeenCalledTimes(1);
    expect(logged.map((line) => JSON.parse(line).event)).not.toContain(
      'mcp.config.error',
    );
  });

  it('refuses to preview or write a change that needs approval without a secret, and logs why', async () => {
    const target = record();
    const plan = target.plan({});
    const read = vi.spyOn(plan, 'read');
    const ctx = context({ confirmationSecret: undefined });

    const result = await runConfirmedWrite(ctx, plan);

    expect(result).toMatchObject({
      error: 'not_permitted',
      message: expect.stringContaining('T49_MCP_CONFIRMATION_SECRET'),
    });
    expect(target.write).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
    expect(logged.map((line) => JSON.parse(line).event)).toContain(
      'mcp.config.error',
    );
    expect(auditLines(logged)).toEqual([
      expect.objectContaining({
        outcome: 'not_permitted',
        account_id: ACCOUNT_ID,
      }),
    ]);
  });

  it('returns the read result when there is nothing to confirm', async () => {
    const target = record('idle');

    await expect(
      runConfirmedWrite(context(), target.plan({})),
    ).resolves.toEqual({ status: 'nothing_to_do' });
    expect(target.write).not.toHaveBeenCalled();
    expect(auditLines(logged)).toEqual([
      expect.objectContaining({
        outcome: 'nothing_to_do',
        account_id: ACCOUNT_ID,
      }),
    ]);
  });

  it('audits a write that throws and rethrows it', async () => {
    const target = record();
    const ctx = context();
    target.write.mockRejectedValueOnce(new Error('upstream failed'));
    const preview = (await runConfirmedWrite(ctx, target.plan({}))) as {
      confirmation_token: string;
    };

    await expect(
      runConfirmedWrite(
        ctx,
        target.plan({ confirmation_token: preview.confirmation_token }),
      ),
    ).rejects.toThrow('upstream failed');
    expect(auditLines(logged).at(-1)).toMatchObject({ outcome: 'error' });
  });
});

describe('runConfirmedWrite on a request that can ask the user', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('asks the client to confirm the preview and writes nothing', async () => {
    const target = record();

    const result = await runConfirmedWrite(elicitingContext(), target.plan({}));

    expect(result).toEqual({
      resultType: 'input_required',
      inputRequests: {
        confirm: {
          method: 'elicitation/create',
          params: {
            mode: 'form',
            message:
              'track_container on tracking_request 1f0e8a52-3c4d-4b6e-9f7a-8b9c0d1e2f3a\nstatus: "active"',
            requestedSchema: {
              type: 'object',
              properties: {
                confirm: {
                  type: 'boolean',
                  title: 'Confirm',
                  description: 'Make this change',
                },
              },
              required: ['confirm'],
            },
          },
        },
      },
      requestState: expect.stringMatching(/^t49ct1\./),
    });
    expect(target.write).not.toHaveBeenCalled();
    expect(auditLines(logged)).toEqual([
      expect.objectContaining({
        phase: 'preview',
        outcome: 'elicitation_required',
        account_id: ACCOUNT_ID,
      }),
    ]);
  });

  it('writes once when the user accepts', async () => {
    const target = record();
    const asked = await runConfirmedWrite(elicitingContext(), target.plan({}));

    const result = await runConfirmedWrite(
      elicitingContext({
        requestState: stateOf(asked),
        answer: { action: 'accept', confirm: true },
      }),
      target.plan({}),
    );

    expect(result).toEqual({ status: 'done' });
    expect(target.write).toHaveBeenCalledOnce();
    expect(auditLines(logged).at(-1)).toMatchObject({
      phase: 'execute',
      outcome: 'done',
    });
  });

  it.each([
    [
      'declines',
      { action: 'decline' } as const,
      'The user declined this change. Nothing was changed.',
    ],
    [
      'cancels',
      { action: 'cancel' } as const,
      'The user dismissed the confirmation without answering. Nothing was changed.',
    ],
    [
      'accepts without ticking confirm',
      { action: 'accept', confirm: false } as const,
      'The user declined this change. Nothing was changed.',
    ],
  ])('writes nothing when the user %s', async (_label, answer, message) => {
    const target = record();
    const asked = await runConfirmedWrite(elicitingContext(), target.plan({}));

    const result = await runConfirmedWrite(
      elicitingContext({ requestState: stateOf(asked), answer }),
      target.plan({}),
    );

    expect(result).toEqual({ status: 'declined', message });
    expect(target.write).not.toHaveBeenCalled();
    expect(auditLines(logged).at(-1)).toMatchObject({
      phase: 'execute',
      outcome: 'declined',
    });
  });

  it('leaves the confirmation unspent when the user declines', async () => {
    const target = record();
    const asked = await runConfirmedWrite(elicitingContext(), target.plan({}));
    const requestState = stateOf(asked);
    await runConfirmedWrite(
      elicitingContext({ requestState, answer: { action: 'decline' } }),
      target.plan({}),
    );

    const result = await runConfirmedWrite(
      elicitingContext({
        requestState,
        answer: { action: 'accept', confirm: true },
      }),
      target.plan({}),
    );

    expect(result).toEqual({ status: 'done' });
    expect(target.write).toHaveBeenCalledOnce();
  });

  /** A context whose channel is parsed from what a client sent. */
  function answeredContext(
    requestState: string | undefined,
    response: unknown,
  ) {
    return context(
      {},
      undefined,
      confirmationChannel({
        envelope: { [CLIENT_CAPABILITIES_META_KEY]: { elicitation: {} } },
        inputResponses: { [CONFIRM_REQUEST_KEY]: response },
        requestState: <T>() => requestState as T,
      }),
    );
  }

  it.each([
    ['no content', { action: 'accept' }],
    ['null content', { action: 'accept', content: null }],
    ['confirm "true"', { action: 'accept', content: { confirm: 'true' } }],
    ['confirm 1', { action: 'accept', content: { confirm: 1 } }],
  ])(
    'reads an accept with %s as a decline and writes nothing',
    async (_label, response) => {
      const target = record();
      const asked = await runConfirmedWrite(
        elicitingContext(),
        target.plan({}),
      );

      const result = await runConfirmedWrite(
        answeredContext(stateOf(asked), response),
        target.plan({}),
      );

      expect(result).toEqual({
        status: 'declined',
        message: 'The user declined this change. Nothing was changed.',
      });
      expect(target.write).not.toHaveBeenCalled();
    },
  );

  it('asks again when an answer comes back without its requestState', async () => {
    const target = record();

    const result = await runConfirmedWrite(
      answeredContext(undefined, {
        action: 'accept',
        content: { confirm: true },
      }),
      target.plan({}),
    );

    expect(result).toMatchObject({ requestState: expect.any(String) });
    expect(target.write).not.toHaveBeenCalled();
    expect(auditLines(logged).at(-1)).toMatchObject({
      phase: 'preview',
      outcome: 'elicitation_required',
    });
  });

  it('asks again, with a note, when the record changed before the user answered', async () => {
    const target = record();
    const asked = await runConfirmedWrite(elicitingContext(), target.plan({}));
    target.setStatus('paused');

    const result = await runConfirmedWrite(
      elicitingContext({
        requestState: stateOf(asked),
        answer: { action: 'accept', confirm: true },
      }),
      target.plan({}),
    );

    expect(result).toMatchObject({
      resultType: 'input_required',
      inputRequests: {
        confirm: {
          params: {
            message:
              'The record changed after you last saw it. Here is its current state.\n' +
              'track_container on tracking_request 1f0e8a52-3c4d-4b6e-9f7a-8b9c0d1e2f3a\n' +
              'status: "paused"',
          },
        },
      },
    });
    expect(stateOf(result)).not.toBe(stateOf(asked));
    expect(target.write).not.toHaveBeenCalled();
  });

  it.each([
    ['edited', (state: string) => flipStateTag(state), {}, 'mismatch'],
    [
      'sent with other arguments',
      (state: string) => state,
      { extra: true },
      'mismatch',
    ],
    ['not one the server issued', () => 'not-a-state', {}, 'malformed'],
  ])(
    'refuses a requestState that is %s',
    async (_label, edit, extraArgs: Record<string, unknown>, reason) => {
      const target = record();
      const asked = await runConfirmedWrite(
        elicitingContext(),
        target.plan({}),
      );

      const result = await runConfirmedWrite(
        elicitingContext({
          requestState: edit(stateOf(asked)),
          answer: { action: 'accept', confirm: true },
        }),
        target.plan(extraArgs),
      );

      expect(result).toEqual({
        error: 'invalid_confirmation',
        reason,
        message: expect.stringContaining('Nothing was changed.'),
        alternative:
          'Call track_container again with the same arguments. The client will ask the user to confirm the current state.',
      });
      expect(target.write).not.toHaveBeenCalled();
    },
  );

  it('refuses a requestState from another account or credential', async () => {
    const target = record();
    const asked = await runConfirmedWrite(elicitingContext(), target.plan({}));
    const round = {
      requestState: stateOf(asked),
      answer: { action: 'accept', confirm: true } as const,
    };

    await expect(
      runConfirmedWrite(
        elicitingContext(round, { gatewayAccountId: OTHER_ACCOUNT_ID }),
        target.plan({}),
      ),
    ).resolves.toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    await expect(
      runConfirmedWrite(
        elicitingContext(round, { credentialHash: 'credential-2' }),
        target.plan({}),
      ),
    ).resolves.toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    expect(target.write).not.toHaveBeenCalled();
  });

  it('refuses an expired requestState', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-17T12:00:00Z') });
    const target = record();
    const asked = await runConfirmedWrite(elicitingContext(), target.plan({}));
    vi.advanceTimersByTime(CONFIRMATION_TTL_MS);

    await expect(
      runConfirmedWrite(
        elicitingContext({
          requestState: stateOf(asked),
          answer: { action: 'accept', confirm: true },
        }),
        target.plan({}),
      ),
    ).resolves.toMatchObject({
      error: 'invalid_confirmation',
      reason: 'expired',
    });
    expect(target.write).not.toHaveBeenCalled();
  });

  it('refuses a confirmation_token without reading the record', async () => {
    const target = record();
    const plan = target.plan({ confirmation_token: 't49ct1.x.y.z' });
    const read = vi.spyOn(plan, 'read');

    const result = await runConfirmedWrite(elicitingContext(), plan);

    expect(result).toEqual({
      error: 'token_not_accepted',
      message:
        'This client asks the user to confirm changes itself, so a confirmation_token is not accepted here. Nothing was changed.',
      alternative:
        'Call track_container again with the same arguments and no confirmation_token. The client will show the user the preview and ask them to confirm.',
    });
    expect(read).not.toHaveBeenCalled();
    expect(target.write).not.toHaveBeenCalled();
    expect(auditLines(logged)).toEqual([
      expect.objectContaining({
        phase: 'execute',
        outcome: 'token_not_accepted',
      }),
    ]);
  });

  it('never accepts a requestState as a confirmation_token, or a token as a requestState', async () => {
    const target = record();
    const asked = await runConfirmedWrite(elicitingContext(), target.plan({}));
    const preview = await runConfirmedWrite(context(), target.plan({}));
    const token = (preview as { confirmation_token: string })
      .confirmation_token;

    await expect(
      runConfirmedWrite(
        context(),
        target.plan({ confirmation_token: stateOf(asked) }),
      ),
    ).resolves.toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    await expect(
      runConfirmedWrite(
        elicitingContext({
          requestState: token,
          answer: { action: 'accept', confirm: true },
        }),
        target.plan({}),
      ),
    ).resolves.toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    expect(target.write).not.toHaveBeenCalled();
  });

  it('refuses to ask without a secret', async () => {
    const target = record();

    await expect(
      runConfirmedWrite(
        elicitingContext({}, { confirmationSecret: undefined }),
        target.plan({}),
      ),
    ).resolves.toMatchObject({ error: 'not_permitted' });
    expect(target.write).not.toHaveBeenCalled();
  });
});

describe('runWrite', () => {
  let lines: string[];
  const target = {
    tool: 'track_container' as const,
    entityType: 'tracking_request' as const,
    entityId: RECORD_ID,
  };

  beforeEach(() => {
    lines = [];
    captureMcpEvent.mockClear();
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      lines.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('audits the outcome of a tier A write', async () => {
    await expect(
      runWrite(context({ gatewayAccountId: ACCOUNT_ID }), target, async () => ({
        status: 'created',
      })),
    ).resolves.toEqual({ status: 'created' });
    expect(auditLines(lines)).toEqual([
      expect.objectContaining({
        tier: 'A',
        phase: 'execute',
        outcome: 'created',
        account_id: ACCOUNT_ID,
      }),
    ]);
  });

  it('names the /me account and sends the event to PostHog when the gateway named none', async () => {
    await runWrite(context(), target, async () => ({ status: 'created' }));

    expect(auditLines(lines)).toEqual([
      expect.objectContaining({ outcome: 'created', account_id: ACCOUNT_ID }),
    ]);
    expect(captureMcpEvent).toHaveBeenCalledWith(
      'mcp_write',
      ACCOUNT_ID,
      expect.objectContaining({
        tool: 'track_container',
        outcome: 'created',
        account_id: ACCOUNT_ID,
      }),
    );
  });

  it('returns a write within seconds when /me hangs, and audits without an account', async () => {
    vi.useFakeTimers();
    try {
      const me = vi.fn(() => new Promise<never>(() => {}));
      const settled = vi.fn();
      void runWrite(context({}, me), target, async () => ({
        status: 'created',
      })).then(settled);

      await vi.advanceTimersByTimeAsync(5_000);

      expect(settled).toHaveBeenCalledWith({ status: 'created' });
      expect(auditLines(lines)).toEqual([
        expect.objectContaining({ outcome: 'created', account_id: null }),
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still returns the result when /me fails, and audits without an account', async () => {
    const me = vi.fn().mockRejectedValue(new Error('me failed'));

    await expect(
      runWrite(context({}, me), target, async () => ({ status: 'created' })),
    ).resolves.toEqual({ status: 'created' });
    expect(auditLines(lines)).toEqual([
      expect.objectContaining({ outcome: 'created', account_id: null }),
    ]);
    expect(captureMcpEvent).not.toHaveBeenCalled();
  });
});
