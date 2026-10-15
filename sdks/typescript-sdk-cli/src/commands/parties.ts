/**
 * t49 parties <action>
 */

import type { Command } from 'commander';
import { action, defineList, iterateDocumentPages } from './action.js';

type PartyListOptions = {
  page?: number;
  pageSize?: number;
};

export function registerPartiesCommand(program: Command): void {
  const cmd = program.command('parties').description('List and get parties');

  const listCommand = cmd.command('list').description('List parties');
  defineList(listCommand, {
    name: 'parties.list',
    paginated: true,
    run: ({ client, format }) => {
      const options = listCommand.opts<PartyListOptions>();
      return client.parties.list({
        page: options.page,
        pageSize: options.pageSize,
        format,
      });
    },
    iterate: ({ client, globals }) => {
      const options = listCommand.opts<PartyListOptions>();
      return iterateDocumentPages(
        (page) =>
          client.parties.list({
            page,
            pageSize: options.pageSize,
            format: 'raw',
          }),
        globals,
      );
    },
  });

  cmd
    .command('get <id>')
    .description('Get a party')
    .action(
      action('parties.get', async ({ client, globals }, id: string) =>
        client.parties.get(id, { format: globals.format }),
      ),
    );
}
