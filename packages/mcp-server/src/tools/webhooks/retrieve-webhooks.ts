// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { isJqError, maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asErrorResult, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'webhooks',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/webhooks/{id}',
  operationId: 'get-webhooks-id',
};

export const tool: Tool = {
  name: 'retrieve_webhooks',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nGet the details of a single webhook\n\n# Response Schema\n```json\n{\n  $ref: '#/$defs/webhook_retrieve_response',\n  $defs: {\n    webhook_retrieve_response: {\n      type: 'object',\n      properties: {\n        data: {\n          $ref: '#/$defs/webhook'\n        }\n      }\n    },\n    webhook: {\n      type: 'object',\n      title: 'webhook',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        type: {\n          type: 'string',\n          enum: [            'webhook'\n          ]\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            active: {\n              type: 'boolean',\n              description: 'Whether the webhook will be delivered when events are triggered'\n            },\n            events: {\n              type: 'array',\n              description: 'The list of events to enabled for this endpoint',\n              items: {\n                type: 'string',\n                enum: [                  'container.transport.vessel_arrived',\n                  'container.transport.vessel_discharged',\n                  'container.transport.vessel_loaded',\n                  'container.transport.vessel_departed',\n                  'container.transport.rail_departed',\n                  'container.transport.rail_arrived',\n                  'container.transport.rail_loaded',\n                  'container.transport.rail_unloaded',\n                  'container.transport.transshipment_arrived',\n                  'container.transport.transshipment_discharged',\n                  'container.transport.transshipment_loaded',\n                  'container.transport.transshipment_departed',\n                  'container.transport.feeder_arrived',\n                  'container.transport.feeder_discharged',\n                  'container.transport.feeder_loaded',\n                  'container.transport.feeder_departed',\n                  'container.transport.empty_out',\n                  'container.transport.full_in',\n                  'container.transport.full_out',\n                  'container.transport.empty_in',\n                  'container.transport.vessel_berthed',\n                  'shipment.estimated.arrival',\n                  'tracking_request.succeeded',\n                  'tracking_request.failed',\n                  'tracking_request.awaiting_manifest',\n                  'tracking_request.tracking_stopped',\n                  'container.created',\n                  'container.updated',\n                  'container.pod_terminal_changed',\n                  'container.transport.arrived_at_inland_destination',\n                  'container.transport.estimated.arrived_at_inland_destination',\n                  'container.pickup_lfd.changed'\n                ]\n              }\n            },\n            secret: {\n              type: 'string',\n              description: 'A random token that will sign all delivered webhooks'\n            },\n            url: {\n              type: 'string',\n              description: 'https end point'\n            },\n            headers: {\n              type: 'array',\n              items: {\n                type: 'object',\n                properties: {\n                  name: {\n                    type: 'string'\n                  },\n                  value: {\n                    type: 'string'\n                  }\n                }\n              }\n            }\n          },\n          required: [            'active',\n            'events',\n            'secret',\n            'url'\n          ]\n        }\n      },\n      required: [        'id',\n        'type'\n      ]\n    }\n  }\n}\n```",
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
      },
      jq_filter: {
        type: 'string',
        title: 'jq Filter',
        description:
          'A jq filter to apply to the response to include certain fields. Consult the output schema in the tool description to see the fields that are available.\n\nFor example: to include only the `name` field in every object of a results array, you can provide ".results[].name".\n\nFor more information, see the [jq documentation](https://jqlang.org/manual/).',
      },
    },
    required: ['id'],
  },
  annotations: {
    readOnlyHint: true,
  },
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { id, jq_filter, ...body } = args as any;
  try {
    return asTextContentResult(await maybeFilter(jq_filter, await client.webhooks.retrieve(id)));
  } catch (error) {
    if (isJqError(error)) {
      return asErrorResult(error.message);
    }
    throw error;
  }
};

export default { metadata, tool, handler };
