/**
 * t49 webhooks <action>
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

type PayloadOptions = {
  payload?: string;
};

function parsePayload(payload: string | undefined): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('Invalid JSON in --payload');
  }
}

export function registerWebhooksCommand(program: Command): void {
  const cmd = program.command('webhooks').description('Manage webhooks');

  cmd
    .command('list')
    .description('List webhooks')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'webhooks.list',
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
          const result = await client.webhooks.list({
            page: options.page,
            pageSize: options.pageSize,
          });
          formatter.output('webhooks.list', result);
        },
      ),
    );

  cmd
    .command('get <id>')
    .description('Get a webhook')
    .action(
      withErrorHandling('webhooks.get', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.webhooks.get(id);
        formatter.output('webhooks.get', result);
      }),
    );

  cmd
    .command('create')
    .description('Create a webhook')
    .requiredOption('--payload <json>', 'Webhook object JSON payload')
    .action(
      withErrorHandling(
        'webhooks.create',
        async (options: PayloadOptions, command: Command) => {
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
          const payload = parsePayload(options.payload);
          const result = await client.webhooks.create(payload);
          formatter.output('webhooks.create', result);
        },
      ),
    );

  cmd
    .command('update <id>')
    .description('Update a webhook')
    .requiredOption('--payload <json>', 'Webhook object JSON payload')
    .action(
      withErrorHandling(
        'webhooks.update',
        async (id: string, options: PayloadOptions, command: Command) => {
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
          const payload = parsePayload(options.payload);
          const result = await client.webhooks.update(id, payload);
          formatter.output('webhooks.update', result);
        },
      ),
    );

  cmd
    .command('delete <id>')
    .description('Delete a webhook')
    .action(
      withErrorHandling(
        'webhooks.delete',
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
          const result = await client.webhooks.delete(id);
          formatter.output('webhooks.delete', result);
        },
      ),
    );

  cmd
    .command('ips')
    .description('List webhook IP ranges')
    .action(
      withErrorHandling('webhooks.ips', async (_options: unknown, command: Command) => {
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
        const result = await client.webhooks.ips();
        formatter.output('webhooks.ips', result);
      }),
    );
}
