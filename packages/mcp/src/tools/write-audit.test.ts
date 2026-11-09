/**
 * Proves a write's audit event reaches the log, Sentry and PostHog with only
 * the fields it names, and that no value, reference number, party name,
 * signed URL, confirmation token or API token can ride along.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';

const breadcrumbs = vi.hoisted(() => [] as unknown[]);
const captured = vi.hoisted(() => [] as unknown[]);

vi.mock('@sentry/node', () => ({
  isInitialized: () => true,
  addBreadcrumb: (breadcrumb: unknown) => breadcrumbs.push(breadcrumb),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  wrapMcpServerWithSentry: (server: unknown) => server,
}));

vi.mock('@posthog/mcp', async () => {
  const actual =
    await vi.importActual<typeof import('@posthog/mcp')>('@posthog/mcp');
  class FakePostHog {
    capture(message: unknown) {
      captured.push(message);
    }
    flush = vi.fn().mockResolvedValue(undefined);
    shutdown = vi.fn().mockResolvedValue(undefined);
  }
  return { ...actual, PostHog: FakePostHog };
});

import { initializePostHogFromEnv } from '../posthog.js';
import {
  buildWriteAuditEvent,
  emitWriteAudit,
  issueConfirmationToken,
  type WriteAuditInput,
} from './write-kit.js';

const ACCOUNT_ID = 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a';
const REQUEST_ID = '1f0e8a52-3c4d-4b6e-9f7a-8b9c0d1e2f3a';
const TOKEN = issueConfirmationToken(
  'a-test-secret-that-is-long-enough-to-sign',
  {
    tool: 'stop_shipment_tracking',
    args: {},
    accountId: ACCOUNT_ID,
    credentialHash: 'hash',
    channel: 'token',
  },
  'fingerprint',
).confirmation_token;

const FORBIDDEN = [
  'PO-SENTINEL-77',
  'Acme Party Sentinel',
  'CUSTOM-VALUE-SENTINEL',
  'X-Amz-Signature=SIG-SENTINEL',
  TOKEN,
  'API-TOKEN-SENTINEL',
];

const input: WriteAuditInput = {
  tool: 'track_container',
  tier: 'A',
  phase: 'execute',
  outcome: 'created',
  entityType: 'tracking_request',
  entityId: REQUEST_ID,
  accountId: ACCOUNT_ID,
  credentialType: 'user',
};

/** An input carrying extra fields and unsafe values, as a buggy caller might pass. */
const polluted = {
  ...input,
  outcome: `created ${FORBIDDEN[2]}`,
  entityId: FORBIDDEN[0],
  accountId: `https://x.test/a?${FORBIDDEN[3]}`,
  ref_numbers: [FORBIDDEN[0]],
  party_name: FORBIDDEN[1],
  value: FORBIDDEN[2],
  confirmation_token: TOKEN,
  apiToken: FORBIDDEN[5],
} as unknown as WriteAuditInput;

describe('write audit event', () => {
  let logged: string[];

  beforeAll(() => {
    vi.stubEnv('POSTHOG_PROJECT_API_KEY', 'phc_test');
    initializePostHogFromEnv();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    logged = [];
    breadcrumbs.length = 0;
    captured.length = 0;
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the tool, tier, phase, outcome, entity, account and credential type', () => {
    expect(buildWriteAuditEvent(input)).toEqual({
      tool: 'track_container',
      tier: 'A',
      phase: 'execute',
      outcome: 'created',
      entity_type: 'tracking_request',
      entity_id: REQUEST_ID,
      account_id: ACCOUNT_ID,
      credential_type: 'user',
    });
  });

  it('sends the same event to the log, Sentry and PostHog', () => {
    emitWriteAudit(input);
    const audit = buildWriteAuditEvent(input);

    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0]!)).toMatchObject({
      event: 'mcp.write.audit',
      ...audit,
    });
    expect(breadcrumbs).toEqual([
      { category: 'mcp.write.audit', level: 'info', data: audit },
    ]);
    expect(captured).toEqual([
      expect.objectContaining({
        distinctId: ACCOUNT_ID,
        event: 'mcp_write',
        properties: expect.objectContaining(audit),
      }),
    ]);
  });

  it('keeps every unsafe value and extra field out of every sink', () => {
    emitWriteAudit(polluted);

    const sinks = JSON.stringify({ logged, breadcrumbs, captured });
    for (const value of FORBIDDEN) {
      expect(sinks).not.toContain(value);
    }
    expect(buildWriteAuditEvent(polluted)).toEqual({
      ...buildWriteAuditEvent(input),
      outcome: 'unknown',
      entity_id: null,
      account_id: null,
    });
  });

  it('skips PostHog when the account is not known', () => {
    emitWriteAudit({ ...input, accountId: undefined });

    expect(logged).toHaveLength(1);
    expect(captured).toEqual([]);
  });
});
