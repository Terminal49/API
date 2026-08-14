/**
 * t49 shipping-lines <action>
 *
 * Subcommands: list
 */

import type { Command } from 'commander';
import { action } from './action.js';

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
    .option('--search <text>', 'Search shipping lines by name or code');
  listCommand.action(
    action('shipping-lines.list', async ({ client, globals }) => {
      const options = listCommand.opts() as ShippingLinesListOptions;
      return client.shippingLines.list(options.search, {
        format: globals.format,
      });
    }),
  );
}
