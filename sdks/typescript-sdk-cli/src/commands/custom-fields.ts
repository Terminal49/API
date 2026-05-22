/**
 * t49 custom-fields <action>
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

export function registerCustomFieldsCommand(program: Command): void {
  const cmd = program.command('custom-fields').description('Manage custom fields');

  cmd
    .command('list')
    .description('List custom field assignments')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'custom-fields.list',
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
          const result = await client.customFields.list({
            page: options.page,
            pageSize: options.pageSize,
          });
          formatter.output('custom-fields.list', result);
        },
      ),
    );

  cmd
    .command('get <id>')
    .description('Get a custom field')
    .action(
      withErrorHandling(
        'custom-fields.get',
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
          const result = await client.customFields.get(id);
          formatter.output('custom-fields.get', result);
        },
      ),
    );

  cmd
    .command('create')
    .description('Create a custom field assignment')
    .requiredOption('--payload <json>', 'Custom field JSON payload')
    .action(
      withErrorHandling(
        'custom-fields.create',
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
          const result = await client.customFields.create(parsePayload(options.payload));
          formatter.output('custom-fields.create', result);
        },
      ),
    );

  cmd
    .command('update <id>')
    .description('Update a custom field assignment')
    .requiredOption('--payload <json>', 'Custom field JSON payload')
    .action(
      withErrorHandling(
        'custom-fields.update',
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
          const result = await client.customFields.update(id, parsePayload(options.payload));
          formatter.output('custom-fields.update', result);
        },
      ),
    );

  cmd
    .command('delete <id>')
    .description('Delete a custom field assignment')
    .action(
      withErrorHandling(
        'custom-fields.delete',
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
          const result = await client.customFields.delete(id);
          formatter.output('custom-fields.delete', result);
        },
      ),
    );
}
