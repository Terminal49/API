/**
 * t49 webhook-notifications <action>
 */

import type { Command } from 'commander';
import { positiveInt } from '../util/input.js';
import { action } from './action.js';

type ListOptions = {
  page?: number;
  pageSize?: number;
};

type ExamplesOptions = {
  event?: string;
};

function localOptions<T>(command: Command): T {
  return command.opts() as T;
}

export function registerWebhookNotificationsCommand(program: Command): void {
  const cmd = program
    .command('webhook-notifications')
    .alias('webhook_notifications')
    .description('List webhook notification events');

  const listCommand = cmd
    .command('list')
    .description('List webhook notifications')
    .option('--page <number>', 'Page number', positiveInt('--page'))
    .option('--page-size <number>', 'Page size', positiveInt('--page-size'));
  listCommand.action(
    action('webhook-notifications.list', async ({ client, globals }) => {
      const options = localOptions<ListOptions>(listCommand);
      return client.webhookNotifications.list({
        page: options.page,
        pageSize: options.pageSize,
        format: globals.format,
      });
    }),
  );

  cmd
    .command('get <id>')
    .description('Get a webhook notification')
    .action(
      action('webhook-notifications.get', async ({ client, globals }, id: string) =>
        client.webhookNotifications.get(id, { format: globals.format }),
      ),
    );

  const examplesCommand = cmd
    .command('examples')
    .description('Get webhook payload examples')
    .option('--event <event>', 'Filter by event type');
  examplesCommand.action(
    action('webhook-notifications.examples', async ({ client, globals }) => {
      const options = localOptions<ExamplesOptions>(examplesCommand);
      return client.webhookNotifications.examples(options.event, {
        format: globals.format,
      });
    }),
  );
}
