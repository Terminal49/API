// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'containers',
  operation: 'write',
  tags: [],
  httpMethod: 'patch',
  httpPath: '/containers',
  operationId: 'patch-containers-id',
};

export const tool: Tool = {
  name: 'update_containers',
  description: 'Update a container',
  inputSchema: {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        properties: {
          attributes: {
            type: 'object',
            properties: {
              ref_numbers: {
                type: 'array',
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
    required: [],
  },
  annotations: {},
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const body = args as any;
  return asTextContentResult(await client.containers.update(body));
};

export default { metadata, tool, handler };
