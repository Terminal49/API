// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { isJqError, maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asErrorResult, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'ports',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/ports/{id}',
  operationId: 'get-port-id',
};

export const tool: Tool = {
  name: 'retrieve_ports',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nReturn the details of a single port.\n\n# Response Schema\n```json\n{\n  $ref: '#/$defs/port_retrieve_response',\n  $defs: {\n    port_retrieve_response: {\n      type: 'object',\n      properties: {\n        data: {\n          $ref: '#/$defs/port'\n        }\n      }\n    },\n    port: {\n      type: 'object',\n      title: 'Port model',\n      properties: {\n        id: {\n          type: 'string'\n        },\n        type: {\n          type: 'string',\n          enum: [            'port'\n          ]\n        },\n        attributes: {\n          type: 'object',\n          properties: {\n            city: {\n              type: 'string'\n            },\n            code: {\n              type: 'string',\n              description: 'UN/LOCODE'\n            },\n            country_code: {\n              type: 'string',\n              description: '2 digit country code'\n            },\n            latitude: {\n              type: 'number'\n            },\n            longitude: {\n              type: 'number'\n            },\n            name: {\n              type: 'string'\n            },\n            state_abbr: {\n              type: 'string'\n            },\n            time_zone: {\n              type: 'string',\n              description: 'IANA tz'\n            }\n          }\n        }\n      },\n      required: [        'id',\n        'type'\n      ]\n    }\n  }\n}\n```",
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
    return asTextContentResult(await maybeFilter(jq_filter, await client.ports.retrieve(id)));
  } catch (error) {
    if (isJqError(error)) {
      return asErrorResult(error.message);
    }
    throw error;
  }
};

export default { metadata, tool, handler };
