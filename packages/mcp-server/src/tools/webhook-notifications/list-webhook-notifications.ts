// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'webhook_notifications',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/webhook_notifications',
  operationId: 'get-webhook-notifications',
};

export const tool: Tool = {
  name: 'list_webhook_notifications',
  description:
    'Return the list of  webhook notifications. This can be useful for reconciling your data if your endpoint has been down. ',
  inputSchema: {
    type: 'object',
    properties: {
      include: {
        type: 'string',
        description: 'Comma delimited list of relations to include.',
      },
      'page[number]': {
        type: 'integer',
      },
      'page[size]': {
        type: 'integer',
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
  return asTextContentResult(await client.webhookNotifications.list(body));
};

export default { metadata, tool, handler };
