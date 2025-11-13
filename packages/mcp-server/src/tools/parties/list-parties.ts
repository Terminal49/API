// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { isJqError, maybeFilter } from 'terminal49-mcp/filtering';
import { Metadata, asErrorResult, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'parties',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/parties',
  operationId: 'list-parties',
};

export const tool: Tool = {
  name: 'list_parties',
  description:
    "When using this tool, always use the `jq_filter` parameter to reduce the response size and improve performance.\n\nOnly omit if you're sure you don't need the data.\n\nGet a list of parties\n\n# Response Schema\n```json\n{\n  $ref: '#/$defs/party_list_response',\n  $defs: {\n    party_list_response: {\n      type: 'object',\n      properties: {\n        data: {\n          type: 'array',\n          items: {\n            $ref: '#/$defs/party'\n          }\n        },\n        links: {\n          $ref: '#/$defs/links'\n        },\n        meta: {\n          $ref: '#/$defs/meta'\n        }\n      }\n    },\n    party: {\n      type: 'object',\n      title: 'Party model',\n      properties: {\n        attributes: {\n          type: 'object',\n          properties: {\n            company_name: {\n              type: 'string',\n              description: 'Company name'\n            }\n          },\n          required: [            'company_name'\n          ]\n        },\n        id: {\n          type: 'string'\n        },\n        type: {\n          type: 'string',\n          enum: [            'party'\n          ]\n        }\n      },\n      required: [        'attributes'\n      ]\n    },\n    links: {\n      type: 'object',\n      title: 'links',\n      properties: {\n        first: {\n          type: 'string'\n        },\n        last: {\n          type: 'string'\n        },\n        next: {\n          type: 'string'\n        },\n        prev: {\n          type: 'string'\n        },\n        self: {\n          type: 'string'\n        }\n      }\n    },\n    meta: {\n      type: 'object',\n      title: 'meta',\n      properties: {\n        size: {\n          type: 'integer'\n        },\n        total: {\n          type: 'integer'\n        }\n      }\n    }\n  }\n}\n```",
  inputSchema: {
    type: 'object',
    properties: {
      'page[number]': {
        type: 'integer',
      },
      'page[size]': {
        type: 'integer',
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
  try {
    return asTextContentResult(await maybeFilter(jq_filter, await client.parties.list(body)));
  } catch (error) {
    if (isJqError(error)) {
      return asErrorResult(error.message);
    }
    throw error;
  }
};

export default { metadata, tool, handler };
