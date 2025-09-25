// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'webhook_notifications',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/webhook_notifications/{id}',
  operationId: 'get-webhook-notification-id',
};

export const tool: Tool = {
  name: 'retrieve_webhook_notifications',
  description: '\n',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      include: {
        type: 'string',
        description: 'Comma delimited list of relations to include.',
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
  return asTextContentResult(await client.webhookNotifications.retrieve(id, body));
};

export default { metadata, tool, handler };
