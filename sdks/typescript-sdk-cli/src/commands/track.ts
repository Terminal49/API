/**
 * t49 track <number>
 *
 * Smart tracking shortcut — auto-detects carrier and number type
 * via the SDK's inferNumber + createFromInfer flow.
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

type TrackOptions = {
  scac?: string;
  type?: string;
  refNumbers?: string;
  shipmentTags?: string;
};

function splitList(value?: string): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
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
      withErrorHandling(
        'track',
        async (
          value: string,
          options: TrackOptions,
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
          const result = await client.trackingRequests.createFromInfer(value, {
            scac: options.scac,
            numberType: options.type,
            refNumbers: splitList(options.refNumbers),
            shipmentTags: splitList(options.shipmentTags),
          });
          formatter.output('track', result);
        },
      ),
    );
}
