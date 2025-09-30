// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'terminals',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/terminals/{id}',
  operationId: 'get-terminal-id',
};

export const tool: Tool = {
  name: 'retrieve_terminals',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nReturn the details of a single terminal.\n\n# Response Schema\n```json\n{\n  type: 'object',\n  properties: {\n    data: {\n      $ref: '#/$defs/terminal'\n    }\n  },\n  $defs: {\n    terminal: {\n      type: 'object',\n      title: 'Terminal model',\n      properties: {\n        attributes: {\n          type: 'object',\n          properties: {\n            name: {\n              type: 'string'\n            },\n            bic_facility_code: {\n              type: 'string',\n              description: 'BIC Facility Code'\n            },\n            city: {\n              type: 'string',\n              description: 'City part of the address'\n            },\n            country: {\n              type: 'string',\n              description: 'Country part of the address'\n            },\n            firms_code: {\n              type: 'string',\n              description: 'CBP FIRMS Code or CBS Sublocation Code'\n            },\n            nickname: {\n              type: 'string'\n            },\n            smdg_code: {\n              type: 'string',\n              description: 'SMDG Code'\n            },\n            state: {\n              type: 'string',\n              description: 'State part of the address'\n            },\n            state_abbr: {\n              type: 'string',\n              description: 'State abbreviation for the state'\n            },\n            street: {\n              type: 'string',\n              description: 'Street part of the address'\n            },\n            zip: {\n              type: 'string',\n              description: 'ZIP code part of the address'\n            }\n          },\n          required: [            'name'\n          ]\n        },\n        relationships: {\n          type: 'object',\n          properties: {\n            port: {\n              type: 'object',\n              properties: {\n                data: {\n                  type: 'object',\n                  properties: {\n                    id: {\n                      type: 'string'\n                    },\n                    type: {\n                      type: 'string',\n                      enum: [                        'port'\n                      ]\n                    }\n                  }\n                }\n              }\n            }\n          },\n          required: [            'port'\n          ]\n        },\n        id: {\n          type: 'string'\n        },\n        type: {\n          type: 'string',\n          enum: [            'terminal'\n          ]\n        }\n      },\n      required: [        'attributes',\n        'relationships'\n      ]\n    }\n  }\n}\n```",
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
  return asTextContentResult(await maybeFilter(jq_filter, await client.terminals.retrieve(id)));
};

export default { metadata, tool, handler };
