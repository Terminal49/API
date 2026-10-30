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
import { partyAttributesSchema, partyName, partyNames } from './party-roles.js';
import { httpStatus } from './soft-results.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 10;
/** The most parties {@link loadParties} reads. */
export const MAX_LOADED_PARTIES = PAGE_SIZE * MAX_PAGES;

export const PARTY_ROLES = Object.keys(
  containerFilterShape.parties.unwrap().shape,
);

export const listPartiesInputSchema = z.strictObject({
  id: z
    .string()
    .uuid()
    .describe(
      'One party ID to look up, for example party_id from a party role. When set, search and limit are ignored.',
    )
    .optional(),
  search: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe(
      'Company name, name or nickname, or part of one, such as "Acme" or "ray drayage". Case and punctuation are ignored. Omit to list parties alphabetically.',
    )
    .optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(50)
    .describe('Most parties to return.')
    .default(25),
});
export type ListPartiesArgs = z.input<typeof listPartiesInputSchema>;

export interface ListPartiesResult {
  total_matched: number;
  parties: PartySummary[];
  truncated: boolean;
  usage: string;
}

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * How well a party name matches a search: 0 is an exact match ignoring case
 * and punctuation, higher is weaker, null is no match.
 */
export function matchRank(name: string, search: string): number | null {
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

export interface PartySummary {
  id: string;
  name: string;
}

/** A loaded party with every name it goes by, display name first. */
export interface LoadedParty extends PartySummary {
  names: string[];
}

export const toPartySummary = ({ id, name }: PartySummary): PartySummary => ({
  id,
  name,
});

/** The best rank any of the party's names gets for this search. */
function partyRank(party: LoadedParty, search: string): number | null {
  const ranks = party.names
    .map((alias) => matchRank(alias, search))
    .filter((rank): rank is number => rank !== null);
  return ranks.length > 0 ? Math.min(...ranks) : null;
}

/**
 * The parties matching a search on any of their names, best match first,
 * then by display name.
 */
export function rankParties<Party extends LoadedParty>(
  parties: readonly Party[],
  search: string,
): Party[] {
  return parties
    .map((party) => ({ party, score: partyRank(party, search) }))
    .filter(
      (match): match is { party: Party; score: number } => match.score !== null,
    )
    .sort(
      (a, b) => a.score - b.score || a.party.name.localeCompare(b.party.name),
    )
    .map((match) => match.party);
}

const rawPartyRowSchema = z.object({
  id: z.string(),
  attributes: partyAttributesSchema,
});

// Strict, so an unreadable page fails the load instead of looking complete:
const rawPartyPageSchema = z.object({
  data: z.array(rawPartyRowSchema),
  links: z.object({ next: z.string().nullish() }).nullish(),
});

/**
 * Loads up to MAX_PAGES pages of the account's parties. `truncated` is true
 * when the account has more. An unreadable page throws.
 */
export async function loadParties(
  client: Terminal49Client,
): Promise<{ parties: LoadedParty[]; truncated: boolean }> {
  const parties: LoadedParty[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, links } = rawPartyPageSchema.parse(
      await client.parties.list({ page, pageSize: PAGE_SIZE, format: 'raw' }),
    );
    for (const row of data) {
      const names = partyNames(row.attributes);
      const [name] = names;
      if (name) parties.push({ id: row.id, name, names });
    }
    if (!links?.next || data.length === 0) {
      return { parties, truncated: false };
    }
  }
  return { parties, truncated: true };
}

export async function executeListParties(
  args: ListPartiesArgs,
  client: Terminal49Client,
): Promise<ListPartiesResult> {
  const { id, search, limit } = listPartiesInputSchema.parse(args);
  if (id) {
    const party = await getParty(id, client);
    return {
      total_matched: party ? 1 : 0,
      parties: party ? [party] : [],
      truncated: false,
      usage: usage(),
    };
  }

  const { parties, truncated } = await loadParties(client);
  const matches = search
    ? rankParties(parties, search)
    : [...parties].sort((a, b) => a.name.localeCompare(b.name));

  return {
    total_matched: matches.length,
    parties: matches.slice(0, limit).map(toPartySummary),
    truncated: truncated || matches.length > limit,
    usage: usage(),
  };
}

function usage(): string {
  return `Filter containers by a party with list_containers or summarize_containers advanced_filters.parties, keyed by role: { "<role>": "<party id>" }. Roles: ${PARTY_ROLES.join(', ')}. Use @exists for "has any".`;
}

const rawPartySchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: partyAttributesSchema,
  }),
});

/**
 * The party with this id, or null when the account has none. A party with no
 * display name is still returned, named by its id.
 */
export async function getParty(
  id: string,
  client: Terminal49Client,
): Promise<PartySummary | null> {
  let raw: unknown;
  try {
    raw = await client.parties.get(id, { format: 'raw' });
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw error;
  }
  const { data } = rawPartySchema.parse(raw);
  return { id: data.id, name: partyName(data.attributes) ?? data.id };
}
