// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'parties',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/parties/{id}',
  operationId: 'get-parties-id',
};

export const tool: Tool = {
  name: 'retrieve_parties',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nReturns a party by it's given identifier\n\n# Response Schema\n```json\n{\n  $ref: '#/$defs/party_retrieve_response',\n  $defs: {\n    party_retrieve_response: {\n      type: 'object',\n      properties: {\n        data: {\n          $ref: '#/$defs/party'\n        },\n        links: {\n          $ref: '#/$defs/link_self'\n        }\n      }\n    },\n    party: {\n      type: 'object',\n      title: 'Party model',\n      properties: {\n        attributes: {\n          type: 'object',\n          properties: {\n            company_name: {\n              type: 'string',\n              description: 'Company name'\n            }\n          },\n          required: [            'company_name'\n          ]\n        },\n        id: {\n          type: 'string'\n        },\n        type: {\n          type: 'string',\n          enum: [            'party'\n          ]\n        }\n      },\n      required: [        'attributes'\n      ]\n    },\n    link_self: {\n      type: 'object',\n      title: 'link',\n      properties: {\n        self: {\n          type: 'string'\n        }\n      }\n    }\n  }\n}\n```",
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
  return asTextContentResult(await maybeFilter(jq_filter, await client.parties.retrieve(id)));
};

export default { metadata, tool, handler };
