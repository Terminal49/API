/**
 * t49 shipping-lines <action>
 *
 * Subcommands: list
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

export function registerShippingLinesCommand(program: Command): void {
  const cmd = program
    .command('shipping-lines')
    .alias('shipping_lines')
    .description('List shipping lines');

  cmd
    .command('list')
    .description('List shipping lines')
    .option('--search <text>', 'Search shipping lines by name or code')
    .action(
      withErrorHandling(
        'shipping-lines.list',
        async (options: { search?: string }, command: Command) => {
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
          const result = await client.shippingLines.list(options.search);
          formatter.output('shipping-lines.list', result);
        },
      ),
    );
}
