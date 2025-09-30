// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'webhook_notifications',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/webhook_notifications/examples',
  operationId: 'get-webhook-notifications-example',
};

export const tool: Tool = {
  name: 'get_examples_webhook_notifications',
  description:
    'Returns an example payload as it would be sent to a webhook endpoint for the provided `event` ',
  inputSchema: {
    type: 'object',
    properties: {
      event: {
        type: 'string',
        description: 'The webhook notification event name you wish to see an example of',
        enum: [
          'container.transport.vessel_arrived',
          'container.transport.vessel_discharged',
          'container.transport.vessel_loaded',
          'container.transport.vessel_departed',
          'container.transport.rail_departed',
          'container.transport.rail_arrived',
          'container.transport.rail_loaded',
          'container.transport.rail_unloaded',
          'container.transport.transshipment_arrived',
          'container.transport.transshipment_discharged',
          'container.transport.transshipment_loaded',
          'container.transport.transshipment_departed',
          'container.transport.feeder_arrived',
          'container.transport.feeder_discharged',
          'container.transport.feeder_loaded',
          'container.transport.feeder_departed',
          'container.transport.empty_out',
          'container.transport.full_in',
          'container.transport.full_out',
          'container.transport.empty_in',
          'container.transport.vessel_berthed',
          'shipment.estimated.arrival',
          'tracking_request.succeeded',
          'tracking_request.failed',
          'tracking_request.awaiting_manifest',
          'tracking_request.tracking_stopped',
          'container.created',
          'container.updated',
          'container.pod_terminal_changed',
          'container.transport.arrived_at_inland_destination',
          'container.transport.estimated.arrived_at_inland_destination',
          'container.pickup_lfd.changed',
        ],
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
  return asTextContentResult(await client.webhookNotifications.getExamples(body));
};

export default { metadata, tool, handler };
