/**
 * t49 custom-field-definitions <action>
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

export function registerCustomFieldDefinitionsCommand(program: Command): void {
  const cmd = program
    .command('custom-field-definitions')
    .description('Manage custom field definitions');

  cmd
    .command('list')
    .description('List custom field definitions')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'custom-field-definitions.list',
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
          const result = await client.customFieldDefinitions.list({
            page: options.page,
            pageSize: options.pageSize,
          });
          formatter.output('custom-field-definitions.list', result);
        },
      ),
    );

  cmd
    .command('get <id>')
    .description('Get a custom field definition')
    .action(
      withErrorHandling(
        'custom-field-definitions.get',
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
          const result = await client.customFieldDefinitions.get(id);
          formatter.output('custom-field-definitions.get', result);
        },
      ),
    );

  cmd
    .command('create')
    .description('Create a custom field definition')
    .requiredOption('--payload <json>', 'Custom field definition JSON payload')
    .action(
      withErrorHandling(
        'custom-field-definitions.create',
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
          const result = await client.customFieldDefinitions.create(
            parsePayload(options.payload),
          );
          formatter.output('custom-field-definitions.create', result);
        },
      ),
    );

  cmd
    .command('update <id>')
    .description('Update a custom field definition')
    .requiredOption('--payload <json>', 'Custom field definition JSON payload')
    .action(
      withErrorHandling(
        'custom-field-definitions.update',
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
          const result = await client.customFieldDefinitions.update(
            id,
            parsePayload(options.payload),
          );
          formatter.output('custom-field-definitions.update', result);
        },
      ),
    );

  cmd
    .command('delete <id>')
    .description('Delete a custom field definition')
    .action(
      withErrorHandling(
        'custom-field-definitions.delete',
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
          const result = await client.customFieldDefinitions.delete(id);
          formatter.output('custom-field-definitions.delete', result);
        },
      ),
    );
}
