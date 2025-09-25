// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'webhooks',
  operation: 'write',
  tags: [],
  httpMethod: 'delete',
  httpPath: '/webhooks/{id}',
  operationId: 'delete-webhooks-id',
};

export const tool: Tool = {
  name: 'delete_webhooks',
  description: 'Delete a webhook',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
    },
    required: ['id'],
  },
  annotations: {
    idempotentHint: true,
  },
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { id, ...body } = args as any;
  const response = await client.webhooks.delete(id).asResponse();
  return asTextContentResult(await response.text());
};

export default { metadata, tool, handler };
