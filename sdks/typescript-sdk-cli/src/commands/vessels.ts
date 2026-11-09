/**
 * t49 vessels <action>
 */

import type { Command } from 'commander';
import { finiteNumber } from '../util/input.js';
import { action } from './action.js';

interface FuturePositionsOptions {
  portId: string;
  previousPortId: string;
}

interface FuturePositionsCoordsOptions extends FuturePositionsOptions {
  latitude: number;
  longitude: number;
}

export function registerVesselsCommand(program: Command): void {
  const cmd = program
    .command('vessels')
    .description('Vessel lookup and forecasting');

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

  const futurePositionsCommand = cmd
    .command('future-positions <id>')
    .description('Get vessel future positions between two ports')
    .requiredOption('--port-id <id>', 'Destination port id')
    .requiredOption('--previous-port-id <id>', 'Port the vessel departed from');
  futurePositionsCommand.action(
    action(
      'vessels.future-positions',
      async ({ client, globals }, id: string) => {
        const { portId, previousPortId } =
          futurePositionsCommand.opts<FuturePositionsOptions>();
        return client.vessels.futurePositions(
          id,
          { portId, previousPortId },
          { format: globals.format },
        );
      },
    ),
  );

  const futurePositionsCoordsCommand = cmd
    .command('future-positions-coords <id>')
    .description('Get vessel future positions from a starting coordinate')
    .requiredOption('--port-id <id>', 'Destination port id')
    .requiredOption('--previous-port-id <id>', 'Port the vessel departed from')
    .requiredOption(
      '--latitude <n>',
      'Starting latitude',
      finiteNumber('--latitude'),
    )
    .requiredOption(
      '--longitude <n>',
      'Starting longitude',
      finiteNumber('--longitude'),
    );
  futurePositionsCoordsCommand.action(
    action(
      'vessels.future-positions-coords',
      async ({ client, globals }, id: string) => {
        const { portId, previousPortId, latitude, longitude } =
          futurePositionsCoordsCommand.opts<FuturePositionsCoordsOptions>();
        return client.vessels.futurePositionsWithCoords(
          id,
          { portId, previousPortId, latitude, longitude },
          { format: globals.format },
        );
      },
    ),
  );
}
