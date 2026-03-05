/**
 * t49 shipments <action>
 *
 * Subcommands: get, list, update, stop-tracking, resume-tracking
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

type UpdateOptions = {
  payload?: string;
  attr?: string[];
};

function parsePayload(payload: string | undefined, attrs?: string[]): Record<string, unknown> {
  const base = payload ? safeParseJson(payload) : {};
  const additional = parseAttrs(attrs);
  return { ...base, ...additional };
}

function safeParseJson(payload: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new Error('Invalid JSON in --payload');
  }
}

function parseAttrs(attrs?: string[]): Record<string, string> {
  if (!attrs || attrs.length === 0) return {};
  const out: Record<string, string> = {};
  attrs.forEach((pair) => {
    const [rawKey, rawValue] = pair.split('=', 2);
    if (!rawKey || rawValue === undefined) return;
    out[rawKey.trim()] = rawValue;
  });
  return out;
}

type SetCustomFieldOptions = {
  value?: string;
};

function parseCustomFieldValue(value: string | undefined): unknown {
  if (value === undefined) {
    throw new Error('Missing --value for set-custom-field');
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function registerShipmentsCommand(program: Command): void {
  const cmd = program.command('shipments').description('Shipment lookup and operations');

  cmd
    .command('get <id>')
    .description('Fetch a shipment by id')
    .option('--no-include-containers', 'Exclude containers in response')
    .action(
      withErrorHandling('shipments.get', async (id: string, options: { includeContainers?: boolean }, command: Command) => {
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
        const result = await client.shipments.get(id, options.includeContainers ?? true);
        formatter.output('shipments.get', result);
      }),
    );

  cmd
    .command('list')
    .description('List shipments')
    .option('--status <status>', 'Filter by status')
    .option('--port <locode>', 'Filter by pod locode')
    .option('--carrier <scac>', 'Filter by shipping line')
    .option('--updated-after <iso>', 'Filter by updated_at')
    .option('--no-include-containers', 'Exclude container fields for each shipment')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'shipments.list',
        async (
          options: {
            status?: string;
            port?: string;
            carrier?: string;
            updatedAfter?: string;
            includeContainers?: boolean;
            page?: number;
            pageSize?: number;
          },
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
          const result = await client.shipments.list(
            {
              status: options.status,
              port: options.port,
              carrier: options.carrier,
              updatedAfter: options.updatedAfter,
              includeContainers: options.includeContainers ?? true,
            },
            {
              page: options.page,
              pageSize: options.pageSize,
              format: global.format as 'raw' | 'mapped' | 'both',
            },
          );
          formatter.output('shipments.list', result);
        },
      ),
    );

  cmd
    .command('update <id>')
    .description('Update shipment attributes')
    .option('--payload <json>', 'JSON payload for update body')
    .option('--attr <key=value...>', 'Individual attributes to set', (value: string, previous: string[] = []) => [...previous, value])
    .action(
      withErrorHandling(
        'shipments.update',
        async (id: string, options: UpdateOptions, command: Command) => {
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
          const attrs = parsePayload(options.payload, options.attr);
          const result = await client.shipments.update(id, attrs);
          formatter.output('shipments.update', result);
        },
      ),
    );

  cmd
    .command('stop-tracking <id>')
    .description('Stop tracking a shipment')
    .action(
      withErrorHandling(
        'shipments.stop-tracking',
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
            maxRetries: global.maxRetries,
          });
          const result = await client.shipments.stopTracking(id);
          formatter.output('shipments.stop-tracking', result);
        },
      ),
    );

  cmd
    .command('resume-tracking <id>')
    .description('Resume shipment tracking')
    .action(
      withErrorHandling(
        'shipments.resume-tracking',
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
            maxRetries: global.maxRetries,
          });
          const result = await client.shipments.resumeTracking(id);
          formatter.output('shipments.resume-tracking', result);
        },
      ),
    );

  cmd
    .command('custom-fields <id>')
    .description('Get custom fields for a shipment')
    .action(
      withErrorHandling(
        'shipments.custom-fields',
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
          const result = await client.shipments.customFields(id);
          formatter.output('shipments.custom-fields', result);
        },
      ),
    );

  cmd
    .command('set-custom-field <id> <field-id>')
    .description('Set a shipment custom field value')
    .requiredOption('--value <value>', 'Custom field value. Use JSON for objects/arrays/numbers/booleans')
    .action(
      withErrorHandling(
        'shipments.set-custom-field',
        async (
          id: string,
          fieldId: string,
          options: SetCustomFieldOptions,
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
          const value = parseCustomFieldValue(options.value);
          const result = await client.shipments.setCustomField(id, fieldId, value);
          formatter.output('shipments.set-custom-field', result);
        },
      ),
    );
}
