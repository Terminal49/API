/**
 * Terminal49 MCP Server
 * Main server implementation using @modelcontextprotocol/sdk
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
import {
  containerResource,
  matchesContainerUri,
  readContainerResource,
} from './resources/container.js';

export class Terminal49McpServer {
  private server: Server;
  private client: Terminal49Client;

  constructor(apiToken: string, apiBaseUrl?: string) {
    this.client = new Terminal49Client({ apiToken, apiBaseUrl });
    this.server = new Server(
      {
        name: 'terminal49-mcp',
        version: '0.1.0',
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
      tools: [getContainerTool],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
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
      resources: [containerResource],
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

    console.error('Terminal49 MCP Server running on stdio');
  }

  getServer(): Server {
    return this.server;
  }
}
