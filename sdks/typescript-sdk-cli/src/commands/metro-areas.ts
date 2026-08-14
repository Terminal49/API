/**
 * t49 metro-areas <action>
 */

import type { Command } from 'commander';
import { action } from './action.js';

export function registerMetroAreasCommand(program: Command): void {
  const cmd = program
    .command('metro-areas')
    .alias('metro_areas')
    .description('Get metro area by id or locode');

  cmd
    .command('get <id>')
    .description('Get a metro area')
    .action(
      action('metro-areas.get', async ({ client, globals }, id: string) =>
        client.metroAreas.get(id, { format: globals.format }),
      ),
    );
}
