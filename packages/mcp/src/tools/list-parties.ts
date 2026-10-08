/**
 * list_parties tool
 *
 * Parties are the companies on an account's shipments: customers, shippers,
 * consignees, brokers, forwarders, dray carriers. The container party filter
 * takes party IDs, so a question like "containers for customer Acme" needs the
 * ID first. The API has no name search (unknown params are ignored), so this
 * loads a bounded set of the account's parties and matches names here.
 */

import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';
import { containerFilterShape } from '../generated/list-filter-schemas.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

export const PARTY_ROLES = Object.keys(
  containerFilterShape.parties.unwrap().shape,
);

export const listPartiesInputSchema = z.strictObject({
  search: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe(
      'Company name or part of one, such as "Acme" or "ray drayage". Case and punctuation are ignored. Omit to list parties alphabetically.',
    )
    .optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .describe('Most parties to return, from 1 to 50.')
    .default(25),
});
export type ListPartiesArgs = z.input<typeof listPartiesInputSchema>;

export interface ListPartiesResult {
  total_matched: number;
  parties: { id: string; name: string }[];
  truncated: boolean;
  usage: string;
}

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function rank(name: string, search: string): number | null {
  const lower = name.toLowerCase();
  const term = search.toLowerCase();
  const normalizedSearch = normalize(search);
  if (lower === term) return 0;
  if (normalizedSearch && normalize(name) === normalizedSearch) return 0;
  if (lower.startsWith(term)) return 1;
  if (lower.includes(term)) return 2;
  if (normalizedSearch && normalize(name).includes(normalizedSearch)) return 3;
  return null;
}

export async function executeListParties(
  args: ListPartiesArgs,
  client: Terminal49Client,
): Promise<ListPartiesResult> {
  const { search, limit } = listPartiesInputSchema.parse(args);
  const parties: { id: string; name: string }[] = [];
  let truncated = false;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const doc: any = await client.parties.list({
      page,
      pageSize: PAGE_SIZE,
      format: 'raw',
    });
    for (const item of doc?.data ?? []) {
      const name = item?.attributes?.company_name ?? item?.attributes?.name;
      if (item?.id && typeof name === 'string' && name.trim())
        parties.push({ id: item.id, name: name.trim() });
    }
    if (!doc?.links?.next || (doc?.data ?? []).length === 0) break;
    if (page === MAX_PAGES) truncated = true;
  }

  const matches = search
    ? parties
        .map((party) => ({ party, score: rank(party.name, search) }))
        .filter((match) => match.score !== null)
        .sort(
          (a, b) =>
            a.score! - b.score! || a.party.name.localeCompare(b.party.name),
        )
        .map((match) => match.party)
    : [...parties].sort((a, b) => a.name.localeCompare(b.name));

  return {
    total_matched: matches.length,
    parties: matches.slice(0, limit),
    truncated: truncated || matches.length > limit,
    usage: `Filter containers by a party with list_containers or summarize_containers advanced_filters.parties, keyed by role: { "<role>": "<party id>" }. Roles: ${PARTY_ROLES.join(', ')}. Use @exists for "has any".`,
  };
}
