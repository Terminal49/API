// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { Metadata, asTextContentResult } from 'terminal49-mcp/tools/types';

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import Terminal49 from 'terminal49';

export const metadata: Metadata = {
  resource: 'shipments',
  operation: 'read',
  tags: [],
  httpMethod: 'get',
  httpPath: '/shipments',
  operationId: 'get-shipments',
};

export const tool: Tool = {
  name: 'list_shipments',
  description:
    'Returns a list of your shipments. The shipments are returned sorted by creation date, with the most recent shipments appearing first.\n\nThis api will return all shipments associated with the account. Shipments created via the `tracking_request` API aswell as the ones added via the dashboard will be retuned via this endpoint. ',
  inputSchema: {
    type: 'object',
    properties: {
      include: {
        type: 'string',
        description: 'Comma delimited list of relations to include',
      },
      number: {
        type: 'string',
        description: 'Search shipments by the original request tracking `request_number`',
      },
      'page[number]': {
        type: 'integer',
        description: '\n',
      },
      'page[size]': {
        type: 'integer',
        description: '\n',
      },
      q: {
        type: 'string',
        description: '\nSearch shipments by master bill of lading, reference number, or container number.',
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: true,
  },
};

export const handler = async (client: Terminal49, args: Record<string, unknown> | undefined) => {
  const body = args as any;
  return asTextContentResult(await client.shipments.list(body));
};

export default { metadata, tool, handler };
