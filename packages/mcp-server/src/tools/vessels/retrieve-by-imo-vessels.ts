// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'vessels',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/vessels/{imo}',
  operationId: 'get-vessels-imo',
};

export const tool: Tool = {
  name: 'retrieve_by_imo_vessels',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nReturns a vessel by the given IMO number.\n\n# Response Schema\n```json\n{\n  type: 'object',\n  properties: {\n    data: {\n      $ref: '#/$defs/vessel'\n    }\n  },\n  $defs: {\n    vessel: {\n      type: 'object',\n      title: 'vessel',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            imo: {\n              type: 'string',\n              description: 'International Maritime Organization (IMO) number'\n            },\n            latitude: {\n              type: 'number',\n              description: 'The current latitude position of the vessel'\n            },\n            longitude: {\n              type: 'number',\n              description: 'The current longitude position of the vessel'\n            },\n            mmsi: {\n              type: 'string',\n              description: 'Maritime Mobile Service Identity (MMSI)'\n            },\n            name: {\n              type: 'string',\n              description: 'The name of the ship or vessel'\n            },\n            nautical_speed_knots: {\n              type: 'number',\n              description: 'The current speed of the ship in knots (nautical miles per hour)'\n            },\n            navigational_heading_degrees: {\n              type: 'number',\n              description: 'The current heading of the ship in degrees, where 0 is North, 90 is East, 180 is South, and 270 is West'\n            },\n            position_timestamp: {\n              type: 'string',\n              description: 'The timestamp of when the ship\\'s position was last recorded, in ISO 8601 date and time format'\n            }\n          }\n        },\n        type: {\n          type: 'string',\n          enum: [            'vessel'\n          ]\n        }\n      }\n    }\n  }\n}\n```",
  inputSchema: {
    type: 'object',
    properties: {
      imo: {
        type: 'string',
      },
      jq_filter: {
        type: 'string',
        title: 'jq Filter',
        description:
          'A jq filter to apply to the response to include certain fields. Consult the output schema in the tool description to see the fields that are available.\n\nFor example: to include only the `name` field in every object of a results array, you can provide ".results[].name".\n\nFor more information, see the [jq documentation](https://jqlang.org/manual/).',
      },
    },
    required: ['imo'],
  },
  annotations: {
    readOnlyHint: true,
  },
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const { imo, jq_filter, ...body } = args as any;
  return asTextContentResult(await maybeFilter(jq_filter, await client.vessels.retrieveByImo(imo)));
};

export default { metadata, tool, handler };
