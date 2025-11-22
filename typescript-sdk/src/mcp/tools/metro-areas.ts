/**
 * MCP tools for Metro Areas API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapDocument } from '../../jsonapi/mappers/index.js';
import type { MetroArea } from '../../domain/index.js';

export interface GetMetroAreaArgs {
  id: string;
}

/**
 * Get a metro area by ID
 */
export async function getMetroArea(args: GetMetroAreaArgs): Promise<MetroArea> {
  const data = await makeRequest(`/metro_areas/${args.id}`);
  return mapDocument<MetroArea>(data);
}
