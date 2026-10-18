/**
 * Proves a webhook's secret, header values and URL keys never reach Sentry
 * when it records tool inputs and outputs, nor PostHog or the logs. The
 * webhook tools read only named fields, so the values are gone before any
 * sink sees the result.
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
  notificationListBody,
  WEBHOOK_ID,
  WEBHOOK_SENTINELS,
  webhookListBody,
} from './test/webhook-fixtures.js';

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

const BROKEN_ID = '0c7a9f60-3b2d-4c1e-9a8f-7e6d5c4b3a21';

const sentryEnvelopes: string[] = [];
const logLines: string[] = [];

async function callDeveloperTool(name: string, args: Record<string, unknown>) {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer('fixture-token', 'https://api.test', 'acct', {
        transport: 'http',
        toolsets: ['developer'],
      }),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client({ name: 'telemetry-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  try {
    return await client.callTool({ name, arguments: args });
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
  vi.stubGlobal(
    'fetch',
    fakeApiFetch({
      'GET /webhooks': { body: webhookListBody },
      [`GET /webhooks/${WEBHOOK_ID}`]: {
        body: { data: webhookListBody.data[0] },
      },
      [`GET /webhooks/${BROKEN_ID}`]: { status: 500 },
      'GET /webhook_notifications': { body: notificationListBody },
    }).fetch,
  );
});

afterAll(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Sentry.close(2000);
});

describe('webhook telemetry', () => {
  it('keeps the secret, header values and URL keys out of the output, logs, Sentry and PostHog', async () => {
    const results = [
      await callDeveloperTool('list_webhooks', {}),
      await callDeveloperTool('list_webhooks', { webhook_id: WEBHOOK_ID }),
      await callDeveloperTool('list_webhook_notifications', {}),
    ];
    const failed = await callDeveloperTool('list_webhooks', {
      webhook_id: BROKEN_ID,
    });
    await Sentry.flush(2000);
    await flushPostHogEvents();

    // Guard against a vacuous pass: the tools returned webhooks, and every
    // sink saw the calls.
    expect(JSON.stringify(results[0]?.structuredContent)).toContain(
      '[redacted].[redacted].example.com:8443',
    );
    expect(failed.isError).toBe(true);
    const sentry = sentryEnvelopes.join('\n');
    expect(sentry).toContain('list_webhooks');
    expect(sentry).toContain('[redacted].[redacted].example.com:8443');
    const posthog = postHogBodies.join('\n');
    expect(posthog).toContain('list_webhook_notifications');
    const logs = logLines.join('\n');
    expect(logs).toContain('mcp.tool.error');

    const sinks = {
      output: JSON.stringify(results),
      sentry,
      posthog,
      logs,
    };
    for (const [sink, text] of Object.entries(sinks)) {
      for (const sentinel of WEBHOOK_SENTINELS) {
        expect(text, `${sentinel} in ${sink}`).not.toContain(sentinel);
      }
    }
  });
});
