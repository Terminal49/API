// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'containers',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/containers/{id}/transport_events',
  operationId: 'get-containers-id-transport_events',
};

export const tool: Tool = {
  name: 'get_transport_events_containers',
  description:
    'Get a list of past transport events (canonical) for a container. All data has been normalized across all carriers. These are a verified subset of the raw events may also be sent as Webhook Notifications to a webhook endpoint.\n\nThis does not provide any estimated future events. See `container/:id/raw_events` endpoint for that.  ',
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
  return asTextContentResult(await client.containers.getTransportEvents(id, body));
};

export default { metadata, tool, handler };
