/**
 * Vercel Serverless Function for Terminal49 MCP Server (SSE Transport)
 * Uses SSEServerTransport for real-time streaming
 *
 * SSE Protocol:
 * - GET /sse: Establishes SSE connection (client receives events)
 * - POST /sse: Client sends JSON-RPC messages
 *
 * Endpoint: GET/POST /sse
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createTerminal49McpServer } from '../packages/mcp/src/server.js';

// Store active transports per session (in-memory, limited for serverless)
const activeTransports = new Map<string, { transport: SSEServerTransport; server: any }>();

/**
 * SSE handler for Vercel serverless function
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

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

  try {
    if (req.method === 'GET') {
      // ===== GET: Establish SSE Connection =====

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Create MCP server
      const server = createTerminal49McpServer(apiToken, process.env.T49_API_BASE_URL);

      // Create SSE transport
      const transport = new SSEServerTransport('/sse', res);

      // Store transport by session ID for POST requests
      activeTransports.set(transport.sessionId, { transport, server });

      // Clean up on close
      res.on('close', () => {
        activeTransports.delete(transport.sessionId);
        transport.close();
      });

      // Connect server to transport
      await server.connect(transport);

      // Start SSE stream
      await transport.start();

      // Note: Response stays open, don't call res.end()

    } else if (req.method === 'POST') {
      // ===== POST: Handle client message =====

      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      // Get session ID from query or header
      const sessionId = (req.query.sessionId as string) || req.headers['x-session-id'] as string;

      if (!sessionId) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Missing sessionId parameter or X-Session-Id header',
        });
        return;
      }

      // Find active transport for this session
      const session = activeTransports.get(sessionId);

      if (!session) {
        res.status(404).json({
          error: 'Session Not Found',
          message: 'SSE connection not established or expired',
        });
        return;
      }

      // Handle POST message
      await session.transport.handlePostMessage(req as any, res as any, req.body);

    } else {
      res.status(405).json({
        error: 'Method not allowed',
        message: 'Only GET and POST requests are accepted for SSE',
      });
    }
  } catch (error) {
    console.error('SSE handler error:', error);

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
