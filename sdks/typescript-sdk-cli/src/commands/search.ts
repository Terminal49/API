/**
 * t49 search <query>
 *
 * Global search across shipments, containers, and tracking requests.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import type { Command } from 'commander';
import { action } from './action.js';

async function formatSearchResult(
  client: Terminal49Client,
  query: string,
  format: 'raw' | 'mapped' | 'both' | undefined,
): Promise<unknown> {
  const raw = await client.search(query);
  if (format === 'both') return { raw, mapped: client.deserialize(raw) };
  if (format === 'raw') return raw;
  return client.deserialize(raw);
}

export function registerSearchCommand(program: Command): void {
  const cmd = program
    .command('search')
    .description('Search terminal49 resources');

  cmd
    .argument('<query>')
    .description('Search query')
    .action(
      action('search', async ({ client, globals }, query: string) =>
        formatSearchResult(client, query, globals.format),
      ),
    );
}
