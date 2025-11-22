/**
 * MCP tools for Parties API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapDocument, mapCollection } from '../../jsonapi/mappers/index.js';
import type { Party } from '../../domain/index.js';

export interface GetPartyArgs {
  id: string;
}

export interface ListPartiesArgs {
  page?: number;
  pageSize?: number;
}

/**
 * Get a party by ID
 */
export async function getParty(args: GetPartyArgs): Promise<Party> {
  const data = await makeRequest(`/parties/${args.id}`);
  return mapDocument<Party>(data);
}

/**
 * List all parties
 */
export async function listParties(args: ListPartiesArgs = {}): Promise<Party[]> {
  const query: Record<string, string | number> = {};

  if (args.page) query['page[number]'] = args.page;
  if (args.pageSize) query['page[size]'] = args.pageSize;

  const data = await makeRequest('/parties', { query });
  return mapCollection<Party>(data);
}
