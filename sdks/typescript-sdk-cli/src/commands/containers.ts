/**
 * t49 containers <action>
 *
 * Subcommands: get, list, events, route, raw-events, refresh, demurrage, rail
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

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

export function registerContainersCommand(program: Command): void {
  const cmd = program.command('containers').description('Container lookup and operations');

  cmd
    .command('get <id>')
    .description('Fetch a container by id')
    .option('--include <resources>', 'Comma-separated include list')
    .action(
      withErrorHandling(
        'containers.get',
        async (id: string, options: { include?: string }, command: Command) => {
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
          const include =
            options.include
              ?.split(',')
              .map((value) => value.trim())
              .filter(Boolean) ?? ['shipment', 'pod_terminal'];
          const result = await client.containers.get(id, include);
          formatter.output('containers.get', result);
        },
      ),
    );

  cmd
    .command('list')
    .description('List containers')
    .option('--status <status>', 'Filter by status')
    .option('--port <locode>', 'Filter by pod locode')
    .option('--carrier <scac>', 'Filter by shipping line')
    .option('--updated-after <iso>', 'Filter by updated_at')
    .option('--include <resources>', 'Comma-separated include list for each container')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'containers.list',
        async (options: {
          status?: string;
          port?: string;
          carrier?: string;
          updatedAfter?: string;
          include?: string;
          page?: number;
          pageSize?: number;
        }, command: Command) => {
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
          const result = await client.containers.list(
            {
              status: options.status,
              port: options.port,
              carrier: options.carrier,
              updatedAfter: options.updatedAfter,
              include: options.include,
            },
            {
              page: options.page,
              pageSize: options.pageSize,
              format: global.format as 'raw' | 'mapped' | 'both',
            },
          );
          formatter.output('containers.list', result);
        },
      ),
    );

  cmd
    .command('events <id>')
    .description('Fetch transport events for a container')
    .action(
      withErrorHandling('containers.events', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.containers.events(id);
        formatter.output('containers.events', result);
      }),
    );

  cmd
    .command('route <id>')
    .description('Fetch container route')
    .action(
      withErrorHandling('containers.route', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.containers.route(id);
        formatter.output('containers.route', result);
      }),
    );

  cmd
    .command('map <id>')
    .description('Fetch container route geometry as GeoJSON')
    .action(
      withErrorHandling('containers.map', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.containers.map(id);
        formatter.output('containers.map', result);
      }),
    );

  cmd
    .command('custom-fields <id>')
    .description('Get custom fields for a container')
    .action(
      withErrorHandling(
        'containers.custom-fields',
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
          const result = await client.containers.customFields(id);
          formatter.output('containers.custom-fields', result);
        },
      ),
    );

  cmd
    .command('set-custom-field <id> <field-id>')
    .description('Set a container custom field value')
    .requiredOption('--value <value>', 'Custom field value. Use JSON for objects/arrays/numbers/booleans')
    .action(
      withErrorHandling(
        'containers.set-custom-field',
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
          const result = await client.containers.setCustomField(id, fieldId, value);
          formatter.output('containers.set-custom-field', result);
        },
      ),
    );

  cmd
    .command('raw-events <id>')
    .description('Fetch raw container events')
    .action(
      withErrorHandling(
        'containers.raw-events',
        async (id: string, _options: unknown, command: Command) => {
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: true,
            compact: global.compact,
            fields: global.fields,
          });
          const client = await createClient({
            token: global.token,
            baseUrl: global.baseUrl,
            format: 'raw',
            maxRetries: global.maxRetries,
          });
          const result = await client.containers.rawEvents(id);
          formatter.output('containers.raw-events', result);
        },
      ),
    );

  cmd
    .command('refresh <id>')
    .description('Refresh a container')
    .action(
      withErrorHandling(
        'containers.refresh',
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
          const result = await client.containers.refresh(id);
          formatter.output('containers.refresh', result);
        },
      ),
    );

  cmd
    .command('demurrage <id>')
    .description('Get demurrage summary for a container')
    .action(
      withErrorHandling(
        'containers.demurrage',
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
          const result = await client.containers.demurrage(id);
          formatter.output('containers.demurrage', result);
        },
      ),
    );

  cmd
    .command('rail <id>')
    .description('Get rail milestones for a container')
    .action(
      withErrorHandling('containers.rail', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.getRailMilestones(id);
        formatter.output('containers.rail', result);
      }),
    );
}
