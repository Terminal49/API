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
import { getListResponseMetadata } from './list-filters.js';
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
      'Company-name substring, such as "Acme" or "rayage". Case is ignored. Omit to list the account\'s parties.',
    )
    .optional(),
  page: z
    .number()
    .int()
    .positive()
    .describe(
      'Requested page, starting at 1. Keep search and limit unchanged when following next_page.',
    )
    .default(1),
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
  parties: {
    id: string;
    name: string;
    nickname?: string;
    role_names?: string[];
  }[];
  page: number;
  next_page: number | null;
  truncated: boolean;
  usage: string;
}

export async function executeListParties(
  args: ListPartiesArgs,
  client: Terminal49Client,
): Promise<ListPartiesResult> {
  const { search, limit, page } = listPartiesInputSchema.parse(args);
  const doc: any = await client.parties.list({
    query: search,
    pageSize: limit,
    page,
    format: 'raw',
  });
  const parties = (doc?.data ?? []).flatMap((item: any) => {
    const name = item?.attributes?.company_name?.trim();
    return item?.id && name
      ? [
          {
            id: item.id,
            name,
            nickname: item.attributes.nickname ?? undefined,
            role_names: item.attributes.role_names ?? undefined,
          },
        ]
      : [];
  });
  const total = Number(doc?.meta?.total ?? parties.length);

  const metadata = getListResponseMetadata(doc, {}, { page }, limit);
  const hasMore = metadata.has_more ?? page * limit < total;
  const nextPage = hasMore ? (metadata.next_page ?? page + 1) : null;

  return {
    page,
    next_page: nextPage,
    total_matched: total,
    parties,
    truncated: hasMore || page > 1 || total > parties.length,
    usage: `Filter containers by a party with list_containers advanced_filters.parties, keyed by role: { "<role>": "<party id>" }. Roles: ${PARTY_ROLES.join(', ')}. Use @exists for "has any". Use nickname and role_names to distinguish matches; ask the user if the company or role remains ambiguous. Follow next_page with the same search and limit; a final page does not include earlier pages.`,
  };
}
