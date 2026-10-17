import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createToolContext, type ToolSession } from './context.js';

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
  );
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

  it('refuses to preview or write without a secret, and logs why', async () => {
    const target = record();
    const plan = target.plan({});
    const read = vi.spyOn(plan, 'read');
    const ctx = context({ confirmationSecret: undefined });

    const result = await runConfirmedWrite(ctx, plan);

    expect(result).toMatchObject({ error: 'not_permitted' });
    expect(target.write).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
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
