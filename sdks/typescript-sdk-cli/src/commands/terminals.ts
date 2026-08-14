/**
 * t49 terminals <action>
 */

import type { Command } from 'commander';
import { action } from './action.js';

export function registerTerminalsCommand(program: Command): void {
  const cmd = program.command('terminals').description('Get terminal by id');

  cmd
    .command('get <id>')
    .description('Get a terminal')
    .action(
      action('terminals.get', async ({ client, globals }, id: string) =>
        client.terminals.get(id, { format: globals.format }),
      ),
    );
}
