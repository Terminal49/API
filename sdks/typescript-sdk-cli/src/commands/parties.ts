/**
 * t49 parties <action>
 */

import type { Command } from 'commander';
import { action, addListOptions, listAction } from './action.js';

type PartyListOptions = {
  page?: number;
  pageSize?: number;
};

export function registerPartiesCommand(program: Command): void {
  const cmd = program.command('parties').description('List and get parties');

  const listCommand = addListOptions(
    cmd.command('list').description('List parties'),
  );
  listCommand.action(
    listAction('parties.list', async ({ client, globals }) => {
      const options = listCommand.opts() as PartyListOptions;
      return client.parties.list({
        page: options.page,
        pageSize: options.pageSize,
        format: globals.format,
      });
    }),
  );

  cmd
    .command('get <id>')
    .description('Get a party')
    .action(
      action('parties.get', async ({ client, globals }, id: string) =>
        client.parties.get(id, { format: globals.format }),
      ),
    );
}
