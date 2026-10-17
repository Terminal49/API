/**
 * Shared pieces for the webhook read tools. A webhook record carries a
 * signing secret, header values the receiver may use as credentials, and a
 * URL whose host, path or query string can hold a key. Only the fields named
 * here are read, and the URL is reduced to parts that cannot hold a key.
 */

import { z } from 'zod';
import { nullableBoolean, nullableString } from './api-fields.js';
import type { SoftResult } from './soft-results.js';

export const WEBHOOKS_NOT_ENABLED: SoftResult<'FeatureNotEnabled'> = {
  error: 'FeatureNotEnabled',
  message:
    'Webhooks are not enabled for this Terminal49 account. Contact sales@terminal49.com to enable them.',
  alternative:
    'Read the tracking data directly with the container and shipment tools.',
};

/** Shown in place of a URL host label or path segment that may be a key. */
export const REDACTED_SEGMENT = '[redacted]';

/** A webhook can list at most this many header names and events. */
export const MAX_WEBHOOK_LIST_ITEMS = 100;

const MAX_NAME_CHARS = 100;
const MAX_PATH_CHARS = 256;

/**
 * A first path segment kept as-is. Any segment could be a key the receiver
 * checks, so only a short lowercase route word is shown, and every later
 * segment is redacted.
 */
const ROUTE_WORD = /^[a-z]{1,16}(-[a-z]{1,16})*$/;

/**
 * A leftmost host label kept as-is. Some receivers put the key in the
 * subdomain, as in <key>.m.example.net.
 */
const HOST_WORD = /^[a-z-]{1,12}$/;

function describePath(pathname: string) {
  let redacted = false;
  const path = pathname
    .split('/')
    .map((segment, index) => {
      if (segment === '' || (index === 1 && ROUTE_WORD.test(segment))) {
        return segment;
      }
      redacted = true;
      return REDACTED_SEGMENT;
    })
    .join('/');
  if (path.length > MAX_PATH_CHARS) {
    return { path: `/${REDACTED_SEGMENT}`, redacted: true };
  }
  return { path, redacted };
}

function describeHost(parsed: URL) {
  const [first = '', ...rest] = parsed.hostname.split('.');
  const redacted = rest.length > 0 && !HOST_WORD.test(first);
  const hostname = redacted
    ? [REDACTED_SEGMENT, ...rest].join('.')
    : parsed.hostname;
  return {
    host: parsed.port ? `${hostname}:${parsed.port}` : hostname,
    redacted,
  };
}

export const webhookUrlSchema = z.object({
  scheme: z.string().nullable(),
  host: z.string().nullable(),
  path: z.string().nullable(),
  has_query: z.boolean(),
  host_redacted: z.boolean(),
  path_redacted: z.boolean(),
});

export type WebhookUrl = z.infer<typeof webhookUrlSchema>;

/**
 * The parts of a webhook URL that are safe to show. The query string,
 * fragment and any user name or password are dropped. The host keeps its
 * leftmost label only when that is a short lowercase word, and the path keeps
 * only a short lowercase first segment; anything else is replaced with
 * {@link REDACTED_SEGMENT}.
 */
export function describeWebhookUrl(url: string | null): WebhookUrl {
  let parsed: URL | undefined;
  try {
    parsed = url ? new URL(url) : undefined;
  } catch {
    parsed = undefined;
  }
  if (!parsed) {
    return {
      scheme: null,
      host: null,
      path: null,
      has_query: false,
      host_redacted: false,
      path_redacted: false,
    };
  }
  const host = describeHost(parsed);
  const path = describePath(parsed.pathname);
  return {
    scheme: parsed.protocol.replace(/:$/, ''),
    host: host.host,
    path: path.path,
    has_query: parsed.search.length > 1,
    host_redacted: host.redacted,
    path_redacted: path.redacted,
  };
}

export const webhookSummarySchema = z.object({
  id: z.string(),
  active: z.boolean().nullable(),
  events: z.array(z.string()),
  url: webhookUrlSchema,
  has_secret: z.boolean(),
  header_names: z.array(z.string()),
});

export type WebhookSummary = z.infer<typeof webhookSummarySchema>;

const boundedNames = z
  .array(z.unknown())
  .catch([])
  .transform((entries) =>
    entries
      .flatMap((entry) => {
        const parsed = z.string().safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
      .slice(0, MAX_WEBHOOK_LIST_ITEMS)
      .map((entry) => entry.slice(0, MAX_NAME_CHARS)),
  );

const headerNames = z
  .array(z.unknown())
  .nullable()
  .catch(null)
  .transform((entries) =>
    (entries ?? [])
      .map((entry) => z.object({ name: z.string() }).safeParse(entry))
      .flatMap((entry) => (entry.success ? [entry.data.name] : []))
      .slice(0, MAX_WEBHOOK_LIST_ITEMS)
      .map((name) => name.slice(0, MAX_NAME_CHARS)),
  );

/**
 * A webhook record as the API sends it. The secret is read as a boolean and
 * each header as its name, so the parsed record holds neither value.
 */
export const rawWebhookSchema = z.object({
  id: z.string(),
  attributes: z
    .object({
      url: nullableString,
      active: nullableBoolean,
      events: boundedNames,
      secret: z
        .unknown()
        .transform((secret) => z.string().min(1).safeParse(secret).success),
      headers: headerNames,
    })
    .catch({
      url: null,
      active: null,
      events: [],
      secret: false,
      headers: [],
    }),
});

export function toWebhookSummary(
  webhook: z.infer<typeof rawWebhookSchema>,
): WebhookSummary {
  const { attributes } = webhook;
  return {
    id: webhook.id,
    active: attributes.active,
    events: attributes.events,
    url: describeWebhookUrl(attributes.url),
    has_secret: attributes.secret,
    header_names: attributes.headers,
  };
}
