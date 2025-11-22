/**
 * MCP tools for Shipping Lines API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapDocument, mapCollection } from '../../jsonapi/mappers/index.js';
import type { ShippingLine } from '../../domain/index.js';

export interface GetShippingLineArgs {
  id: string;
}

export interface ListShippingLinesArgs {
  page?: number;
  pageSize?: number;
}

/**
 * Get a shipping line by ID
 */
export async function getShippingLine(args: GetShippingLineArgs): Promise<ShippingLine> {
  const data = await makeRequest(`/shipping_lines/${args.id}`);
  return mapDocument<ShippingLine>(data);
}

/**
 * List all shipping lines
 */
export async function listShippingLines(args: ListShippingLinesArgs = {}): Promise<ShippingLine[]> {
  const query: Record<string, string | number> = {};

  if (args.page) query['page[number]'] = args.page;
  if (args.pageSize) query['page[size]'] = args.pageSize;

  const data = await makeRequest('/shipping_lines', { query });
  return mapCollection<ShippingLine>(data);
}
