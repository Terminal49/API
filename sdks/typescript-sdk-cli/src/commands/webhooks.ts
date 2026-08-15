/**
 * t49 webhooks <action>
 */

import type { Command } from 'commander';
import {
  parseJsonObjectPayload,
  positiveInt,
  splitCommaList,
} from '../util/input.js';
import { action } from './action.js';

type PayloadOptions = {
  active?: boolean;
  events?: string;
  page?: number;
  pageSize?: number;
  payload?: Record<string, unknown>;
  url?: string;
};

function localOptions<T>(command: Command): T {
  return command.opts() as T;
}

function webhookPayload(options: PayloadOptions): Record<string, unknown> {
  if (options.payload) return options.payload;

  const attributes: Record<string, unknown> = {};
  if (options.url !== undefined) attributes.url = options.url;
  if (options.events !== undefined)
    attributes.events = splitCommaList(options.events);
  if (options.active !== undefined) attributes.active = options.active;

  return {
    data: {
      type: 'webhook',
      attributes,
    },
  };
}

export function registerWebhooksCommand(program: Command): void {
  const cmd = program.command('webhooks').description('Manage webhooks');

  const listCommand = cmd
    .command('list')
    .description('List webhooks')
    .option('--page <number>', 'Page number', positiveInt('--page'))
    .option('--page-size <number>', 'Page size', positiveInt('--page-size'));
  listCommand.action(
    action('webhooks.list', async ({ client, globals }) => {
      const options = localOptions<PayloadOptions>(listCommand);
      return client.webhooks.list({
        page: options.page,
        pageSize: options.pageSize,
        format: globals.format,
      });
    }),
  );

  cmd
    .command('get <id>')
    .description('Get a webhook')
    .action(
      action('webhooks.get', async ({ client, globals }, id: string) =>
        client.webhooks.get(id, { format: globals.format }),
      ),
    );

  const createCommand = cmd
    .command('create')
    .description('Create a webhook')
    .option(
      '--payload <json>',
      'Webhook object JSON payload',
      parseJsonObjectPayload,
    )
    .option('--url <url>', 'Webhook endpoint URL')
    .option('--events <csv>', 'Comma-separated webhook event names')
    .option('--active', 'Create an active webhook')
    .option('--no-active', 'Create an inactive webhook');
  createCommand.action(
    action('webhooks.create', async ({ client, globals }) => {
      const options = localOptions<PayloadOptions>(createCommand);
      return client.webhooks.create(webhookPayload(options), {
        format: globals.format,
      });
    }),
  );

  const updateCommand = cmd
    .command('update <id>')
    .description('Update a webhook')
    .requiredOption(
      '--payload <json>',
      'Webhook object JSON payload',
      parseJsonObjectPayload,
    );
  updateCommand.action(
    action('webhooks.update', async ({ client, globals }, id: string) => {
      const options = localOptions<PayloadOptions>(updateCommand);
      return client.webhooks.update(id, options.payload ?? {}, {
        format: globals.format,
      });
    }),
  );

  cmd
    .command('delete <id>')
    .description('Delete a webhook')
    .action(
      action('webhooks.delete', async ({ client, globals }, id: string) =>
        client.webhooks.delete(id, { format: globals.format }),
      ),
    );

  cmd
    .command('ips')
    .description('List webhook IP ranges')
    .action(
      action('webhooks.ips', async ({ client, globals }) =>
        client.webhooks.ips({ format: globals.format }),
      ),
    );
}
