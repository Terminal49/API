/**
 * t49 terminals <action>
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

export function registerTerminalsCommand(program: Command): void {
  const cmd = program
    .command('terminals')
    .description('Get terminal by id');

  cmd
    .command('get <id>')
    .description('Get a terminal')
    .action(
      withErrorHandling('terminals.get', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.terminals.get(id);
        formatter.output('terminals.get', result);
      }),
    );
}
