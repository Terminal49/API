import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as Sentry from '@sentry/node';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { buildSentryOptions, scrubSensitiveRequestData } from './sentry.js';

const SECRET_VALUES = [
  'AUTH-SENTINEL-0000',
  'COOKIE-SENTINEL-0000',
  'OIDC-SENTINEL-0000',
  'APIKEY-SENTINEL-0000',
  'SIGNATURE-SENTINEL-0000',
  'BYPASS-SENTINEL-0000',
];

const CREDENTIAL_HEADERS = {
  authorization: `Token ${SECRET_VALUES[0]}`,
  // `prefs` is not a cookie name Sentry recognizes as sensitive.
  cookie: `prefs=${SECRET_VALUES[1]}`,
  'x-vercel-oidc-token': SECRET_VALUES[2],
  'x-api-key': SECRET_VALUES[3],
  'x-vercel-proxy-signature': SECRET_VALUES[4],
  'x-vercel-protection-bypass': SECRET_VALUES[5],
};

describe('scrubSensitiveRequestData', () => {
  it('drops credential headers and cookies case-insensitively', () => {
    const event = scrubSensitiveRequestData({
      request: {
        headers: {
          Authorization: 'Token x',
          'X-T49-Connected-Clients-Resolve-Secret': 'x',
          'x-vercel-protection-bypass': 'x',
          'MCP-Protocol-Version': '2025-06-18',
        },
        cookies: { session: 'x' },
      },
    });

    expect(event.request?.headers).toEqual({
      'MCP-Protocol-Version': '2025-06-18',
    });
    expect(event.request?.cookies).toBeUndefined();
  });

  it('drops credential header attributes from trace and span data', () => {
    const event = scrubSensitiveRequestData({
      contexts: {
        trace: {
          trace_id: 't',
          span_id: 's',
          data: {
            'http.request.header.x_vercel_proxy_signature': 'x',
            'http.request.header.cookie.prefs': 'x',
            'http.response.header.set_cookie': 'x',
            'http.request.header.mcp_protocol_version': '2025-06-18',
            'http.method': 'POST',
          },
        },
      },
      spans: [
        {
          span_id: 'c',
          trace_id: 't',
          start_timestamp: 0,
          data: {
            'http.request.header.authorization': 'x',
            'http.url': 'https://api.terminal49.com/v2',
          },
        },
      ],
    });

    expect(event.contexts?.trace?.data).toEqual({
      'http.request.header.mcp_protocol_version': '2025-06-18',
      'http.method': 'POST',
    });
    expect(event.spans?.[0]?.data).toEqual({
      'http.url': 'https://api.terminal49.com/v2',
    });
  });

  it('leaves events without request or span data untouched', () => {
    expect(scrubSensitiveRequestData({ message: 'no request' })).toEqual({
      message: 'no request',
    });
  });
});

describe('Sentry event pipeline', () => {
  const sentEnvelopes: string[] = [];
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Worst case: default PII collection on, every request traced.
    Sentry.init({
      ...buildSentryOptions('https://public@o0.ingest.sentry.io/0', {
        SENTRY_SEND_DEFAULT_PII: 'true',
      }),
      transport: () => ({
        send: async (envelope) => {
          sentEnvelopes.push(JSON.stringify(envelope));
          return {};
        },
        flush: async () => true,
      }),
    });

    server = createServer((_req, res) => {
      Sentry.captureException(new Error('handler failure'));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    // SAFETY: a TCP server listening on a host/port returns AddressInfo, not a pipe string.
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Sentry.close(2000);
  });

  it('never sends caller credentials in error or transaction events', async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        ...CREDENTIAL_HEADERS,
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-06-18',
      },
      body: '{}',
    });
    await response.text();
    await Sentry.flush(2000);

    const sent = sentEnvelopes.join('\n');
    // Guard against a vacuous pass: both event types were sent, and they still
    // carry the non-credential request headers.
    expect(sent).toContain('"type":"event"');
    expect(sent).toContain('"type":"transaction"');
    expect(sent).toContain('"mcp-protocol-version":"2025-06-18"');
    for (const value of SECRET_VALUES) {
      expect(sent).not.toContain(value);
    }
  });
});
