/**
 * list_parties tool
 *
 * Parties are the companies on an account's shipments: customers, shippers,
 * consignees, brokers, forwarders, dray carriers. The container party filter
 * takes party IDs, so a question like "containers for customer Acme" needs the
 * ID first. GET /v2/parties?query= searches company names in the API.
 */

import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';
import { containerFilterShape } from '../generated/list-filter-schemas.js';

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
      'Company name or the start of a word in it, such as "Acme" or "ray dray". Case is ignored. Omit to list the account\'s parties.',
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

export async function executeListParties(
  args: ListPartiesArgs,
  client: Terminal49Client,
): Promise<ListPartiesResult> {
  const { search, limit } = listPartiesInputSchema.parse(args);
  const doc: any = await client.parties.list({
    query: search,
    pageSize: limit,
    format: 'raw',
  });
  const parties = (doc?.data ?? []).flatMap((item: any) => {
    const name = item?.attributes?.company_name?.trim();
    return item?.id && name ? [{ id: item.id, name }] : [];
  });
  const total = Number(doc?.meta?.total ?? parties.length);

  return {
    total_matched: total,
    parties,
    truncated: total > parties.length,
    usage: `Filter containers by a party with list_containers advanced_filters.parties, keyed by role: { "<role>": "<party id>" }. Roles: ${PARTY_ROLES.join(', ')}. Use @exists for "has any".`,
  };
}
