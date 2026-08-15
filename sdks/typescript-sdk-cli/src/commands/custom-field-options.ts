/**
 * t49 custom-field-options <action>
 */

import type { Command } from 'commander';
import { parseJsonObjectPayload } from '../util/input.js';
import { action, addListOptions, cliEnvelope, listAction } from './action.js';

type PayloadOptions = {
  payload: Record<string, unknown>;
};

type CustomFieldOptionListOptions = {
  page?: number;
  pageSize?: number;
};

type PaginationEnvelope = {
  pagination?: {
    links?: unknown;
    meta?: unknown;
  };
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function paginationFrom(result: unknown): PaginationEnvelope | undefined {
  const record = asRecord(result);
  const mapped = asRecord(record?.mapped);
  const raw = asRecord(record?.raw);
  const links = record?.links ?? mapped?.links ?? raw?.links;
  const meta = record?.meta ?? mapped?.meta ?? raw?.meta;
  if (links === undefined && meta === undefined) return undefined;
  return { pagination: { links, meta } };
}

function listDataFrom(result: unknown): unknown {
  const record = asRecord(result);
  if (record?.raw || record?.mapped) {
    const raw = asRecord(record.raw);
    const mapped = asRecord(record.mapped);
    return {
      raw: raw?.data ?? record.raw,
      mapped: mapped?.items ?? mapped?.data ?? record.mapped,
    };
  }

  if (Array.isArray(record?.items)) return record.items;
  if (record && 'data' in record) return record.data;
  return result;
}

export function registerCustomFieldOptionsCommand(program: Command): void {
  const cmd = program
    .command('custom-field-options')
    .description('Manage options for a custom field definition');

  const listCommand = addListOptions(
    cmd.command('list <definition-id>').description('List options for a custom field definition'),
  );
  listCommand.action(
    listAction('custom-field-options.list', async ({ client, globals }) => {
      const options = listCommand.opts() as CustomFieldOptionListOptions;
      const [definitionId] = listCommand.processedArgs as [string];
      const result = await client.customFieldOptions.list(definitionId, {
        page: options.page,
        pageSize: options.pageSize,
        format: globals.format,
      });
      return cliEnvelope(listDataFrom(result), paginationFrom(result));
    }),
  );

  cmd
    .command('get <definition-id> <option-id>')
    .description('Get a custom field option')
    .action(
      action(
        'custom-field-options.get',
        async ({ client, globals }, definitionId: string, optionId: string) =>
          client.customFieldOptions.get(definitionId, optionId, {
            format: globals.format,
          }),
      ),
    );

  const createCommand = cmd
    .command('create <definition-id>')
    .description('Create a custom field option')
    .requiredOption('--payload <json>', 'Option object JSON payload', parseJsonObjectPayload);
  createCommand.action(
    action('custom-field-options.create', async ({ client, globals }, definitionId: string) => {
      const options = createCommand.opts() as PayloadOptions;
      return client.customFieldOptions.create(definitionId, options.payload, {
        format: globals.format,
      });
    }),
  );

  const updateCommand = cmd
    .command('update <definition-id> <option-id>')
    .description('Update a custom field option')
    .requiredOption('--payload <json>', 'Option object JSON payload', parseJsonObjectPayload);
  updateCommand.action(
    action(
      'custom-field-options.update',
      async ({ client, globals }, definitionId: string, optionId: string) => {
        const options = updateCommand.opts() as PayloadOptions;
        return client.customFieldOptions.update(definitionId, optionId, options.payload, {
          format: globals.format,
        });
      },
    ),
  );

  cmd
    .command('delete <definition-id> <option-id>')
    .description('Delete a custom field option')
    .action(
      action(
        'custom-field-options.delete',
        async ({ client, globals }, definitionId: string, optionId: string) =>
          client.customFieldOptions.delete(definitionId, optionId, {
            format: globals.format,
          }),
      ),
    );
}
