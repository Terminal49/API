/**
 * Proves a document's presigned download URL never reaches Sentry when it
 * records tool inputs and outputs. PostHog events and log lines carry neither
 * the tool output nor the upstream error text, so posthog.test.ts and
 * logging.test.ts prove their redaction instead.
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

const DOCUMENT_ID = 'e75541c0-9ad5-408b-9747-23415adfbca0';
const BROKEN_ID = '0c7a9f60-3b2d-4c1e-9a8f-7e6d5c4b3a21';
const SIGNATURE = 'SIGNATURE-SENTINEL-4242';
const SIGNED_URL = `https://t49-documents-prod.s3.amazonaws.com/a/hbl.pdf?X-Amz-Date=20261017T120000Z&X-Amz-Expires=3600&X-Amz-Signature=${SIGNATURE}`;

const document = {
  data: {
    id: DOCUMENT_ID,
    type: 'document',
    attributes: {
      name: 'HBL',
      file_name: 'hbl.pdf',
      file_content_type: 'application/pdf',
      file_url: SIGNED_URL,
    },
    links: { download: SIGNED_URL },
  },
};

const sentryEnvelopes: string[] = [];
const logLines: string[] = [];

async function callGetDocument(id: string) {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer('fixture-token', 'https://api.test', 'acct', {
        transport: 'http',
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
    return await client.callTool({
      name: 'get_document',
      arguments: { id, include_download_url: true },
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
  vi.stubGlobal(
    'fetch',
    fakeApiFetch({
      [`GET /documents/${DOCUMENT_ID}`]: { body: document },
      [`GET /documents/${DOCUMENT_ID}/download_url`]: {
        body: { download_url: SIGNED_URL },
      },
      [`GET /documents/${BROKEN_ID}`]: { body: document },
      [`GET /documents/${BROKEN_ID}/download_url`]: {
        status: 500,
        body: { errors: [{ status: '500', detail: `failed ${SIGNED_URL}` }] },
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

describe('document download URL telemetry', () => {
  it('reaches the client but never the logs, Sentry or PostHog', async () => {
    const result = await callGetDocument(DOCUMENT_ID);
    const failed = await callGetDocument(BROKEN_ID);
    await Sentry.flush(2000);
    await flushPostHogEvents();

    // Guard against a vacuous pass: the URL reached the client, Sentry saw it
    // and redacted it, and every sink saw both calls.
    expect(result.content).toContainEqual(
      expect.objectContaining({ type: 'resource_link', uri: SIGNED_URL }),
    );
    expect(JSON.stringify(result.structuredContent)).not.toContain(SIGNATURE);
    expect(failed.isError).toBe(true);

    const sentry = sentryEnvelopes.join('\n');
    expect(sentry).toContain('get_document');
    expect(sentry).toContain('[REDACTED_URL]');
    expect(sentry).not.toContain(SIGNATURE);

    const posthog = postHogBodies.join('\n');
    expect(posthog).toContain('get_document');
    expect(posthog).not.toContain(SIGNATURE);

    const logs = logLines.join('\n');
    expect(logs).toContain('mcp.tool.error');
    expect(logs).not.toContain(SIGNATURE);
  });
});
