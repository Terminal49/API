/**
 * t49 containers <action>
 *
 * Subcommands: get, list, events, route, raw-events, refresh, demurrage, rail
 */

import type { Command } from 'commander';
import { parseJsonValue } from '../util/input.js';
import { action, addListOptions, cliEnvelope, listAction } from './action.js';

type ContainerListOptions = {
  include?: string;
  page?: number;
  pageSize?: number;
};

type ContainerGetOptions = {
  include?: string;
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

function demurrageFromRaw(containerId: string, raw: unknown): Record<string, unknown> {
  const container = asRecord(asRecord(asRecord(raw)?.data)?.attributes) ?? {};
  return {
    container_id: containerId,
    pickup_lfd: container.pickup_lfd,
    pickup_appointment_at: container.pickup_appointment_at,
    available_for_pickup: container.available_for_pickup,
    fees_at_pod_terminal: container.fees_at_pod_terminal,
    holds_at_pod_terminal: container.holds_at_pod_terminal,
    pod_arrived_at: container.pod_arrived_at,
    pod_discharged_at: container.pod_discharged_at,
  };
}

function railFromRaw(containerId: string, raw: unknown): Record<string, unknown> {
  const record = asRecord(raw);
  const container = asRecord(asRecord(record?.data)?.attributes) ?? {};
  const included = Array.isArray(record?.included) ? record.included : [];
  const railEvents = included
    .filter((item) => asRecord(item)?.type === 'transport_event')
    .filter((item) => {
      const event = asRecord(asRecord(item)?.attributes)?.event;
      return typeof event === 'string' && event.startsWith('rail.');
    })
    .map((item) => asRecord(item)?.attributes);

  return {
    container_id: containerId,
    pod_rail_carrier_scac: container.pod_rail_carrier_scac,
    ind_rail_carrier_scac: container.ind_rail_carrier_scac,
    pod_rail_loaded_at: container.pod_rail_loaded_at,
    pod_rail_departed_at: container.pod_rail_departed_at,
    ind_rail_arrived_at: container.ind_rail_arrived_at,
    ind_rail_unloaded_at: container.ind_rail_unloaded_at,
    ind_eta_at: container.ind_eta_at,
    ind_ata_at: container.ind_ata_at,
    rail_events: railEvents,
  };
}

async function formattedFromRaw(
  format: 'raw' | 'mapped' | 'both' | undefined,
  rawLoader: () => Promise<unknown>,
  mapper: (raw: unknown) => unknown,
): Promise<unknown> {
  const raw = await rawLoader();
  if (format === 'raw') return raw;
  if (format === 'both') return { raw, mapped: mapper(raw) };
  return mapper(raw);
}

export function registerContainersCommand(program: Command): void {
  const cmd = program.command('containers').description('Container lookup and operations');

  const getCommand = cmd
    .command('get <id>')
    .description('Fetch a container by id')
    .option('--include <resources>', 'Comma-separated include list');
  getCommand.action(
    action('containers.get', async ({ client, globals }, id: string) => {
      const options = localOptions<ContainerGetOptions>(getCommand);
      return client.containers.get(id, options.include, {
        format: globals.format,
      });
    }),
  );

  const listCommand = addListOptions(
    cmd
      .command('list')
      .description('List containers')
      .option('--include <resources>', 'Comma-separated include list for each container'),
  );
  listCommand.action(
    listAction(
      'containers.list',
      async ({ client, globals }) => {
        const options = localOptions<ContainerListOptions>(listCommand);
        const result = await client.containers.list(
          { include: options.include },
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
        const options = localOptions<ContainerListOptions>(listCommand);
        return client.containers.iterate(
          { include: options.include },
          {
            pageSize: options.pageSize,
            maxPages: globals.maxPages,
            maxRows: globals.maxRows,
          },
        );
      },
    ),
  );

  cmd
    .command('events <id>')
    .description('Fetch transport events for a container')
    .action(
      action('containers.events', async ({ client, globals }, id: string) =>
        client.containers.events(id, { format: globals.format }),
      ),
    );

  cmd
    .command('route <id>')
    .description('Fetch container route')
    .action(
      action('containers.route', async ({ client, globals }, id: string) =>
        client.containers.route(id, { format: globals.format }),
      ),
    );

  cmd
    .command('map <id>')
    .description('Fetch container route geometry as GeoJSON')
    .action(
      action('containers.map', async ({ client, globals }, id: string) =>
        client.containers.map(id, { format: globals.format }),
      ),
    );

  cmd
    .command('custom-fields <id>')
    .description('Get custom fields for a container')
    .action(
      action('containers.custom-fields', async ({ client, globals }, id: string) =>
        client.containers.customFields(id, { format: globals.format }),
      ),
    );

  const setCustomFieldCommand = cmd
    .command('set-custom-field <id> <field-id>')
    .description('Set a container custom field value')
    .requiredOption('--value <json>', 'Custom field JSON value', parseJsonValue);
  setCustomFieldCommand.action(
    action(
      'containers.set-custom-field',
      async ({ client, globals }, id: string, fieldId: string) => {
        const options = localOptions<SetCustomFieldOptions>(setCustomFieldCommand);
        return client.containers.setCustomField(id, fieldId, options.value, {
          format: globals.format,
        });
      },
    ),
  );

  cmd
    .command('raw-events <id>')
    .description('Fetch raw container events')
    .action(
      action('containers.raw-events', async ({ client, globals }, id: string) =>
        client.containers.rawEvents(id, { format: globals.format }),
      ),
    );

  cmd
    .command('refresh <id>')
    .description('Refresh a container')
    .action(
      action('containers.refresh', async ({ client, globals }, id: string) =>
        client.containers.refresh(id, { format: globals.format }),
      ),
    );

  cmd
    .command('demurrage <id>')
    .description('Get demurrage summary for a container')
    .action(
      action('containers.demurrage', async ({ client, globals }, id: string) =>
        formattedFromRaw(
          globals.format,
          () => client.containers.get(id, ['pod_terminal'], { format: 'raw' }),
          (raw) => demurrageFromRaw(id, raw),
        ),
      ),
    );

  cmd
    .command('rail <id>')
    .description('Get rail milestones for a container')
    .action(
      action('containers.rail', async ({ client, globals }, id: string) =>
        formattedFromRaw(
          globals.format,
          () => client.containers.get(id, ['transport_events'], { format: 'raw' }),
          (raw) => railFromRaw(id, raw),
        ),
      ),
    );
}
