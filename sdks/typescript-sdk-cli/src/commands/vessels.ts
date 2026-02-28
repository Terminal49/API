/**
 * t49 vessels <action>
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

export function registerVesselsCommand(program: Command): void {
  const cmd = program.command('vessels').description('Vessel lookup and forecasting');

  cmd
    .command('get <id>')
    .description('Get a vessel by id')
    .action(
      withErrorHandling('vessels.get', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.vessels.get(id);
        formatter.output('vessels.get', result);
      }),
    );

  cmd
    .command('get-by-imo <imo>')
    .description('Get a vessel by IMO')
    .action(
      withErrorHandling(
        'vessels.get-by-imo',
        async (imo: string, _options: unknown, command: Command) => {
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
          const result = await client.vessels.getByImo(imo);
          formatter.output('vessels.get-by-imo', result);
        },
      ),
    );

  cmd
    .command('future-positions <id>')
    .description('Get vessel future positions')
    .action(
      withErrorHandling(
        'vessels.future-positions',
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
          const result = await client.vessels.futurePositions(id);
          formatter.output('vessels.future-positions', result);
        },
      ),
    );

  cmd
    .command('future-positions-coords <id>')
    .description('Get vessel future positions with coordinates')
    .action(
      withErrorHandling(
        'vessels.future-positions-coords',
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
          const result = await client.vessels.futurePositionsWithCoords(id);
          formatter.output('vessels.future-positions-coords', result);
        },
      ),
    );
}
