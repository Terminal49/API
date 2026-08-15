/**
 * t49 vessels <action>
 */

import type { Command } from 'commander';
import { action } from './action.js';

export function registerVesselsCommand(program: Command): void {
  const cmd = program.command('vessels').description('Vessel lookup and forecasting');

  cmd
    .command('get <id>')
    .description('Get a vessel by id')
    .action(
      action('vessels.get', async ({ client, globals }, id: string) =>
        client.vessels.get(id, { format: globals.format }),
      ),
    );

  cmd
    .command('get-by-imo <imo>')
    .description('Get a vessel by IMO')
    .action(
      action('vessels.get-by-imo', async ({ client, globals }, imo: string) =>
        client.vessels.getByImo(imo, { format: globals.format }),
      ),
    );

  cmd
    .command('future-positions <id>')
    .description('Get vessel future positions')
    .action(
      action('vessels.future-positions', async ({ client, globals }, id: string) =>
        client.vessels.futurePositions(id, { format: globals.format }),
      ),
    );

  cmd
    .command('future-positions-coords <id>')
    .description('Get vessel future positions with coordinates')
    .action(
      action('vessels.future-positions-coords', async ({ client, globals }, id: string) =>
        client.vessels.futurePositionsWithCoords(id, {
          format: globals.format,
        }),
      ),
    );
}
