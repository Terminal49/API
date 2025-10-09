// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'tracking_requests',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/tracking_requests',
  operationId: 'get-tracking-requests',
};

export const tool: Tool = {
  name: 'list_tracking_requests',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nReturns a list of your tracking requests. The tracking requests are returned sorted by creation date, with the most recent tracking request appearing first.\n\n# Response Schema\n```json\n{\n  $ref: '#/$defs/tracking_request_list_response',\n  $defs: {\n    tracking_request_list_response: {\n      type: 'object',\n      properties: {\n        data: {\n          type: 'array',\n          items: {\n            $ref: '#/$defs/tracking_request'\n          }\n        },\n        included: {\n          type: 'array',\n          items: {\n            anyOf: [              {\n                $ref: '#/$defs/account'\n              },\n              {\n                $ref: '#/$defs/shipping_line'\n              },\n              {\n                type: 'object',\n                properties: {\n                  id: {\n                    type: 'string'\n                  },\n                  links: {\n                    type: 'object',\n                    properties: {\n                      self: {\n                        type: 'string'\n                      }\n                    }\n                  },\n                  type: {\n                    type: 'string',\n                    enum: [                      'shipment'\n                    ]\n                  }\n                }\n              }\n            ]\n          }\n        },\n        links: {\n          $ref: '#/$defs/links'\n        },\n        meta: {\n          $ref: '#/$defs/meta'\n        }\n      }\n    },\n    tracking_request: {\n      type: 'object',\n      title: 'Tracking Request',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        type: {\n          type: 'string',\n          enum: [            'tracking_request'\n          ]\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            created_at: {\n              type: 'string',\n              format: 'date-time'\n            },\n            request_number: {\n              type: 'string'\n            },\n            request_type: {\n              type: 'string',\n              enum: [                'bill_of_lading',\n                'booking_number',\n                'container'\n              ]\n            },\n            scac: {\n              type: 'string'\n            },\n            status: {\n              type: 'string',\n              enum: [                'pending',\n                'awaiting_manifest',\n                'created',\n                'failed',\n                'tracking_stopped'\n              ]\n            },\n            failed_reason: {\n              type: 'string',\n              description: 'If the tracking request has failed, or is currently failing, the last reason we were unable to complete the request',\n              enum: [                'booking_cancelled',\n                'duplicate',\n                'expired',\n                'internal_processing_error',\n                'invalid_number',\n                'not_found',\n                'retries_exhausted',\n                'shipping_line_unreachable',\n                'unrecognized_response',\n                'data_unavailable'\n              ]\n            },\n            is_retrying: {\n              type: 'boolean'\n            },\n            ref_numbers: {\n              type: 'array',\n              items: {\n                type: 'string'\n              }\n            },\n            retry_count: {\n              type: 'integer',\n              description: 'How many times T49 has attempted to get the shipment from the shipping line'\n            },\n            tags: {\n              type: 'array',\n              items: {\n                type: 'string'\n              }\n            },\n            updated_at: {\n              type: 'string',\n              format: 'date-time'\n            }\n          },\n          required: [            'created_at',\n            'request_number',\n            'request_type',\n            'scac',\n            'status'\n          ]\n        },\n        relationships: {\n          type: 'object',\n          properties: {\n            customer: {\n              type: 'object',\n              properties: {\n                data: {\n                  type: 'object',\n                  properties: {\n                    id: {\n                      type: 'string'\n                    },\n                    type: {\n                      type: 'string',\n                      enum: [                        'party'\n                      ]\n                    }\n                  }\n                }\n              }\n            },\n            tracked_object: {\n              type: 'object',\n              properties: {\n                data: {\n                  type: 'object',\n                  properties: {\n                    id: {\n                      type: 'string'\n                    },\n                    type: {\n                      type: 'string',\n                      enum: [                        'shipment'\n                      ]\n                    }\n                  }\n                }\n              }\n            }\n          }\n        }\n      },\n      required: [        'id',\n        'type'\n      ]\n    },\n    account: {\n      type: 'object',\n      title: 'Account model',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            company_name: {\n              type: 'string'\n            }\n          },\n          required: [            'company_name'\n          ]\n        },\n        type: {\n          type: 'string',\n          enum: [            'container'\n          ]\n        }\n      },\n      required: [        'id',\n        'attributes',\n        'type'\n      ]\n    },\n    shipping_line: {\n      type: 'object',\n      title: 'Shipping line model',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            alternative_scacs: {\n              type: 'array',\n              description: 'Additional SCACs which will be accepted in tracking requests',\n              items: {\n                type: 'string'\n              }\n            },\n            bill_of_lading_tracking_support: {\n              type: 'boolean'\n            },\n            booking_number_tracking_support: {\n              type: 'boolean'\n            },\n            container_number_tracking_support: {\n              type: 'boolean'\n            },\n            name: {\n              type: 'string'\n            },\n            scac: {\n              type: 'string'\n            },\n            short_name: {\n              type: 'string'\n            }\n          },\n          required: [            'alternative_scacs',\n            'bill_of_lading_tracking_support',\n            'booking_number_tracking_support',\n            'container_number_tracking_support',\n            'name',\n            'scac',\n            'short_name'\n          ]\n        },\n        type: {\n          type: 'string',\n          enum: [            'shipping_line'\n          ]\n        }\n      },\n      required: [        'id',\n        'attributes',\n        'type'\n      ]\n    },\n    links: {\n      type: 'object',\n      title: 'links',\n      properties: {\n        first: {\n          type: 'string'\n        },\n        last: {\n          type: 'string'\n        },\n        next: {\n          type: 'string'\n        },\n        prev: {\n          type: 'string'\n        },\n        self: {\n          type: 'string'\n        }\n      }\n    },\n    meta: {\n      type: 'object',\n      title: 'meta',\n      properties: {\n        size: {\n          type: 'integer'\n        },\n        total: {\n          type: 'integer'\n        }\n      }\n    }\n  }\n}\n```",
  inputSchema: {
    type: 'object',
    properties: {
      'filter[created_at][end]': {
        type: 'string',
        description: 'filter by tracking_requests `created_at` before a certain ISO8601 timestamp',
        format: 'date-time',
      },
      'filter[created_at][start]': {
        type: 'string',
        description: 'filter by tracking_requests `created_at` after a certain ISO8601 timestamp',
        format: 'date-time',
      },
      'filter[request_number]': {
        type: 'string',
        description: 'filter by `request_number`',
      },
      'filter[scac]': {
        type: 'string',
        description: 'filter by shipping line `scac`',
      },
      'filter[status]': {
        type: 'string',
        description: 'filter by `status`',
        enum: ['created', 'pending', 'failed'],
      },
      include: {
        type: 'string',
        description: "Comma delimited list of relations to include. 'tracked_object' is included by default.",
      },
      'page[number]': {
        type: 'integer',
      },
      'page[size]': {
        type: 'integer',
      },
      q: {
        type: 'string',
        description: 'A search term to be applied against request_number and reference_numbers.',
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
  annotations: {
    readOnlyHint: true,
  },
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { jq_filter, ...body } = args as any;
  return asTextContentResult(await maybeFilter(jq_filter, await client.trackingRequests.list(body)));
};

export default { metadata, tool, handler };
