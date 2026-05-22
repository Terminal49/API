/**
 * t49 metro-areas <action>
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

export function registerMetroAreasCommand(program: Command): void {
  const cmd = program
    .command('metro-areas')
    .alias('metro_areas')
    .description('Get metro area by id or locode');

  cmd
    .command('get <id>')
    .description('Get a metro area')
    .action(
      withErrorHandling('metro-areas.get', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.metroAreas.get(id);
        formatter.output('metro-areas.get', result);
      }),
    );
}
