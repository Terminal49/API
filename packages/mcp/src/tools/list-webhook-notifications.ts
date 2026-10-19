/**
 * list_webhook_notifications tool
 * Shows the webhook notifications Terminal49 created and whether each was
 * delivered, so a developer can debug an integration. It never asks the API
 * to include the webhook, whose record carries the signing secret, and it
 * reads no payload.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { nullableString, relationshipRef, stringLinks } from './api-fields.js';
import { isFeatureNotEnabled, type SoftResult } from './soft-results.js';
import { WEBHOOKS_NOT_ENABLED } from './webhooks.js';

const MAX_PAGE_SIZE = 25;

export const listWebhookNotificationsInputSchema = z.object({
  notification_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Read one notification by its Terminal49 ID (UUID format) instead of listing them. Identifier only; never pass conversation text.',
    ),
  page: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Page number (1-based)'),
  page_size: z
    .number()
    .int()
    .positive()
    .max(MAX_PAGE_SIZE)
    .optional()
    .default(MAX_PAGE_SIZE)
    .describe(`Page size (default 25; maximum ${MAX_PAGE_SIZE})`),
});

export type ListWebhookNotificationsArgs = z.input<
  typeof listWebhookNotificationsInputSchema
>;

const notificationRowSchema = z.object({
  id: z.string(),
  event: z.string().nullable(),
  delivery_status: z.string().nullable(),
  created_at: z.string().nullable(),
  webhook_id: z.string().nullable(),
  reference: z.object({ type: z.string(), id: z.string() }).nullable(),
});

type NotificationRow = z.infer<typeof notificationRowSchema>;

const listWebhookNotificationsSchema = z.object({
  notifications: z.array(notificationRowSchema),
  links: z.record(z.string(), z.string()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const listWebhookNotificationsOutputSchema =
  listWebhookNotificationsSchema.partial().extend({
    error: z.string().optional(),
    message: z.string().optional(),
    alternative: z.string().optional(),
  });

export type ListWebhookNotificationsResult = z.infer<
  typeof listWebhookNotificationsSchema
>;

const MAX_EVENT_CHARS = 100;

const rawNotificationSchema = z.object({
  id: z.string(),
  attributes: z
    .object({
      event: nullableString,
      delivery_status: nullableString,
      created_at: nullableString,
    })
    .catch({ event: null, delivery_status: null, created_at: null }),
  relationships: z
    .object({ webhook: relationshipRef, reference_object: relationshipRef })
    .catch({ webhook: null, reference_object: null }),
});

function toRow(record: z.infer<typeof rawNotificationSchema>): NotificationRow {
  const reference = record.relationships.reference_object?.data ?? null;
  return {
    id: record.id,
    event: record.attributes.event?.slice(0, MAX_EVENT_CHARS) ?? null,
    delivery_status: record.attributes.delivery_status,
    created_at: record.attributes.created_at,
    webhook_id: record.relationships.webhook?.data?.id ?? null,
    reference: reference ? { type: reference.type, id: reference.id } : null,
  };
}

const rawListSchema = z.object({
  data: z.array(z.unknown()),
  links: z.record(z.string(), z.unknown()).catch({}),
  meta: z.record(z.string(), z.unknown()).catch({}),
});

const rawSingleSchema = z.object({ data: rawNotificationSchema });

export async function executeListWebhookNotifications(
  args: ListWebhookNotificationsArgs,
  client: Terminal49Client,
): Promise<ListWebhookNotificationsResult | SoftResult<'FeatureNotEnabled'>> {
  const input = listWebhookNotificationsInputSchema.parse(args);
  let raw: unknown;
  try {
    raw = input.notification_id
      ? await client.webhookNotifications.get(input.notification_id, {
          format: 'raw',
        })
      : await client.webhookNotifications.list({
          format: 'raw',
          page: input.page,
          pageSize: input.page_size,
        });
  } catch (error) {
    if (isFeatureNotEnabled(error)) return { ...WEBHOOKS_NOT_ENABLED };
    throw error;
  }

  if (input.notification_id) {
    return { notifications: [toRow(rawSingleSchema.parse(raw).data)] };
  }
  const list = rawListSchema.parse(raw);
  return {
    notifications: list.data.flatMap((record) => {
      const parsed = rawNotificationSchema.safeParse(record);
      return parsed.success ? [toRow(parsed.data)] : [];
    }),
    links: stringLinks(list.links),
    meta: list.meta,
  };
}
