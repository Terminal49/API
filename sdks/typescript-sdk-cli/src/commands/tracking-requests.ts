/**
 * t49 tracking-requests <action>
 *
 * Subcommands: list, get, create, update, infer
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

type TrackingRequestType = 'container' | 'bill_of_lading' | 'booking_number';

type TrackingCreateOptions = {
  scac?: string;
  refNumbers?: string;
  shipmentTags?: string;
};

type TrackingUpdateOptions = {
  payload?: string;
};

type TrackingInferOptions = {
  scac?: string;
  type?: string;
  refNumbers?: string;
  shipmentTags?: string;
};

function parseList(values: string | undefined): string[] | undefined {
  if (!values || values.trim() === '') return undefined;
  return values
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function safeParse(payload: string | undefined): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('Invalid JSON in --payload');
  }
}

function mapType(value: string | undefined): TrackingRequestType {
  if (!value) return 'container';
  if (value === 'booking') return 'booking_number';
  if (value === 'booking_number' || value === 'container' || value === 'bill_of_lading') {
    return value;
  }
  throw new Error('Invalid tracking request type');
}

export function registerTrackingRequestsCommand(program: Command): void {
  const cmd = program
    .command('tracking-requests')
    .alias('tracking_requests')
    .description('Tracking request commands');

  cmd
    .command('list')
    .description('List tracking requests')
    .option('--status <status>', 'Filter by status')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'tracking-requests.list',
        async (
          options: {
            status?: string;
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
          const result = await client.trackingRequests.list(
            options.status ? { status: options.status } : {},
            {
              page: options.page,
              pageSize: options.pageSize,
              format: global.format as 'raw' | 'mapped' | 'both',
            },
          );
          formatter.output('tracking-requests.list', result);
        },
      ),
    );

  cmd
    .command('get <id>')
    .description('Get a tracking request by id')
    .action(
      withErrorHandling('tracking-requests.get', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.trackingRequests.get(id);
        formatter.output('tracking-requests.get', result);
      }),
    );

  cmd
    .command('create <type> <number>')
    .description('Create a tracking request')
    .option('--scac <scac>', 'Carrier SCAC')
    .option('--ref-numbers <numbers>', 'Comma-separated reference numbers')
    .option('--shipment-tags <tags>', 'Comma-separated shipment tags')
    .action(
      withErrorHandling(
        'tracking-requests.create',
        async (
          type: string,
          requestNumber: string,
          options: TrackingCreateOptions,
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
          const result = await client.trackingRequests.create({
            requestType: mapType(type),
            requestNumber,
            scac: options.scac,
            refNumbers: parseList(options.refNumbers),
            shipmentTags: parseList(options.shipmentTags),
          });
          formatter.output('tracking-requests.create', result);
        },
      ),
    );

  cmd
    .command('update <id>')
    .description('Update a tracking request')
    .option('--payload <json>', 'JSON payload')
    .action(
      withErrorHandling(
        'tracking-requests.update',
        async (id: string, options: TrackingUpdateOptions, command: Command) => {
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
          const attrs = safeParse(options.payload);
          const result = await client.trackingRequests.update(id, attrs);
          formatter.output('tracking-requests.update', result);
        },
      ),
    );

  cmd
    .command('infer <number>')
    .description('Infer SCAC and request type')
    .action(
      withErrorHandling(
        'tracking-requests.infer',
        async (number: string, _options: unknown, command: Command) => {
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
          const result = await client.trackingRequests.inferNumber(number);
          formatter.output('tracking-requests.infer', result);
        },
      ),
    );

  cmd
    .command('create-from-infer <number>')
    .description('Infer and create tracking request')
    .option('--scac <scac>', 'Carrier SCAC')
    .option('--type <type>', 'Request type override')
    .option('--ref-numbers <numbers>', 'Comma-separated reference numbers')
    .option('--shipment-tags <tags>', 'Comma-separated shipment tags')
    .action(
      withErrorHandling(
        'tracking-requests.create-from-infer',
        async (
          number: string,
          options: TrackingInferOptions,
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
          const result = await client.trackingRequests.createFromInfer(number, {
            scac: options.scac,
            numberType: options.type,
            refNumbers: parseList(options.refNumbers),
            shipmentTags: parseList(options.shipmentTags),
          });
          formatter.output('tracking-requests.create-from-infer', result);
        },
      ),
    );
}
