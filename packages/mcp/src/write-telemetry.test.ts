/**
 * Proves a confirmation token never reaches the logs, Sentry or PostHog when
 * Sentry records tool inputs and outputs. The preview returns the token and
 * the confirmed call sends it back, so both directions are covered.
 */
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import * as Sentry from '@sentry/node';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { flushPostHogEvents, initializePostHogFromEnv } from './posthog.js';
import { buildSentryOptions } from './sentry.js';
import { createTerminal49McpServer } from './server.js';
import { fakeApiFetch } from './test/fake-api.js';
import {
  meBody,
  TEST_ACCOUNT_ID,
  TEST_CONFIRMATION_SECRET,
  tokenOf,
} from './test/write-context.js';

const postHogBodies = vi.hoisted((): string[] => []);

// The real PostHog client and instrumentation, with ingestion captured here.
vi.mock('@posthog/mcp', async () => {
  const actual =
    await vi.importActual<typeof import('@posthog/mcp')>('@posthog/mcp');

  class CapturingPostHog extends actual.PostHog {
    constructor(apiKey: string, options: Record<string, unknown> = {}) {
      super(apiKey, {
        ...options,
        flushAt: 1,
        disableCompression: true,
        fetch: async (_url: string, init: { body?: unknown }) => {
          postHogBodies.push(String(init.body ?? ''));
          return {
            status: 200,
            text: async () => '{}',
            json: async () => ({}),
          };
        },
      });
    }
  }

  return { ...actual, PostHog: CapturingPostHog };
});

const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';

const sentryEnvelopes: string[] = [];
const logLines: string[] = [];

async function callStop(args: Record<string, unknown>) {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer(
        'fixture-token',
        'https://api.test',
        TEST_ACCOUNT_ID,
        {
          transport: 'http',
          toolsets: ['operations'],
          confirmationSecret: TEST_CONFIRMATION_SECRET,
        },
      ),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client({ name: 'telemetry-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  try {
    return await client.callTool({
      name: 'stop_shipment_tracking',
      arguments: args,
    });
  } finally {
    await client.close();
    await handler.close();
  }
}

beforeAll(() => {
  vi.stubEnv('SENTRY_MCP_RECORD_INPUTS', 'true');
  vi.stubEnv('SENTRY_MCP_RECORD_OUTPUTS', 'true');
  Sentry.init({
    ...buildSentryOptions('https://public@o0.ingest.sentry.io/0', {
      SENTRY_SEND_DEFAULT_PII: 'true',
    }),
    transport: () => ({
      send: async (envelope) => {
        sentryEnvelopes.push(JSON.stringify(envelope));
        return {};
      },
      flush: async () => true,
    }),
  });
  initializePostHogFromEnv({ POSTHOG_PROJECT_API_KEY: 'phc_test' });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    logLines.push(args.map(String).join(' '));
  });

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
  vi.stubGlobal(
    'fetch',
    fakeApiFetch({
      'GET /me': { body: meBody({ stop_tracking: { status: 'available' } }) },
      [`GET /shipments/${SHIPMENT_ID}`]: shipment,
      [`PATCH /shipments/${SHIPMENT_ID}/stop_tracking`]: () => {
        stoppedAt = '2026-10-17T12:00:00Z';
        return shipment();
      },
    }).fetch,
  );
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Sentry.close(2000);
});

describe('confirmation token telemetry', () => {
  it('reaches the client but never the logs, Sentry or PostHog', async () => {
    const preview = await callStop({ shipment_id: SHIPMENT_ID });
    const token = tokenOf(preview.structuredContent);
    const stopped = await callStop({
      shipment_id: SHIPMENT_ID,
      confirmation_token: token,
    });
    await Sentry.flush(2000);
    await flushPostHogEvents();

    // Guard against a vacuous pass: the token reached the client and was
    // accepted, Sentry recorded it and redacted it, and every sink saw the
    // calls.
    expect(token).toMatch(/^t49ct1\./);
    expect(stopped.structuredContent).toMatchObject({ status: 'stopped' });

    const sentry = sentryEnvelopes.join('\n');
    expect(sentry).toContain('stop_shipment_tracking');
    expect(sentry).toContain('[REDACTED_CONFIRMATION_TOKEN]');
    expect(sentry).not.toContain('t49ct1.');

    const posthog = postHogBodies.join('\n');
    expect(posthog).toContain('stop_shipment_tracking');
    expect(posthog).not.toContain('t49ct1.');

    const logs = logLines.join('\n');
    expect(logs).toContain('mcp.write.audit');
    expect(logs).not.toContain('t49ct1.');
  });
});
