/**
 * MCP tools for Webhooks API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapDocument, mapCollection } from '../../jsonapi/mappers/index.js';
import type { Webhook, WebhookNotification } from '../../domain/index.js';

export interface CreateWebhookArgs {
  url: string;
  eventTypes: string[];
  secret?: string;
}

export interface UpdateWebhookArgs {
  id: string;
  url?: string;
  eventTypes?: string[];
  secret?: string;
  active?: boolean;
}

export interface DeleteWebhookArgs {
  id: string;
}

export interface GetWebhookArgs {
  id: string;
}

export interface ListWebhooksArgs {
  page?: number;
  pageSize?: number;
}

export interface GetWebhookIpsArgs {}

export interface ListWebhookNotificationsArgs {
  page?: number;
  pageSize?: number;
}

export interface GetWebhookNotificationArgs {
  id: string;
}

export interface GetWebhookExamplesArgs {}

/**
 * Create a new webhook
 */
export async function createWebhook(args: CreateWebhookArgs): Promise<Webhook> {
  const body = {
    data: {
      type: 'webhook',
      attributes: {
        url: args.url,
        events: args.eventTypes,
        active: true,
        ...(args.secret && { secret: args.secret }),
      },
    },
  };

  const data = await makeRequest('/webhooks', {
    method: 'POST',
    body,
  });

  return mapDocument<Webhook>(data);
}

/**
 * Update an existing webhook
 */
export async function updateWebhook(args: UpdateWebhookArgs): Promise<Webhook> {
  const body = {
    data: {
      type: 'webhook',
      attributes: {
        ...(args.url && { url: args.url }),
        ...(args.eventTypes && { events: args.eventTypes }),
        ...(args.secret !== undefined && { secret: args.secret }),
        ...(args.active !== undefined && { active: args.active }),
      },
    },
  };

  const data = await makeRequest(`/webhooks/${args.id}`, {
    method: 'PATCH',
    body,
  });

  return mapDocument<Webhook>(data);
}

/**
 * Delete a webhook
 */
export async function deleteWebhook(args: DeleteWebhookArgs): Promise<void> {
  await makeRequest(`/webhooks/${args.id}`, {
    method: 'DELETE',
  });
}

/**
 * Get a webhook by ID
 */
export async function getWebhook(args: GetWebhookArgs): Promise<Webhook> {
  const data = await makeRequest(`/webhooks/${args.id}`);
  return mapDocument<Webhook>(data);
}

/**
 * List all webhooks
 */
export async function listWebhooks(args: ListWebhooksArgs = {}): Promise<Webhook[]> {
  const query: Record<string, string | number> = {};

  if (args.page) query['page[number]'] = args.page;
  if (args.pageSize) query['page[size]'] = args.pageSize;

  const data = await makeRequest('/webhooks', { query });
  return mapCollection<Webhook>(data);
}

/**
 * Get webhook IP addresses for allowlisting
 */
export async function getWebhookIps(_args: GetWebhookIpsArgs = {}): Promise<{ ips: string[] }> {
  return await makeRequest('/webhooks/ips');
}

/**
 * List webhook notifications
 */
export async function listWebhookNotifications(args: ListWebhookNotificationsArgs = {}): Promise<WebhookNotification[]> {
  const query: Record<string, string | number> = {};

  if (args.page) query['page[number]'] = args.page;
  if (args.pageSize) query['page[size]'] = args.pageSize;

  const data = await makeRequest('/webhook_notifications', { query });
  return mapCollection<WebhookNotification>(data);
}

/**
 * Get a webhook notification by ID
 */
export async function getWebhookNotification(args: GetWebhookNotificationArgs): Promise<WebhookNotification> {
  const data = await makeRequest(`/webhook_notifications/${args.id}`);
  return mapDocument<WebhookNotification>(data);
}

/**
 * Get webhook notification examples
 */
export async function getWebhookExamples(_args: GetWebhookExamplesArgs = {}): Promise<unknown> {
  return await makeRequest('/webhook_notifications/examples');
}
