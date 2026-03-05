/**
 * t49 parties <action>
 */

import { Command } from 'commander';
import { createClient } from '../client-factory.js';
import { createFormatter } from '../output/formatter.js';
import { withErrorHandling } from '../errors.js';

export function registerPartiesCommand(program: Command): void {
  const cmd = program.command('parties').description('List and get parties');

  cmd
    .command('list')
    .description('List parties')
    .option('--page <number>', 'Page number', (value) => Number.parseInt(value, 10))
    .option('--page-size <number>', 'Page size', (value) => Number.parseInt(value, 10))
    .action(
      withErrorHandling(
        'parties.list',
        async (
          options: { page?: number; pageSize?: number },
          command: Command,
        ) => {
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
          const result = await client.parties.list({
            page: options.page,
            pageSize: options.pageSize,
          });
          formatter.output('parties.list', result);
        },
      ),
    );

  cmd
    .command('get <id>')
    .description('Get a party')
    .action(
      withErrorHandling('parties.get', async (id: string, _options: unknown, command: Command) => {
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
        const result = await client.parties.get(id);
        formatter.output('parties.get', result);
      }),
    );
}
