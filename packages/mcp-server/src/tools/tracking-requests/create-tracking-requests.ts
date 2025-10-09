// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'tracking_requests',
  operation: 'write',
  tags: [],
  httpMethod: 'post',
  httpPath: '/tracking_requests',
  operationId: 'post-track',
};

export const tool: Tool = {
  name: 'create_tracking_requests',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nTo track an ocean shipment, you create a new tracking request. \nTwo attributes are required to track a shipment. A `bill of lading/booking number` and a shipping line `SCAC`. \n\nOnce a tracking request is created we will attempt to fetch the shipment details and it's related containers from the shipping line. If the attempt is successful we will create in new shipment object including any related container objects. We will send a `tracking_request.succeeded` webhook notification to your webhooks.  \n\nIf the attempt to fetch fails then we will send a `tracking_request.failed` webhook notification to your `webhooks`.  \n\nA `tracking_request.succeeded` or `tracking_request.failed` webhook notificaiton will only be sent  if you have  atleast one active webhook. \n\n# Response Schema\n```json\n{\n  $ref: '#/$defs/tracking_request_create_response',\n  $defs: {\n    tracking_request_create_response: {\n      type: 'object',\n      properties: {\n        data: {\n          $ref: '#/$defs/tracking_request'\n        },\n        included: {\n          type: 'array',\n          items: {\n            anyOf: [              {\n                $ref: '#/$defs/account'\n              },\n              {\n                $ref: '#/$defs/shipping_line'\n              }\n            ]\n          }\n        }\n      }\n    },\n    tracking_request: {\n      type: 'object',\n      title: 'Tracking Request',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        type: {\n          type: 'string',\n          enum: [            'tracking_request'\n          ]\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            created_at: {\n              type: 'string',\n              format: 'date-time'\n            },\n            request_number: {\n              type: 'string'\n            },\n            request_type: {\n              type: 'string',\n              enum: [                'bill_of_lading',\n                'booking_number',\n                'container'\n              ]\n            },\n            scac: {\n              type: 'string'\n            },\n            status: {\n              type: 'string',\n              enum: [                'pending',\n                'awaiting_manifest',\n                'created',\n                'failed',\n                'tracking_stopped'\n              ]\n            },\n            failed_reason: {\n              type: 'string',\n              description: 'If the tracking request has failed, or is currently failing, the last reason we were unable to complete the request',\n              enum: [                'booking_cancelled',\n                'duplicate',\n                'expired',\n                'internal_processing_error',\n                'invalid_number',\n                'not_found',\n                'retries_exhausted',\n                'shipping_line_unreachable',\n                'unrecognized_response',\n                'data_unavailable'\n              ]\n            },\n            is_retrying: {\n              type: 'boolean'\n            },\n            ref_numbers: {\n              type: 'array',\n              items: {\n                type: 'string'\n              }\n            },\n            retry_count: {\n              type: 'integer',\n              description: 'How many times T49 has attempted to get the shipment from the shipping line'\n            },\n            tags: {\n              type: 'array',\n              items: {\n                type: 'string'\n              }\n            },\n            updated_at: {\n              type: 'string',\n              format: 'date-time'\n            }\n          },\n          required: [            'created_at',\n            'request_number',\n            'request_type',\n            'scac',\n            'status'\n          ]\n        },\n        relationships: {\n          type: 'object',\n          properties: {\n            customer: {\n              type: 'object',\n              properties: {\n                data: {\n                  type: 'object',\n                  properties: {\n                    id: {\n                      type: 'string'\n                    },\n                    type: {\n                      type: 'string',\n                      enum: [                        'party'\n                      ]\n                    }\n                  }\n                }\n              }\n            },\n            tracked_object: {\n              type: 'object',\n              properties: {\n                data: {\n                  type: 'object',\n                  properties: {\n                    id: {\n                      type: 'string'\n                    },\n                    type: {\n                      type: 'string',\n                      enum: [                        'shipment'\n                      ]\n                    }\n                  }\n                }\n              }\n            }\n          }\n        }\n      },\n      required: [        'id',\n        'type'\n      ]\n    },\n    account: {\n      type: 'object',\n      title: 'Account model',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            company_name: {\n              type: 'string'\n            }\n          },\n          required: [            'company_name'\n          ]\n        },\n        type: {\n          type: 'string',\n          enum: [            'container'\n          ]\n        }\n      },\n      required: [        'id',\n        'attributes',\n        'type'\n      ]\n    },\n    shipping_line: {\n      type: 'object',\n      title: 'Shipping line model',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            alternative_scacs: {\n              type: 'array',\n              description: 'Additional SCACs which will be accepted in tracking requests',\n              items: {\n                type: 'string'\n              }\n            },\n            bill_of_lading_tracking_support: {\n              type: 'boolean'\n            },\n            booking_number_tracking_support: {\n              type: 'boolean'\n            },\n            container_number_tracking_support: {\n              type: 'boolean'\n            },\n            name: {\n              type: 'string'\n            },\n            scac: {\n              type: 'string'\n            },\n            short_name: {\n              type: 'string'\n            }\n          },\n          required: [            'alternative_scacs',\n            'bill_of_lading_tracking_support',\n            'booking_number_tracking_support',\n            'container_number_tracking_support',\n            'name',\n            'scac',\n            'short_name'\n          ]\n        },\n        type: {\n          type: 'string',\n          enum: [            'shipping_line'\n          ]\n        }\n      },\n      required: [        'id',\n        'attributes',\n        'type'\n      ]\n    }\n  }\n}\n```",
  inputSchema: {
    type: 'object',
    properties: {
      data: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['tracking_request'],
          },
          attributes: {
            type: 'object',
            properties: {
              request_number: {
                type: 'string',
              },
              request_type: {
                type: 'string',
                description:
                  ' The type of document number to be supplied. Container number support is currently in BETA.',
                enum: ['bill_of_lading', 'booking_number', 'container'],
              },
              scac: {
                type: 'string',
              },
              ref_numbers: {
                type: 'array',
                description:
                  'Optional list of reference numbers to be added to the shipment when tracking request completes',
                items: {
                  type: 'string',
                },
              },
              shipment_tags: {
                type: 'array',
                description:
                  'Optional list of tags to be added to the shipment when tracking request completes',
                items: {
                  type: 'string',
                },
              },
            },
            required: ['request_number', 'request_type', 'scac'],
          },
          relationships: {
            type: 'object',
            properties: {
              customer: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      id: {
                        type: 'string',
                      },
                      type: {
                        type: 'string',
                        enum: ['party'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
        required: ['type'],
      },
      jq_filter: {
        type: 'string',
        title: 'jq Filter',
        description:
          'A jq filter to apply to the response to include certain fields. Consult the output schema in the tool description to see the fields that are available.\n\nFor example: to include only the `name` field in every object of a results array, you can provide ".results[].name".\n\nFor more information, see the [jq documentation](https://jqlang.org/manual/).',
      },
    },
    required: [],
  },
  annotations: {},
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { jq_filter, ...body } = args as any;
  return asTextContentResult(await maybeFilter(jq_filter, await client.trackingRequests.create(body)));
};

export default { metadata, tool, handler };
