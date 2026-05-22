/**
 * t49 ports <action>
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

export function registerPortsCommand(program: Command): void {
  const cmd = program
    .command('ports')
    .alias('port')
    .description('Get port by id or locode');

  cmd
    .command('get <id>')
    .description('Get a port')
    .action(
      withErrorHandling('ports.get', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.ports.get(id);
        formatter.output('ports.get', result);
      }),
    );
}
