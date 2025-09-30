// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'shipments',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/shipments/{id}',
  operationId: 'get-shipment-id',
};

export const tool: Tool = {
  name: 'retrieve_shipments',
  description:
    'Retrieves the details of an existing shipment. You need only supply the unique shipment `id` that was returned upon `tracking_request` creation.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      include: {
        type: 'string',
        description: 'Comma delimited list of relations to include',
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
  return asTextContentResult(await client.shipments.retrieve(id, body));
};

export default { metadata, tool, handler };
