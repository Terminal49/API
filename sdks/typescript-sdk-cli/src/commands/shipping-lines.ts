/**
 * t49 shipping-lines <action>
 *
 * Subcommands: list
 */

import type { Command } from 'commander';
import { defineList } from './action.js';

type ShippingLinesListOptions = {
  search?: string;
};

export function registerShippingLinesCommand(program: Command): void {
  const cmd = program
    .command('shipping-lines')
    .alias('shipping_lines')
    .description('List shipping lines');

  const listCommand = cmd
    .command('list')
    .description('List shipping lines')
    .option(
      '--search <text>',
      'Keep lines whose SCAC, alternative SCACs, name, or short name contain the text (case-insensitive; filtered by the CLI, not the API)',
    );
  defineList(listCommand, {
    name: 'shipping-lines.list',
    paginated: false,
    run: ({ client, format }) => {
      const options = listCommand.opts<ShippingLinesListOptions>();
      return client.shippingLines.list(options.search, { format });
    },
  });
}
