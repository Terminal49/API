import type { Terminal49Client } from './client.js';

export function webhookExampleCalls(client: Terminal49Client): void {
  void client.webhookNotifications.examples('container.created');
  void client.getWebhookNotificationExamples('tracking_request.succeeded');
  // @ts-expect-error the API answers 400 without an event
  void client.webhookNotifications.examples();
  // @ts-expect-error only documented webhook events are accepted
  void client.webhookNotifications.examples('container.nope');
}
