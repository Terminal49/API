// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'tracking_requests',
  operation: 'write',
  tags: [],
  httpMethod: 'patch',
  httpPath: '/tracking_requests/{id}',
  operationId: 'patch-track-request-by-id',
};

export const tool: Tool = {
  name: 'update_tracking_requests',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nUpdate a tracking request\n\n# Response Schema\n```json\n{\n  $ref: '#/$defs/tracking_request_update_response',\n  $defs: {\n    tracking_request_update_response: {\n      type: 'object',\n      properties: {\n        data: {\n          $ref: '#/$defs/tracking_request'\n        }\n      }\n    },\n    tracking_request: {\n      type: 'object',\n      title: 'Tracking Request',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        type: {\n          type: 'string',\n          enum: [            'tracking_request'\n          ]\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            created_at: {\n              type: 'string',\n              format: 'date-time'\n            },\n            request_number: {\n              type: 'string'\n            },\n            request_type: {\n              type: 'string',\n              enum: [                'bill_of_lading',\n                'booking_number',\n                'container'\n              ]\n            },\n            scac: {\n              type: 'string'\n            },\n            status: {\n              type: 'string',\n              enum: [                'pending',\n                'awaiting_manifest',\n                'created',\n                'failed',\n                'tracking_stopped'\n              ]\n            },\n            failed_reason: {\n              type: 'string',\n              description: 'If the tracking request has failed, or is currently failing, the last reason we were unable to complete the request',\n              enum: [                'booking_cancelled',\n                'duplicate',\n                'expired',\n                'internal_processing_error',\n                'invalid_number',\n                'not_found',\n                'retries_exhausted',\n                'shipping_line_unreachable',\n                'unrecognized_response',\n                'data_unavailable'\n              ]\n            },\n            is_retrying: {\n              type: 'boolean'\n            },\n            ref_numbers: {\n              type: 'array',\n              items: {\n                type: 'string'\n              }\n            },\n            retry_count: {\n              type: 'integer',\n              description: 'How many times T49 has attempted to get the shipment from the shipping line'\n            },\n            tags: {\n              type: 'array',\n              items: {\n                type: 'string'\n              }\n            },\n            updated_at: {\n              type: 'string',\n              format: 'date-time'\n            }\n          },\n          required: [            'created_at',\n            'request_number',\n            'request_type',\n            'scac',\n            'status'\n          ]\n        },\n        relationships: {\n          type: 'object',\n          properties: {\n            customer: {\n              type: 'object',\n              properties: {\n                data: {\n                  type: 'object',\n                  properties: {\n                    id: {\n                      type: 'string'\n                    },\n                    type: {\n                      type: 'string',\n                      enum: [                        'party'\n                      ]\n                    }\n                  }\n                }\n              }\n            },\n            tracked_object: {\n              type: 'object',\n              properties: {\n                data: {\n                  type: 'object',\n                  properties: {\n                    id: {\n                      type: 'string'\n                    },\n                    type: {\n                      type: 'string',\n                      enum: [                        'shipment'\n                      ]\n                    }\n                  }\n                }\n              }\n            }\n          }\n        }\n      },\n      required: [        'id',\n        'type'\n      ]\n    }\n  }\n}\n```",
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
              ref_number: {
                type: 'string',
                description: 'Tracking request ref number.',
              },
            },
          },
        },
        required: ['attributes'],
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
  annotations: {},
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { id, jq_filter, ...body } = args as any;
  return asTextContentResult(await maybeFilter(jq_filter, await client.trackingRequests.update(id, body)));
};

export default { metadata, tool, handler };
