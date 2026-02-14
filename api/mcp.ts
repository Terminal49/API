/**
 * Vercel Serverless Function for Terminal49 MCP Server
 * Uses StreamableHTTPServerTransport for MCP protocol
 *
 * Endpoint: POST /api/mcp
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createTerminal49McpServer } from '../packages/mcp/src/server.js';

type RequestLike = {
  method?: string;
  headers: IncomingMessage['headers'];
  body?: unknown;
} & IncomingMessage;

type ResponseLike = {
  headersSent: boolean;
  status(code: number): ResponseLike;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
  on(event: 'close', listener: () => void): void;
} & ServerResponse;

function setCorsHeaders(res: ResponseLike): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function parseAllowList(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  );
}

function isAllowedHost(hostHeader: string | undefined, allowList: Set<string>): boolean {
  if (!hostHeader) {
    return false;
  }

  if (allowList.size === 0) {
    return true;
  }

  const hostname = hostHeader.split(':')[0];
  return allowList.has(hostHeader) || allowList.has(hostname);
}

function isAllowedOrigin(
  originHeader: string | undefined,
  hostHeader: string | undefined,
  allowList: Set<string>,
): boolean {
  if (!originHeader) {
    // Non-browser clients commonly omit Origin.
    return true;
  }

  let origin: URL;

  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  if (allowList.size > 0) {
    return allowList.has(origin.origin) || allowList.has(origin.hostname);
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  if (localHosts.has(origin.hostname)) {
    return true;
  }

  if (!hostHeader) {
    return false;
  }

  const requestHost = hostHeader.split(':')[0];
  return origin.hostname === requestHost;
}

function validateRequestSecurity(req: RequestLike, res: ResponseLike): boolean {
  const hostHeader = getHeaderValue(req.headers.host);
  const originHeader = getHeaderValue(req.headers.origin);
  const allowedHosts = parseAllowList(process.env.T49_MCP_ALLOWED_HOSTS);
  const allowedOrigins = parseAllowList(process.env.T49_MCP_ALLOWED_ORIGINS);

  if (!isAllowedHost(hostHeader, allowedHosts)) {
    setCorsHeaders(res);
    res.status(403).json({
      error: 'Forbidden',
      message: `Invalid Host header: ${hostHeader ?? '(missing)'}`,
    });
    return false;
  }

  if (!isAllowedOrigin(originHeader, hostHeader, allowedOrigins)) {
    setCorsHeaders(res);
    res.status(403).json({
      error: 'Forbidden',
      message: `Invalid Origin header: ${originHeader ?? '(missing)'}`,
    });
    return false;
  }

  return true;
}

/**
 * Main handler for Vercel serverless function
 */
export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  setCorsHeaders(res);

  if (!validateRequestSecurity(req, res)) {
    return;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    setCorsHeaders(res);
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
      setCorsHeaders(res);
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Authorization header or T49_API_TOKEN environment variable',
      });
      return;
    }

    setCorsHeaders(res);

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
      setCorsHeaders(res);
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
