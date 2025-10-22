/**
 * Vercel Serverless Function for Terminal49 MCP Server
 * Handles HTTP transport for MCP protocol
 *
 * Endpoint: POST /api/mcp
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  JSONRPCRequest,
  JSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { Terminal49Client } from '../mcp-ts/src/client.js';
import { getContainerTool, executeGetContainer } from '../mcp-ts/src/tools/get-container.js';
import { trackContainerTool, executeTrackContainer } from '../mcp-ts/src/tools/track-container.js';
import { searchContainerTool, executeSearchContainer } from '../mcp-ts/src/tools/search-container.js';
import {
  containerResource,
  matchesContainerUri,
  readContainerResource,
} from '../mcp-ts/src/resources/container.js';

// CORS headers for MCP clients
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

/**
 * Main handler for Vercel serverless function
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are accepted',
    });
  }

  try {
    // Extract API token from Authorization header
    const authHeader = req.headers.authorization;
    let apiToken: string;

    if (authHeader?.startsWith('Bearer ')) {
      apiToken = authHeader.substring(7);
    } else if (process.env.T49_API_TOKEN) {
      // Fallback to environment variable
      apiToken = process.env.T49_API_TOKEN;
    } else {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header or T49_API_TOKEN environment variable',
      });
    }

    // Parse JSON-RPC request
    const mcpRequest = req.body as JSONRPCRequest;

    if (!mcpRequest || !mcpRequest.method) {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32600,
          message: 'Invalid Request',
        },
        id: null,
      });
    }

    // Create Terminal49 client
    const client = new Terminal49Client({
      apiToken,
      apiBaseUrl: process.env.T49_API_BASE_URL,
    });

    // Handle MCP request
    const response = await handleMcpRequest(mcpRequest, client);

    return res.status(200).json(response);
  } catch (error) {
    console.error('MCP handler error:', error);

    const err = error as Error;
    return res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error',
        data: err.message,
      },
      id: (req.body as any)?.id || null,
    });
  }
}

/**
 * Handle MCP JSON-RPC requests
 */
async function handleMcpRequest(
  request: JSONRPCRequest,
  client: Terminal49Client
): Promise<JSONRPCResponse> {
  const { method, params, id } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: 'terminal49-mcp',
              version: '0.1.0',
            },
          },
          id,
        };

      case 'tools/list':
        return {
          jsonrpc: '2.0',
          result: {
            tools: [searchContainerTool, trackContainerTool, getContainerTool],
          },
          id,
        };

      case 'tools/call': {
        const { name, arguments: args } = params as any;

        if (name === 'search_container') {
          const result = await executeSearchContainer(args, client);
          return {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
            id,
          };
        }

        if (name === 'track_container') {
          const result = await executeTrackContainer(args, client);
          return {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
            id,
          };
        }

        if (name === 'get_container') {
          const result = await executeGetContainer(args, client);
          return {
            jsonrpc: '2.0',
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
            id,
          };
        }

        throw new Error(`Unknown tool: ${name}`);
      }

      case 'resources/list':
        return {
          jsonrpc: '2.0',
          result: {
            resources: [containerResource],
          },
          id,
        };

      case 'resources/read': {
        const { uri } = params as any;

        if (matchesContainerUri(uri)) {
          const resource = await readContainerResource(uri, client);
          return {
            jsonrpc: '2.0',
            result: {
              contents: [resource],
            },
            id,
          };
        }

        throw new Error(`Unknown resource URI: ${uri}`);
      }

      default:
        return {
          jsonrpc: '2.0',
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
          id,
        };
    }
  } catch (error) {
    const err = error as Error;
    return {
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: err.message,
        data: err.name,
      },
      id,
    };
  }
}
