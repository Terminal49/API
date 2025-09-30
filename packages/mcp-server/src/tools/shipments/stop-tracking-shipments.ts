// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'shipments',
  operation: 'write',
  tags: [],
  httpMethod: 'patch',
  httpPath: '/shipments/{id}/stop_tracking',
  operationId: 'patch-shipments-id-stop-tracking',
};

export const tool: Tool = {
  name: 'stop_tracking_shipments',
  description:
    "We'll stop tracking the shipment, which means that there will be no more updates.  You can still access the shipment's previously-collected information via the API or dashboard.\n\nYou can resume tracking a shipment by calling the `resume_tracking` endpoint, but keep in mind that some information is only made available by our data sources at specific times, so a stopped and resumed shipment may have some information missing.",
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
    },
    required: ['id'],
  },
  annotations: {},
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { id, ...body } = args as any;
  return asTextContentResult(await client.shipments.stopTracking(id));
};

export default { metadata, tool, handler };
