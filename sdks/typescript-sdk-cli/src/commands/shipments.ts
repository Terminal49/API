/**
 * t49 shipments <action>
 *
 * Subcommands: get, list, update, stop-tracking, resume-tracking
 */

import type { Command } from 'commander';
import { parseJsonObjectPayload, parseJsonValue } from '../util/input.js';
import { action, addListOptions, cliEnvelope, listAction } from './action.js';

type ShipmentListOptions = {
  include?: string;
  includeContainers?: boolean;
  number?: string;
  page?: number;
  pageSize?: number;
  trackingStopped?: boolean;
};

type ShipmentGetOptions = {
  include?: string;
  includeContainers?: boolean;
};

type UpdateOptions = {
  payload?: Record<string, unknown>;
  attr?: string[];
};

type SetCustomFieldOptions = {
  value: unknown;
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

function localOptions<T>(command: Command): T {
  return command.opts() as T;
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

function warnUnsupportedFilters(result: unknown): void {
  const record = asRecord(result);
  const mapped = asRecord(record?.mapped);
  const unsupportedFilters = record?.unsupportedFilters ?? mapped?.unsupportedFilters;
  if (!Array.isArray(unsupportedFilters) || unsupportedFilters.length === 0) return;
  process.stderr.write(
    `Warning: unsupported filters ignored by SDK: ${unsupportedFilters.join(', ')}\n`,
  );
}

function listDataFrom(result: unknown): unknown {
  const record = asRecord(result);
  if (record?.raw || record?.mapped) {
    const raw = asRecord(record.raw);
    const mapped = asRecord(record.mapped);
    return {
      raw: raw?.data ?? record.raw,
      mapped: mapped?.items ?? record.mapped,
    };
  }

  if (Array.isArray(record?.items)) return record.items;
  if (record && 'data' in record) return record.data;
  return result;
}

function parseAttrs(attrs?: string[]): Record<string, string> {
  if (!attrs || attrs.length === 0) return {};
  const out: Record<string, string> = {};
  for (const pair of attrs) {
    const [rawKey, rawValue] = pair.split('=', 2);
    if (!rawKey || rawValue === undefined) continue;
    out[rawKey.trim()] = rawValue;
  }
  return out;
}

function updateAttributes(options: UpdateOptions): Record<string, unknown> {
  return {
    ...options.payload,
    ...parseAttrs(options.attr),
  };
}

export function registerShipmentsCommand(program: Command): void {
  const cmd = program.command('shipments').description('Shipment lookup and operations');

  const getCommand = cmd
    .command('get <id>')
    .description('Fetch a shipment by id')
    .option('--include <resources>', 'Comma-separated include list')
    .option('--no-include-containers', 'Exclude containers in response');
  getCommand.action(
    action('shipments.get', async ({ client, globals }, id: string) => {
      const options = localOptions<ShipmentGetOptions>(getCommand);
      return client.shipments.get(id, options.includeContainers ?? true, {
        include: options.include,
        format: globals.format,
      });
    }),
  );

  const listCommand = addListOptions(
    cmd
      .command('list')
      .description('List shipments')
      .option('--number <number>', 'Filter by original tracking request number')
      .option('--tracking-stopped', 'Only include shipments with tracking stopped')
      .option('--no-tracking-stopped', 'Only include shipments still being tracked')
      .option('--include <resources>', 'Comma-separated include list for each shipment')
      .option('--no-include-containers', 'Exclude container fields for each shipment'),
  );
  listCommand.action(
    listAction(
      'shipments.list',
      async ({ client, globals }) => {
        const options = localOptions<ShipmentListOptions>(listCommand);
        const result = await client.shipments.list(
          {
            include: options.include,
            includeContainers: options.includeContainers ?? true,
            number: options.number,
            trackingStopped: options.trackingStopped,
          },
          {
            page: options.page,
            pageSize: options.pageSize,
            format: globals.format,
          },
        );
        warnUnsupportedFilters(result);
        return cliEnvelope(listDataFrom(result), paginationFrom(result));
      },
      ({ client, globals }) => {
        const options = localOptions<ShipmentListOptions>(listCommand);
        return client.shipments.iterate(
          {
            include: options.include,
            includeContainers: options.includeContainers ?? true,
            number: options.number,
            trackingStopped: options.trackingStopped,
          },
          {
            pageSize: options.pageSize,
            maxPages: globals.maxPages,
            maxRows: globals.maxRows,
          },
        );
      },
    ),
  );

  const updateCommand = cmd
    .command('update <id>')
    .description('Update shipment attributes')
    .option('--payload <json>', 'JSON payload for update body', parseJsonObjectPayload)
    .option(
      '--attr <key=value...>',
      'Individual attributes to set',
      (value: string, previous: string[] = []) => [...previous, value],
    );
  updateCommand.action(
    action('shipments.update', async ({ client, globals }, id: string) => {
      const options = localOptions<UpdateOptions>(updateCommand);
      return client.shipments.update(id, updateAttributes(options), {
        format: globals.format,
      });
    }),
  );

  cmd
    .command('stop-tracking <id>')
    .description('Stop tracking a shipment')
    .action(
      action('shipments.stop-tracking', async ({ client, globals }, id: string) =>
        client.shipments.stopTracking(id, { format: globals.format }),
      ),
    );

  cmd
    .command('resume-tracking <id>')
    .description('Resume shipment tracking')
    .action(
      action('shipments.resume-tracking', async ({ client, globals }, id: string) =>
        client.shipments.resumeTracking(id, { format: globals.format }),
      ),
    );

  cmd
    .command('custom-fields <id>')
    .description('Get custom fields for a shipment')
    .action(
      action('shipments.custom-fields', async ({ client, globals }, id: string) =>
        client.shipments.customFields(id, { format: globals.format }),
      ),
    );

  const setCustomFieldCommand = cmd
    .command('set-custom-field <id> <field-id>')
    .description('Set a shipment custom field value')
    .requiredOption('--value <json>', 'Custom field JSON value', parseJsonValue);
  setCustomFieldCommand.action(
    action(
      'shipments.set-custom-field',
      async ({ client, globals }, id: string, fieldId: string) => {
        const options = localOptions<SetCustomFieldOptions>(setCustomFieldCommand);
        return client.shipments.setCustomField(id, fieldId, options.value, {
          format: globals.format,
        });
      },
    ),
  );
}
