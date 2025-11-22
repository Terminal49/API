/**
 * MCP tools for Ports API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapDocument } from '../../jsonapi/mappers/index.js';
import type { Port } from '../../domain/index.js';

export interface GetPortArgs {
  id: string;
}

/**
 * Get a port by ID
 */
export async function getPort(args: GetPortArgs): Promise<Port> {
  const data = await makeRequest(`/ports/${args.id}`);
  return mapDocument<Port>(data);
}
