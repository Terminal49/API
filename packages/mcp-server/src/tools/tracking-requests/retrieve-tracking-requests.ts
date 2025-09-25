// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'tracking_requests',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/tracking_requests/{id}',
  operationId: 'get-track-request-by-id',
};

export const tool: Tool = {
  name: 'retrieve_tracking_requests',
  description: 'Get the details and status of an existing tracking request. ',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      include: {
        type: 'string',
        description: "Comma delimited list of relations to include. 'tracked_object' is included by default.",
      },
    },
    required: ['id'],
  },
  annotations: {
    readOnlyHint: true,
  },
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { id, ...body } = args as any;
  return asTextContentResult(await client.trackingRequests.retrieve(id, body));
};

export default { metadata, tool, handler };
