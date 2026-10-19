/**
 * list_webhooks tool
 * Shows which webhooks the account has and which events each one receives,
 * so a developer can check an integration. The output never carries a
 * webhook's secret, header values, or URL query string.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { nullableString, stringLinks } from './api-fields.js';
import { isFeatureNotEnabled, type SoftResult } from './soft-results.js';
import {
  rawWebhookSchema,
  toWebhookSummary,
  WEBHOOKS_NOT_ENABLED,
  type WebhookSummary,
  webhookSummarySchema,
} from './webhooks.js';

const MAX_PAGE_SIZE = 25;

export const listWebhooksInputSchema = z.object({
  webhook_id: z
    .string()
    .uuid()
    .optional()
    .describe(
      'Read one webhook by its Terminal49 ID (UUID format) instead of listing them. Identifier only; never pass conversation text.',
    ),
  include_event_catalog: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Also return event_catalog: every event a webhook can subscribe to, by category, with a description. Default: false',
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

export type ListWebhooksArgs = z.input<typeof listWebhooksInputSchema>;

const catalogEventSchema = z.object({
  name: z.string(),
  description: nullableString,
});

const eventCategorySchema = z.object({
  category: z.string(),
  events: z.array(catalogEventSchema),
});

type EventCategory = z.infer<typeof eventCategorySchema>;

const listWebhooksSchema = z.object({
  webhooks: z.array(webhookSummarySchema),
  links: z.record(z.string(), z.string()).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  event_catalog: z.array(eventCategorySchema).optional(),
});

export const listWebhooksOutputSchema = listWebhooksSchema.partial().extend({
  error: z.string().optional(),
  message: z.string().optional(),
  alternative: z.string().optional(),
});

export type ListWebhooksResult = z.infer<typeof listWebhooksSchema>;

const rawListSchema = z.object({
  data: z.array(z.unknown()),
  links: z.record(z.string(), z.unknown()).catch({}),
  meta: z.record(z.string(), z.unknown()).catch({}),
});

const rawSingleSchema = z.object({ data: rawWebhookSchema });

const rawCatalogSchema = z
  .object({ data: z.array(z.unknown()).catch([]) })
  .catch({ data: [] });

const rawCategorySchema = z.object({
  attributes: z.object({
    name: z.string(),
    events: z.array(z.unknown()).catch([]),
  }),
});

/** Keeps every well-formed category and event, and drops only the malformed ones. */
function toCatalog(catalog: z.infer<typeof rawCatalogSchema>): EventCategory[] {
  return catalog.data.flatMap((record) => {
    const category = rawCategorySchema.safeParse(record);
    if (!category.success) return [];
    const { name, events } = category.data.attributes;
    return [
      {
        category: name,
        events: events.flatMap((event) => {
          const parsedEvent = catalogEventSchema.safeParse(event);
          return parsedEvent.success ? [parsedEvent.data] : [];
        }),
      },
    ];
  });
}

function toRows(records: readonly unknown[]): WebhookSummary[] {
  return records.flatMap((record) => {
    const parsed = rawWebhookSchema.safeParse(record);
    return parsed.success ? [toWebhookSummary(parsed.data)] : [];
  });
}

export async function executeListWebhooks(
  args: ListWebhooksArgs,
  client: Terminal49Client,
): Promise<ListWebhooksResult | SoftResult<'FeatureNotEnabled'>> {
  const input = listWebhooksInputSchema.parse(args);
  let raw: unknown;
  let catalog: unknown;
  try {
    [raw, catalog] = await Promise.all([
      input.webhook_id
        ? client.webhooks.get(input.webhook_id, { format: 'raw' })
        : client.webhooks.list({
            format: 'raw',
            page: input.page,
            pageSize: input.page_size,
          }),
      input.include_event_catalog
        ? client.webhooks.events({ format: 'raw' })
        : Promise.resolve(undefined),
    ]);
  } catch (error) {
    if (isFeatureNotEnabled(error)) return { ...WEBHOOKS_NOT_ENABLED };
    throw error;
  }

  let result: ListWebhooksResult;
  if (input.webhook_id) {
    result = { webhooks: [toWebhookSummary(rawSingleSchema.parse(raw).data)] };
  } else {
    const list = rawListSchema.parse(raw);
    result = {
      webhooks: toRows(list.data),
      links: stringLinks(list.links),
      meta: list.meta,
    };
  }
  if (catalog !== undefined) {
    result.event_catalog = toCatalog(rawCatalogSchema.parse(catalog));
  }
  return result;
}
