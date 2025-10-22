/**
 * Terminal49 MCP Server
 * Implementation using @modelcontextprotocol/sdk v0.5.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Terminal49Client } from './client.js';
import { getContainerTool, executeGetContainer } from './tools/get-container.js';
import { trackContainerTool, executeTrackContainer } from './tools/track-container.js';
import { searchContainerTool, executeSearchContainer } from './tools/search-container.js';
import { getShipmentDetailsTool, executeGetShipmentDetails } from './tools/get-shipment-details.js';
import {
  getContainerTransportEventsTool,
  executeGetContainerTransportEvents,
} from './tools/get-container-transport-events.js';
import {
  getSupportedShippingLinesTool,
  executeGetSupportedShippingLines,
} from './tools/get-supported-shipping-lines.js';
import { getContainerRouteTool, executeGetContainerRoute } from './tools/get-container-route.js';
import {
  containerResource,
  matchesContainerUri,
  readContainerResource,
} from './resources/container.js';
import {
  milestoneGlossaryResource,
  matchesMilestoneGlossaryUri,
  readMilestoneGlossaryResource,
} from './resources/milestone-glossary.js';

export class Terminal49McpServer {
  private server: Server;
  private client: Terminal49Client;

  constructor(apiToken: string, apiBaseUrl?: string) {
    this.client = new Terminal49Client({ apiToken, apiBaseUrl });
    this.server = new Server(
      {
        name: 'terminal49-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        searchContainerTool,
        trackContainerTool,
        getContainerTool,
        getShipmentDetailsTool,
        getContainerTransportEventsTool,
        getSupportedShippingLinesTool,
        getContainerRouteTool,
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'search_container': {
            const result = await executeSearchContainer(args as any, this.client);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'track_container': {
            const result = await executeTrackContainer(args as any, this.client);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_container': {
            const result = await executeGetContainer(args as any, this.client);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_shipment_details': {
            const result = await executeGetShipmentDetails(args as any, this.client);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_container_transport_events': {
            const result = await executeGetContainerTransportEvents(args as any, this.client);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_supported_shipping_lines': {
            const result = await executeGetSupportedShippingLines(args as any);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'get_container_route': {
            const result = await executeGetContainerRoute(args as any, this.client);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const err = error as Error;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: err.name,
                message: err.message,
              }),
            },
          ],
          isError: true,
        };
      }
    });

    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [containerResource, milestoneGlossaryResource],
    }));

    // Read resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        if (matchesContainerUri(uri)) {
          const resource = await readContainerResource(uri, this.client);
          return {
            contents: [resource],
          };
        }

        if (matchesMilestoneGlossaryUri(uri)) {
          const resource = readMilestoneGlossaryResource();
          return {
            contents: [resource],
          };
        }

        throw new Error(`Unknown resource URI: ${uri}`);
      } catch (error) {
        const err = error as Error;
        throw new Error(`Failed to read resource: ${err.message}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('Terminal49 MCP Server v1.0.0 running on stdio');
    console.error('Available tools: 7 | Resources: 2');
  }

  getServer(): Server {
    return this.server;
  }
}
