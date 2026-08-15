/**
 * t49 ports <action>
 */

import type { Command } from 'commander';
import { action } from './action.js';

export function registerPortsCommand(program: Command): void {
  const cmd = program
    .command('ports')
    .alias('port')
    .description('Get port by id or locode');

  cmd
    .command('get <id>')
    .description('Get a port')
    .action(
      action('ports.get', async ({ client, globals }, id: string) =>
        client.ports.get(id, { format: globals.format }),
      ),
    );
}
