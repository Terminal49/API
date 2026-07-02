/**
 * t49 custom-fields <action>
 */

import type { Command } from 'commander';
import { parseJsonObjectPayload } from '../util/input.js';
import { action, addListOptions, listAction } from './action.js';

type PayloadOptions = {
  payload: Record<string, unknown>;
};

type CustomFieldListOptions = {
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

export function registerCustomFieldsCommand(program: Command): void {
  const cmd = program
    .command('custom-fields')
    .description('Manage custom fields');

  const listCommand = addListOptions(
    cmd.command('list').description('List custom field assignments'),
  );
  listCommand.action(
    listAction('custom-fields.list', async ({ client, globals }) => {
      const options = listCommand.opts() as CustomFieldListOptions;
      const result = await client.customFields.list({
        page: options.page,
        pageSize: options.pageSize,
        format: globals.format,
      });
      return {
        data: listDataFrom(result),
        meta: paginationFrom(result),
      };
    }),
  );

  cmd
    .command('get <id>')
    .description('Get a custom field')
    .action(
      action('custom-fields.get', async ({ client, globals }, id: string) =>
        client.customFields.get(id, { format: globals.format }),
      ),
    );

  const createCommand = cmd
    .command('create')
    .description('Create a custom field assignment')
    .requiredOption(
      '--payload <json>',
      'Custom field JSON payload',
      parseJsonObjectPayload,
    );
  createCommand.action(
    action('custom-fields.create', async ({ client, globals }) => {
      const options = createCommand.opts() as PayloadOptions;
      return client.customFields.create(options.payload, {
        format: globals.format,
      });
    }),
  );

  const updateCommand = cmd
    .command('update <id>')
    .description('Update a custom field assignment')
    .requiredOption(
      '--payload <json>',
      'Custom field JSON payload',
      parseJsonObjectPayload,
    );
  updateCommand.action(
    action('custom-fields.update', async ({ client, globals }, id: string) => {
      const options = updateCommand.opts() as PayloadOptions;
      return client.customFields.update(id, options.payload, {
        format: globals.format,
      });
    }),
  );

  cmd
    .command('delete <id>')
    .description('Delete a custom field assignment')
    .action(
      action('custom-fields.delete', async ({ client, globals }, id: string) =>
        client.customFields.delete(id, { format: globals.format }),
      ),
    );
}
