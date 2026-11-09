/**
 * t49 webhook-notifications <action>
 */

import type { WebhookEvent } from '@terminal49/sdk';
import type { Command } from 'commander';
import { action, defineList } from './action.js';

type ListOptions = {
  page?: number;
  pageSize?: number;
};

type ExamplesOptions = {
  /** Validated by the API, which answers 400 for an unknown event. */
  event: WebhookEvent;
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
    .description('List webhook notifications');
  defineList(listCommand, {
    name: 'webhook-notifications.list',
    paginated: true,
    run: ({ client, format }) => {
      const options = localOptions<ListOptions>(listCommand);
      return client.webhookNotifications.list({
        page: options.page,
        pageSize: options.pageSize,
        format,
      });
    },
  });

  cmd
    .command('get <id>')
    .description('Get a webhook notification')
    .action(
      action(
        'webhook-notifications.get',
        async ({ client, globals }, id: string) =>
          client.webhookNotifications.get(id, { format: globals.format }),
      ),
    );

  const examplesCommand = cmd
    .command('examples')
    .description('Get the example webhook payload for an event')
    .requiredOption(
      '--event <event>',
      'Webhook event name, for example container.created',
    );
  examplesCommand.action(
    action('webhook-notifications.examples', async ({ client, globals }) => {
      const options = localOptions<ExamplesOptions>(examplesCommand);
      return client.webhookNotifications.examples(options.event, {
        format: globals.format,
      });
    }),
  );
}
