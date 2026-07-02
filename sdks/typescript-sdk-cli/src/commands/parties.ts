/**
 * t49 parties <action>
 */

import type { Command } from 'commander';
import { action, addListOptions, listAction } from './action.js';

type PartyListOptions = {
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

export function registerPartiesCommand(program: Command): void {
  const cmd = program.command('parties').description('List and get parties');

  const listCommand = addListOptions(
    cmd.command('list').description('List parties'),
  );
  listCommand.action(
    listAction('parties.list', async ({ client, globals }) => {
      const options = listCommand.opts() as PartyListOptions;
      const result = await client.parties.list({
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
    .description('Get a party')
    .action(
      action('parties.get', async ({ client, globals }, id: string) =>
        client.parties.get(id, { format: globals.format }),
      ),
    );
}
