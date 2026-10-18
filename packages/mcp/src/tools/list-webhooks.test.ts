import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  eventCatalogBody,
  rawWebhook,
  SECOND_WEBHOOK_ID,
  WEBHOOK_ID,
  WEBHOOK_SENTINELS,
  webhookListBody,
  webhookSummary,
} from '../test/webhook-fixtures.js';
import {
  executeListWebhooks,
  listWebhooksOutputSchema,
} from './list-webhooks.js';
import { describeWebhookUrl, WEBHOOKS_NOT_ENABLED } from './webhooks.js';

function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value);
  for (const sentinel of WEBHOOK_SENTINELS) {
    expect(text).not.toContain(sentinel);
  }
}

describe('list_webhooks', () => {
  it('lists webhooks without their secret, header values or URL keys', async () => {
    const { client, requests } = fakeApiClient({
      'GET /webhooks': { body: webhookListBody },
    });

    const result = await executeListWebhooks({}, client);

    expect(result).toEqual({
      webhooks: [webhookSummary(), webhookSummary(SECOND_WEBHOOK_ID)],
      links: { self: 'https://api.test/v2/webhooks?page%5Bnumber%5D=1' },
      meta: { size: 2, total: 2 },
    });
    expect(listWebhooksOutputSchema.parse(result)).toEqual(result);
    expectNoSecrets(result);
    expect(requests[0]?.query.get('page[size]')).toBe('25');
  });

  it('reads one webhook by id and adds the event catalog on request', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /webhooks/${WEBHOOK_ID}`]: { body: { data: rawWebhook() } },
      'GET /webhooks/events': { body: eventCatalogBody },
    });

    const result = await executeListWebhooks(
      { webhook_id: WEBHOOK_ID, include_event_catalog: true },
      client,
    );

    expect(result).toEqual({
      webhooks: [webhookSummary()],
      event_catalog: [
        {
          category: 'Tracking Request Events',
          events: [
            {
              name: 'tracking_request.succeeded',
              description:
                'Shipment created and linked to the tracking request.',
            },
          ],
        },
      ],
    });
    expect(listWebhooksOutputSchema.parse(result)).toEqual(result);
    expectNoSecrets(result);
    expect(requests.map((request) => request.path).sort()).toEqual([
      `/webhooks/${WEBHOOK_ID}`,
      '/webhooks/events',
    ]);
  });

  it('keeps the valid catalog entries when some are malformed', async () => {
    const { client } = fakeApiClient({
      'GET /webhooks': { body: { data: [] } },
      'GET /webhooks/events': {
        body: {
          data: [
            {
              attributes: {
                name: 'Container Events',
                events: [
                  { name: 'a', description: 'b' },
                  { name: 'c', description: null },
                  { description: 'no name' },
                ],
              },
            },
            { attributes: { events: [] } },
          ],
        },
      },
    });

    const result = await executeListWebhooks(
      { include_event_catalog: true },
      client,
    );

    expect(result).toMatchObject({
      event_catalog: [
        {
          category: 'Container Events',
          events: [
            { name: 'a', description: 'b' },
            { name: 'c', description: null },
          ],
        },
      ],
    });
    expect(listWebhooksOutputSchema.parse(result)).toEqual(result);
  });

  it('passes the page through', async () => {
    const { client, requests } = fakeApiClient({
      'GET /webhooks': { body: { data: [] } },
    });

    await executeListWebhooks({ page: 3, page_size: 5 }, client);

    expect(requests[0]?.query.get('page[number]')).toBe('3');
    expect(requests[0]?.query.get('page[size]')).toBe('5');
  });

  it('reports a webhook with no secret, headers or valid URL', async () => {
    const { client } = fakeApiClient({
      'GET /webhooks': {
        body: {
          data: [
            {
              id: WEBHOOK_ID,
              type: 'webhook',
              attributes: {
                url: 'not a url',
                active: false,
                events: [],
                secret: '',
                headers: null,
              },
            },
          ],
        },
      },
    });

    const result = await executeListWebhooks({}, client);

    expect(result).toMatchObject({
      webhooks: [
        {
          id: WEBHOOK_ID,
          active: false,
          url: {
            scheme: null,
            host: null,
            path: null,
            has_query: false,
            host_redacted: false,
            path_redacted: false,
          },
          has_secret: false,
          header_names: [],
        },
      ],
    });
  });

  it('returns FeatureNotEnabled when webhooks are gated', async () => {
    const { client } = fakeApiClient({
      'GET /webhooks': {
        status: 403,
        body: { errors: [{ status: '403', detail: 'Feature not enabled' }] },
      },
    });

    const result = await executeListWebhooks({}, client);

    expect(result).toEqual(WEBHOOKS_NOT_ENABLED);
    expect(listWebhooksOutputSchema.safeParse(result).success).toBe(true);
  });
});

describe('describeWebhookUrl', () => {
  it('redacts every path segment and every host label left of the domain', () => {
    expect(
      describeWebhookUrl(
        'https://hooks.example.com/services/T0123/B0456/abcdEFGHijklMNOPqrstUVWX',
      ),
    ).toEqual({
      scheme: 'https',
      host: '[redacted].example.com',
      path: '/[redacted]/[redacted]/[redacted]/[redacted]',
      has_query: false,
      host_redacted: true,
      path_redacted: true,
    });
  });

  it.each([
    ['a short lowercase word', '/secret'],
    ['a hyphenated lowercase word', '/shared-secret'],
    ['an sk_live_ key', '/sk_live_abcdefghijk'],
    ['a key with digits', '/k3x9mqpzt7wvbnra'],
  ])('redacts %s as the first segment', (_label, path) => {
    expect(describeWebhookUrl(`https://example.com${path}`)).toMatchObject({
      path: '/[redacted]',
      path_redacted: true,
    });
  });

  it('keeps the slashes of a redacted path', () => {
    expect(
      describeWebhookUrl(
        'https://hooks.zapier.com/hooks/catch/1234567/3abcdef/',
      ),
    ).toMatchObject({
      path: '/[redacted]/[redacted]/[redacted]/[redacted]/',
      path_redacted: true,
    });
  });

  it.each([
    [
      'a subdomain key',
      'https://eo1a2b3c4d5e6f7.m.pipedream.net/',
      '[redacted].[redacted].pipedream.net',
    ],
    [
      'a short lowercase subdomain',
      'https://secret.example.com/',
      '[redacted].example.com',
    ],
    [
      'a key in a later label',
      'https://hooks.sharedsecret.example.com/',
      '[redacted].[redacted].example.com',
    ],
    [
      'an IP address',
      'https://10.1.2.3:8443/',
      '[redacted].[redacted].2.3:8443',
    ],
  ])('redacts %s in the host', (_label, url, host) => {
    const described = describeWebhookUrl(url);
    expect(described).toMatchObject({ host, host_redacted: true });
  });

  it('keeps a two-label host and an empty path, and reports no query', () => {
    expect(describeWebhookUrl('https://example.com/')).toEqual({
      scheme: 'https',
      host: 'example.com',
      path: '/',
      has_query: false,
      host_redacted: false,
      path_redacted: false,
    });
  });

  it('drops the user name, password, query string and fragment', () => {
    const described = describeWebhookUrl(
      'https://name:password@example.com/in?key=value#part',
    );

    expect(described).toEqual({
      scheme: 'https',
      host: 'example.com',
      path: '/[redacted]',
      has_query: true,
      host_redacted: false,
      path_redacted: true,
    });
    expect(JSON.stringify(described)).not.toMatch(
      /name|password|key|value|part/,
    );
  });

  it('describes a missing or unparseable URL as unknown', () => {
    const unknown = {
      scheme: null,
      host: null,
      path: null,
      has_query: false,
      host_redacted: false,
      path_redacted: false,
    };
    expect(describeWebhookUrl(null)).toEqual(unknown);
    expect(describeWebhookUrl('hooks.example.com/in?key=1')).toEqual(unknown);
  });
});
