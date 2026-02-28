/**
 * t49 search <query>
 *
 * Global search across shipments, containers, and tracking requests.
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

export function registerSearchCommand(program: Command): void {
  const cmd = program.command('search').description('Search terminal49 resources');

  cmd
    .argument('<query>')
    .description('Search query')
    .action(
      withErrorHandling('search', async (query: string, _options: unknown, command: Command) => {
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
        const result = await client.search(query);
        formatter.output('search', result);
      }),
    );
}
