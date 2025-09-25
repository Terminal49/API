// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'shipments',
  operation: 'write',
  tags: [],
  httpMethod: 'patch',
  httpPath: '/shipments/{id}',
  operationId: 'patch-shipments-id',
};

export const tool: Tool = {
  name: 'update_shipments',
  description: 'Update a shipment',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      data: {
        type: 'object',
        properties: {
          attributes: {
            type: 'object',
            properties: {
              ref_numbers: {
                type: 'array',
                description: 'Shipment ref numbers.',
                items: {
                  type: 'string',
                },
              },
              shipment_tags: {
                type: 'array',
                description: 'Tags related to a shipment',
                items: {
                  type: 'string',
                },
              },
            },
          },
        },
        required: ['attributes'],
      },
    },
    required: ['id'],
  },
  annotations: {},
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { id, ...body } = args as any;
  return asTextContentResult(await client.shipments.update(id, body));
};

export default { metadata, tool, handler };
