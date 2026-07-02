/**
 * t49 tracking-requests <action>
 *
 * Subcommands: list, get, create, update, infer
 */

import { type Terminal49Client, ValidationError } from '@terminal49/sdk';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import { parseJsonObjectPayload, splitCommaList } from '../util/input.js';
import { action, addListOptions, listAction } from './action.js';
import {
  formatCreateFromInferResult,
  formatInferResult,
  formatTrackingRequestResult,
} from './tracking-request-output.js';

type TrackingRequestType = 'container' | 'bill_of_lading' | 'booking_number';

type TrackingCreateOptions = {
  scac?: string;
  refNumbers?: string;
  shipmentTags?: string;
};

type TrackingListOptions = {
  createdAfter?: string;
  createdBefore?: string;
  include?: string;
  page?: number;
  pageSize?: number;
  requestNumber?: string;
  scac?: string;
  status?: string;
  updatedAfter?: string;
  updatedBefore?: string;
};

type TrackingGetOptions = {
  include?: string;
};

type TrackingUpdateOptions = {
  payload?: Record<string, unknown>;
};

type TrackingInferOptions = {
  scac?: string;
  type?: string;
  refNumbers?: string;
  shipmentTags?: string;
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

function optionalList(value: string | undefined): string[] | undefined {
  if (!value || value.trim() === '') return undefined;
  return splitCommaList(value);
}

function mapType(value: string | undefined): TrackingRequestType {
  if (!value) return 'container';
  if (value === 'booking') return 'booking_number';
  if (
    value === 'booking_number' ||
    value === 'container' ||
    value === 'bill_of_lading'
  ) {
    return value;
  }
  throw new InvalidArgumentError('Invalid tracking request type');
}

export function listFilters(
  options: TrackingListOptions,
): Record<string, string | undefined> {
  return {
    include: options.include,
    'filter[request_number]': options.requestNumber,
    'filter[status]': options.status,
    'filter[scac]': options.scac,
    'filter[created_at][start]': options.createdAfter,
    'filter[created_at][end]': options.createdBefore,
    'filter[updated_at][start]': options.updatedAfter,
    'filter[updated_at][end]': options.updatedBefore,
  };
}

function inferredScac(infer: unknown, override?: string): string | undefined {
  if (override) return override;
  const attrs = asRecord(asRecord(infer)?.data)?.attributes;
  const shippingLine = asRecord(attrs)?.shipping_line;
  const selected = asRecord(asRecord(shippingLine)?.selected);
  const candidates = asRecord(shippingLine)?.candidates;
  if (typeof selected?.scac === 'string') return selected.scac;
  if (Array.isArray(candidates) && candidates.length === 1) {
    const candidate = asRecord(candidates[0]);
    if (typeof candidate?.scac === 'string') return candidate.scac;
  }
  return undefined;
}

async function createFromInferWithTypeOverride(
  client: Terminal49Client,
  number: string,
  options: TrackingInferOptions,
) {
  if (!options.type) {
    return client.trackingRequests.createFromInfer(number, {
      scac: options.scac,
      refNumbers: optionalList(options.refNumbers),
      shipmentTags: optionalList(options.shipmentTags),
    });
  }

  const infer = await client.trackingRequests.inferNumber(number);
  const scac = inferredScac(infer, options.scac);
  if (!scac) {
    throw new ValidationError(
      'Unable to infer carrier SCAC. Provide scac or use infer candidates to select a carrier.',
    );
  }

  const trackingRequest = await client.trackingRequests.create({
    requestType: mapType(options.type),
    requestNumber: number,
    scac,
    refNumbers: optionalList(options.refNumbers),
    shipmentTags: optionalList(options.shipmentTags),
  });

  return { infer, trackingRequest };
}

export function registerTrackingRequestsCommand(program: Command): void {
  const cmd = program
    .command('tracking-requests')
    .alias('tracking_requests')
    .description('Tracking request commands');

  const listCommand = addListOptions(
    cmd
      .command('list')
      .description('List tracking requests')
      .option('--status <status>', 'Filter by status')
      .option('--request-number <number>', 'Filter by request number')
      .option('--scac <scac>', 'Filter by shipping line SCAC')
      .option('--created-after <iso>', 'Filter by created_at start')
      .option('--created-before <iso>', 'Filter by created_at end')
      .option('--updated-after <iso>', 'Filter by updated_at start')
      .option('--updated-before <iso>', 'Filter by updated_at end')
      .option('--include <resources>', 'Comma-separated include list'),
  );
  listCommand.action(
    listAction(
      'tracking-requests.list',
      async ({ client, globals }) => {
        const options = localOptions<TrackingListOptions>(listCommand);
        const result = await client.trackingRequests.list(
          listFilters(options),
          {
            page: options.page,
            pageSize: options.pageSize,
            format: globals.format,
          },
        );
        return {
          data: listDataFrom(result),
          meta: paginationFrom(result),
        };
      },
      ({ client, globals }) => {
        const options = localOptions<TrackingListOptions>(listCommand);
        return client.trackingRequests.iterate(listFilters(options), {
          pageSize: options.pageSize,
          maxPages: globals.maxPages,
          maxRows: globals.maxRows,
        });
      },
    ),
  );

  const getCommand = cmd
    .command('get <id>')
    .description('Get a tracking request by id')
    .option('--include <resources>', 'Comma-separated include list');
  getCommand.action(
    action('tracking-requests.get', async ({ client, globals }, id: string) => {
      const options = localOptions<TrackingGetOptions>(getCommand);
      return client.trackingRequests.get(id, {
        include: options.include,
        format: globals.format,
      });
    }),
  );

  const createCommand = cmd
    .command('create <type> <number>')
    .description('Create a tracking request')
    .option('--scac <scac>', 'Carrier SCAC')
    .option('--ref-numbers <numbers>', 'Comma-separated reference numbers')
    .option('--shipment-tags <tags>', 'Comma-separated shipment tags');
  createCommand.action(
    action(
      'tracking-requests.create',
      async ({ client, globals }, type: string, requestNumber: string) => {
        const options = localOptions<TrackingCreateOptions>(createCommand);
        const result = await client.trackingRequests.create({
          requestType: mapType(type),
          requestNumber,
          scac: options.scac,
          refNumbers: optionalList(options.refNumbers),
          shipmentTags: optionalList(options.shipmentTags),
        });
        return formatTrackingRequestResult(result, globals.format);
      },
    ),
  );

  const updateCommand = cmd
    .command('update <id>')
    .description('Update a tracking request')
    .requiredOption('--payload <json>', 'JSON payload', parseJsonObjectPayload);
  updateCommand.action(
    action(
      'tracking-requests.update',
      async ({ client, globals }, id: string) => {
        const options = localOptions<TrackingUpdateOptions>(updateCommand);
        return client.trackingRequests.update(id, options.payload ?? {}, {
          format: globals.format,
        });
      },
    ),
  );

  cmd
    .command('infer <number>')
    .description('Infer SCAC and request type')
    .action(
      action(
        'tracking-requests.infer',
        async ({ client, globals }, number: string) => {
          const result = await client.trackingRequests.inferNumber(number);
          return formatInferResult(client, result, globals.format);
        },
      ),
    );

  const createFromInferCommand = cmd
    .command('create-from-infer <number>')
    .description('Infer and create tracking request')
    .option('--scac <scac>', 'Carrier SCAC')
    .option('--type <type>', 'Request type override')
    .option('--ref-numbers <numbers>', 'Comma-separated reference numbers')
    .option('--shipment-tags <tags>', 'Comma-separated shipment tags');
  createFromInferCommand.action(
    action(
      'tracking-requests.create-from-infer',
      async ({ client, globals }, number: string) => {
        const options = localOptions<TrackingInferOptions>(
          createFromInferCommand,
        );
        const result = await createFromInferWithTypeOverride(
          client,
          number,
          options,
        );
        return formatCreateFromInferResult(client, result, globals.format);
      },
    ),
  );
}
