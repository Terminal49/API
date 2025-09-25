// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'containers',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/containers',
  operationId: 'get-containers',
};

export const tool: Tool = {
  name: 'list_containers',
  description:
    'Returns a list of container. The containers are returned sorted by creation date, with the most recently refreshed containers appearing first.\n\nThis API will return all containers associated with the account.',
  inputSchema: {
    type: 'object',
    properties: {
      include: {
        type: 'string',
        description: 'Comma delimited list of relations to include',
      },
      'page[number]': {
        type: 'integer',
      },
      'page[size]': {
        type: 'integer',
      },
      terminal_checked_before: {
        type: 'integer',
        description: 'Number of seconds in which containers were refreshed',
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
  },
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const body = args as any;
  return asTextContentResult(await client.containers.list(body));
};

export default { metadata, tool, handler };
