/**
 * Vercel Serverless Function for Terminal49 MCP Server
 * Uses StreamableHTTPServerTransport for MCP protocol
 *
 * Endpoint: POST /api/mcp
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createTerminal49McpServer } from '../mcp-ts/src/server.js';

/**
 * Main handler for Vercel serverless function
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are accepted',
    });
    return;
  }

  try {
    // Extract API token from Authorization header or environment
    const authHeader = req.headers.authorization;
    let apiToken: string;

    if (authHeader?.startsWith('Bearer ')) {
      apiToken = authHeader.substring(7);
    } else if (process.env.T49_API_TOKEN) {
      // Fallback to environment variable
      apiToken = process.env.T49_API_TOKEN;
    } else {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header or T49_API_TOKEN environment variable',
      });
      return;
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Create MCP server
    const server = createTerminal49McpServer(apiToken, process.env.T49_API_BASE_URL);

    // Create a new transport for each request to prevent request ID collisions
    // Different clients may use the same JSON-RPC request IDs
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true, // Return JSON instead of SSE
    });

    // Clean up transport when response closes
    res.on('close', () => {
      transport.close();
    });

    // Connect server to transport and handle request
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP handler error:', error);

    const err = error as Error;
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
          data: err.message,
        },
        id: null,
      });
    }
  }
}
