/**
 * MCP tools for Terminals API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapDocument } from '../../jsonapi/mappers/index.js';
import type { Terminal } from '../../domain/index.js';

export interface GetTerminalArgs {
  id: string;
}

/**
 * Get a terminal by ID
 */
export async function getTerminal(args: GetTerminalArgs): Promise<Terminal> {
  const data = await makeRequest(`/terminals/${args.id}`);
  return mapDocument<Terminal>(data);
}
