import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  NOTIFICATION_ID,
  notificationListBody,
  notificationRow,
  rawNotification,
  rawWebhook,
  WEBHOOK_SENTINELS,
} from '../test/webhook-fixtures.js';
import {
  executeListWebhookNotifications,
  listWebhookNotificationsOutputSchema,
} from './list-webhook-notifications.js';
import { WEBHOOKS_NOT_ENABLED } from './webhooks.js';

function expectNoSecrets(value: unknown) {
  const text = JSON.stringify(value);
  for (const sentinel of WEBHOOK_SENTINELS) {
    expect(text).not.toContain(sentinel);
  }
}

describe('list_webhook_notifications', () => {
  it('lists notifications without asking for includes or returning payloads', async () => {
    const { client, requests } = fakeApiClient({
      'GET /webhook_notifications': { body: notificationListBody },
    });

    const result = await executeListWebhookNotifications({}, client);

    expect(result).toEqual({
      notifications: [notificationRow()],
      links: { self: 'https://api.test/v2/webhook_notifications' },
      meta: { size: 1, total: 1 },
    });
    expect(listWebhookNotificationsOutputSchema.parse(result)).toEqual(result);
    expectNoSecrets(result);
    expect(requests[0]?.query.has('include')).toBe(false);
    expect(requests[0]?.query.get('page[size]')).toBe('25');
  });

  it('reads one notification by id', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /webhook_notifications/${NOTIFICATION_ID}`]: {
        body: { data: rawNotification(), included: [rawWebhook()] },
      },
    });

    const result = await executeListWebhookNotifications(
      { notification_id: NOTIFICATION_ID },
      client,
    );

    expect(result).toEqual({ notifications: [notificationRow()] });
    expectNoSecrets(result);
    expect(requests[0]?.query.has('include')).toBe(false);
  });

  it('passes the page through and skips malformed rows', async () => {
    const { client, requests } = fakeApiClient({
      'GET /webhook_notifications': {
        body: { data: [{ type: 'webhook_notification' }, rawNotification()] },
      },
    });

    const result = await executeListWebhookNotifications(
      { page: 2, page_size: 10 },
      client,
    );

    expect(result).toMatchObject({ notifications: [notificationRow()] });
    expect(requests[0]?.query.get('page[number]')).toBe('2');
    expect(requests[0]?.query.get('page[size]')).toBe('10');
  });

  it.each([
    ['no data', { meta: { total: 0 } }],
    ['data that is not a list', { data: { id: NOTIFICATION_ID } }],
    ['links that are not an object', { data: [], links: 'next' }],
    ['meta that is not an object', { data: [], meta: 1 }],
  ])(
    'fails instead of reporting no notifications for a list with %s',
    async (_case, body) => {
      const { client } = fakeApiClient({
        'GET /webhook_notifications': { body },
      });

      await expect(
        executeListWebhookNotifications({}, client),
      ).rejects.toThrow();
    },
  );

  it('fails instead of reporting an empty notification when its attributes are not an object', async () => {
    const { client } = fakeApiClient({
      [`GET /webhook_notifications/${NOTIFICATION_ID}`]: {
        body: { data: { id: NOTIFICATION_ID, type: 'webhook_notification' } },
      },
    });

    await expect(
      executeListWebhookNotifications(
        { notification_id: NOTIFICATION_ID },
        client,
      ),
    ).rejects.toThrow();
  });

  it('reads a notification with no relationships as null links', async () => {
    const { client } = fakeApiClient({
      'GET /webhook_notifications': {
        body: {
          data: [
            {
              id: NOTIFICATION_ID,
              type: 'webhook_notification',
              attributes: { event: 'container.updated' },
            },
          ],
        },
      },
    });

    const result = await executeListWebhookNotifications({}, client);

    expect(result).toMatchObject({
      notifications: [
        {
          id: NOTIFICATION_ID,
          event: 'container.updated',
          delivery_status: null,
          webhook_id: null,
          reference: null,
        },
      ],
    });
  });

  it('returns FeatureNotEnabled when webhooks are gated', async () => {
    const { client } = fakeApiClient({
      'GET /webhook_notifications': {
        status: 403,
        body: { errors: [{ status: '403', detail: 'Feature not enabled' }] },
      },
    });

    expect(await executeListWebhookNotifications({}, client)).toEqual(
      WEBHOOKS_NOT_ENABLED,
    );
  });
});
