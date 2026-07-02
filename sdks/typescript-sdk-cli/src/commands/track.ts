/**
 * t49 track <number>
 *
 * Smart tracking shortcut — auto-detects carrier and number type
 * via the SDK's inferNumber + createFromInfer flow.
 */

import { ValidationError } from '@terminal49/sdk';
import type { Command } from 'commander';
import { InvalidArgumentError } from 'commander';
import { splitCommaList } from '../util/input.js';
import { action } from './action.js';
import { formatCreateFromInferResult } from './tracking-request-output.js';

type TrackOptions = {
  scac?: string;
  type?: string;
  refNumbers?: string;
  shipmentTags?: string;
};

function localOptions<T>(command: Command): T {
  return command.opts() as T;
}

function optionalList(value: string | undefined): string[] | undefined {
  if (!value || value.trim() === '') return undefined;
  return splitCommaList(value);
}

function mapType(
  value: string,
): 'container' | 'bill_of_lading' | 'booking_number' {
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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
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

export function registerTrackCommand(program: Command): void {
  const cmd = program
    .command('track')
    .description('Infer tracking number and create a request');

  cmd
    .argument('<number>')
    .option('--scac <scac>', 'Carrier SCAC')
    .option('--type <type>', 'Request type override')
    .option('--ref-numbers <numbers>', 'Comma-separated reference numbers')
    .option('--shipment-tags <tags>', 'Comma-separated shipment tags')
    .action(
      action('track', async ({ client, globals }, value: string) => {
        const options = localOptions<TrackOptions>(cmd);
        if (options.type) {
          const infer = await client.trackingRequests.inferNumber(value);
          const scac = inferredScac(infer, options.scac);
          if (!scac) {
            throw new ValidationError(
              'Unable to infer carrier SCAC. Provide scac or use infer candidates to select a carrier.',
            );
          }

          const trackingRequest = await client.trackingRequests.create({
            requestType: mapType(options.type),
            requestNumber: value,
            scac,
            refNumbers: optionalList(options.refNumbers),
            shipmentTags: optionalList(options.shipmentTags),
          });

          return formatCreateFromInferResult(
            client,
            { infer, trackingRequest },
            globals.format,
          );
        }

        const result = await client.trackingRequests.createFromInfer(value, {
          scac: options.scac,
          refNumbers: optionalList(options.refNumbers),
          shipmentTags: optionalList(options.shipmentTags),
        });
        return formatCreateFromInferResult(client, result, globals.format);
      }),
    );
}
