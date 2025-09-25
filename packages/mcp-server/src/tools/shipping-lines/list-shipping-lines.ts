// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'shipping_lines',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/shipping_lines',
  operationId: 'get-shipping_lines',
};

export const tool: Tool = {
  name: 'list_shipping_lines',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nReturn a list of shipping lines supported by Terminal49. \nN.B. There is no pagination for this endpoint.\n\n# Response Schema\n```json\n{\n  type: 'object',\n  properties: {\n    data: {\n      type: 'array',\n      items: {\n        $ref: '#/$defs/shipping_line'\n      }\n    },\n    links: {\n      $ref: '#/$defs/links'\n    }\n  },\n  $defs: {\n    shipping_line: {\n      type: 'object',\n      title: 'Shipping line model',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            alternative_scacs: {\n              type: 'array',\n              description: 'Additional SCACs which will be accepted in tracking requests',\n              items: {\n                type: 'string'\n              }\n            },\n            bill_of_lading_tracking_support: {\n              type: 'boolean'\n            },\n            booking_number_tracking_support: {\n              type: 'boolean'\n            },\n            container_number_tracking_support: {\n              type: 'boolean'\n            },\n            name: {\n              type: 'string'\n            },\n            scac: {\n              type: 'string'\n            },\n            short_name: {\n              type: 'string'\n            }\n          },\n          required: [            'alternative_scacs',\n            'bill_of_lading_tracking_support',\n            'booking_number_tracking_support',\n            'container_number_tracking_support',\n            'name',\n            'scac',\n            'short_name'\n          ]\n        },\n        type: {\n          type: 'string',\n          enum: [            'shipping_line'\n          ]\n        }\n      },\n      required: [        'id',\n        'attributes',\n        'type'\n      ]\n    },\n    links: {\n      type: 'object',\n      title: 'links',\n      properties: {\n        first: {\n          type: 'string'\n        },\n        last: {\n          type: 'string'\n        },\n        next: {\n          type: 'string'\n        },\n        prev: {\n          type: 'string'\n        },\n        self: {\n          type: 'string'\n        }\n      }\n    }\n  }\n}\n```",
  inputSchema: {
    type: 'object',
    properties: {
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
  const { jq_filter } = args as any;
  return asTextContentResult(await maybeFilter(jq_filter, await client.shippingLines.list()));
};

export default { metadata, tool, handler };
