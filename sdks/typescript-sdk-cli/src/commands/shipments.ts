/**
 * t49 shipments <action>
 *
 * Subcommands: get, list, update, stop-tracking, resume-tracking
 */

import { type Command, InvalidArgumentError } from 'commander';
import { parseJsonObjectPayload, parseJsonValue } from '../util/input.js';
import { action, defineList, warnUnsupportedFilters } from './action.js';
import { customFieldSlug } from './custom-field-slug.js';

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

type Attr = [key: string, value: unknown];

type UpdateOptions = {
  payload?: Record<string, unknown>;
  attr?: Attr[];
};

/** The PATCH /shipments/{id} attributes the spec types as string arrays. */
const ARRAY_ATTRIBUTES = new Set(['ref_numbers', 'tags']);

type SetCustomFieldOptions = {
  value: unknown;
};

function localOptions<T>(command: Command): T {
  return command.opts() as T;
}

/**
 * Parses one `--attr key=value`. The key ends at the first `=`. A value that
 * starts with `[`, `{`, or `"` is JSON. For keys other than ref_numbers and
 * tags, `true`, `false`, and `null` are JSON too. Anything else stays a
 * string, so long numeric references keep every digit and a tag can be
 * spelled `true`.
 */
export function parseAttr(pair: string): Attr {
  const separator = pair.indexOf('=');
  const key = separator > 0 ? pair.slice(0, separator).trim() : '';
  if (!key) {
    throw new InvalidArgumentError(`--attr expects key=value, got "${pair}"`);
  }
  const raw = pair.slice(separator + 1);
  const isArrayKey = ARRAY_ATTRIBUTES.has(key);
  const isJson =
    /^[[{"]/.test(raw) ||
    (!isArrayKey && ['true', 'false', 'null'].includes(raw));
  if (!isJson) {
    return [key, raw];
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InvalidArgumentError(`--attr ${key} is not valid JSON: ${raw}`);
  }
  if (isArrayKey && !isStringOrStrings(value)) {
    throw new InvalidArgumentError(
      `--attr ${key} must be a string or an array of strings: ${raw}`,
    );
  }
  return [key, value];
}

function isStringOrStrings(value: unknown): value is string | string[] {
  return (
    typeof value === 'string' ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  );
}

/** An --attr key replaces the --payload value; repeated array --attr pairs collect into one array. */
function updateAttributes(options: UpdateOptions): Record<string, unknown> {
  const fromAttr: Record<string, unknown> = {};
  for (const [key, value] of options.attr ?? []) {
    const previous = fromAttr[key];
    fromAttr[key] = ARRAY_ATTRIBUTES.has(key)
      ? [
          ...(Array.isArray(previous) ? previous : []),
          ...(Array.isArray(value) ? value : [value]),
        ]
      : value;
  }
  return { ...options.payload, ...fromAttr };
}

export function registerShipmentsCommand(program: Command): void {
  const cmd = program
    .command('shipments')
    .description('Shipment lookup and operations');

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

  const listCommand = cmd
    .command('list')
    .description('List shipments')
    .option('--number <number>', 'Filter by original tracking request number')
    .option(
      '--tracking-stopped',
      'Only include shipments with tracking stopped',
    )
    .option(
      '--no-tracking-stopped',
      'Only include shipments still being tracked',
    )
    .option(
      '--include <resources>',
      'Comma-separated include list for each shipment',
    )
    .option(
      '--no-include-containers',
      'Exclude container fields for each shipment',
    );
  defineList(listCommand, {
    name: 'shipments.list',
    paginated: true,
    run: async ({ client, globals }) => {
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
      return result;
    },
    iterate: ({ client, globals }) => {
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
  });

  const updateCommand = cmd
    .command('update <id>')
    .description('Update shipment attributes')
    .option(
      '--payload <json>',
      'JSON payload for update body',
      parseJsonObjectPayload,
    )
    .option(
      '--attr <key=value...>',
      'Attributes to set. Values starting with [, {, or " are JSON, and so are true, false, and null except on ref_numbers and tags. ref_numbers and tags take strings and collect repeated values',
      (value: string, previous: Attr[] = []) => [...previous, parseAttr(value)],
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
      action(
        'shipments.stop-tracking',
        async ({ client, globals }, id: string) =>
          client.shipments.stopTracking(id, { format: globals.format }),
      ),
    );

  cmd
    .command('resume-tracking <id>')
    .description('Resume shipment tracking')
    .action(
      action(
        'shipments.resume-tracking',
        async ({ client, globals }, id: string) =>
          client.shipments.resumeTracking(id, { format: globals.format }),
      ),
    );

  cmd
    .command('custom-fields <id>')
    .description('Get custom fields for a shipment')
    .action(
      action(
        'shipments.custom-fields',
        async ({ client, globals }, id: string) =>
          client.shipments.customFields(id, { format: globals.format }),
      ),
    );

  const setCustomFieldCommand = cmd
    .command('set-custom-field <id> <api-slug>')
    .description(
      'Set a shipment custom field value by its definition api_slug (a definition id also works)',
    )
    .requiredOption(
      '--value <json>',
      'Custom field JSON value',
      parseJsonValue,
    );
  setCustomFieldCommand.action(
    action(
      'shipments.set-custom-field',
      async ({ client, globals }, id: string, apiSlug: string) => {
        const options = localOptions<SetCustomFieldOptions>(
          setCustomFieldCommand,
        );
        return client.shipments.setCustomField(
          id,
          await customFieldSlug(client, apiSlug),
          options.value,
          {
            format: globals.format,
          },
        );
      },
    ),
  );
}
