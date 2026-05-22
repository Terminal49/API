/**
 * t49 webhook-notifications <action>
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

export function registerWebhookNotificationsCommand(program: Command): void {
  const cmd = program
    .command('webhook-notifications')
    .alias('webhook_notifications')
    .description('List webhook notification events');

  cmd
    .command('list')
    .description('List webhook notifications')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'webhook-notifications.list',
        async (
          options: { page?: number; pageSize?: number },
          command: Command,
        ) => {
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: global.json,
            table: global.table,
            compact: global.compact,
            fields: global.fields,
          });
          const client = await createClient({
            token: global.token,
            baseUrl: global.baseUrl,
            format: global.format as 'raw' | 'mapped' | 'both',
            maxRetries: global.maxRetries,
          });
          const result = await client.webhookNotifications.list({
            page: options.page,
            pageSize: options.pageSize,
          });
          formatter.output('webhook-notifications.list', result);
        },
      ),
    );

  cmd
    .command('get <id>')
    .description('Get a webhook notification')
    .action(
      withErrorHandling(
        'webhook-notifications.get',
        async (id: string, _options: unknown, command: Command) => {
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: global.json,
            table: global.table,
            compact: global.compact,
            fields: global.fields,
          });
          const client = await createClient({
            token: global.token,
            baseUrl: global.baseUrl,
            format: global.format as 'raw' | 'mapped' | 'both',
            maxRetries: global.maxRetries,
          });
          const result = await client.webhookNotifications.get(id);
          formatter.output('webhook-notifications.get', result);
        },
      ),
    );

  cmd
    .command('examples')
    .description('Get webhook payload examples')
    .option('--event <event>', 'Filter by event type')
    .action(
      withErrorHandling(
        'webhook-notifications.examples',
        async (options: { event?: string }, command: Command) => {
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: global.json,
            table: global.table,
            compact: global.compact,
            fields: global.fields,
          });
          const client = await createClient({
            token: global.token,
            baseUrl: global.baseUrl,
            format: global.format as 'raw' | 'mapped' | 'both',
            maxRetries: global.maxRetries,
          });
          const result = await client.webhookNotifications.examples(options.event);
          formatter.output('webhook-notifications.examples', result);
        },
      ),
    );
}
