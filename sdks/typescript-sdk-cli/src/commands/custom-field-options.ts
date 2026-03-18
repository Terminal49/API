/**
 * t49 custom-field-options <action>
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

export function registerCustomFieldOptionsCommand(program: Command): void {
  const cmd = program
    .command('custom-field-options')
    .description('Manage options for a custom field definition');

  cmd
    .command('list <definition-id>')
    .description('List options for a custom field definition')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'custom-field-options.list',
        async (
          definitionId: string,
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
          const result = await client.customFieldOptions.list(definitionId, {
            page: options.page,
            pageSize: options.pageSize,
          });
          formatter.output('custom-field-options.list', result);
        },
      ),
    );

  cmd
    .command('get <definition-id> <option-id>')
    .description('Get a custom field option')
    .action(
      withErrorHandling(
        'custom-field-options.get',
        async (
          definitionId: string,
          optionId: string,
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
          const result = await client.customFieldOptions.get(definitionId, optionId);
          formatter.output('custom-field-options.get', result);
        },
      ),
    );

  cmd
    .command('create <definition-id>')
    .description('Create a custom field option')
    .requiredOption('--payload <json>', 'Option object JSON payload')
    .action(
      withErrorHandling(
        'custom-field-options.create',
        async (
          definitionId: string,
          options: PayloadOptions,
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
          const payload = parsePayload(options.payload);
          const result = await client.customFieldOptions.create(definitionId, payload);
          formatter.output('custom-field-options.create', result);
        },
      ),
    );

  cmd
    .command('update <definition-id> <option-id>')
    .description('Update a custom field option')
    .requiredOption('--payload <json>', 'Option object JSON payload')
    .action(
      withErrorHandling(
        'custom-field-options.update',
        async (
          definitionId: string,
          optionId: string,
          options: PayloadOptions,
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
          const payload = parsePayload(options.payload);
          const result = await client.customFieldOptions.update(
            definitionId,
            optionId,
            payload,
          );
          formatter.output('custom-field-options.update', result);
        },
      ),
    );

  cmd
    .command('delete <definition-id> <option-id>')
    .description('Delete a custom field option')
    .action(
      withErrorHandling(
        'custom-field-options.delete',
        async (definitionId: string, optionId: string, _options: unknown, command: Command) => {
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
          const result = await client.customFieldOptions.delete(definitionId, optionId);
          formatter.output('custom-field-options.delete', result);
        },
      ),
    );
}
