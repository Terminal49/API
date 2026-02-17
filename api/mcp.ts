/**
 * Vercel Serverless Function for Terminal49 MCP Server
 * Uses StreamableHTTPServerTransport for MCP protocol
 *
 * Endpoint: POST /api/mcp
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
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
  on(event: 'close' | 'finish', listener: () => void): void;
} & ServerResponse;

type Closable = {
  close?: () => Promise<void> | void;
};

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

function extractApiToken(
  authorizationHeader: string | undefined,
  envToken: string | undefined,
): { token?: string; source?: 'authorization' | 'environment' } {
  if (authorizationHeader?.trim()) {
    const trimmed = authorizationHeader.trim();
    const authMatch = trimmed.match(/^(bearer|token)\s+(.+)$/i);
    if (authMatch?.[2]) {
      const token = authMatch[2].trim();
      if (token.length > 0) {
        return { token, source: 'authorization' };
      }
    }
  }

  if (envToken?.trim()) {
    return { token: envToken.trim(), source: 'environment' };
  }

  return {};
}

function buildRequestId(req: RequestLike): string {
  const incomingId = getHeaderValue(req.headers['x-request-id']);
  if (incomingId?.trim()) {
    return incomingId.trim();
  }

  return randomUUID();
}

function logLifecycle(event: string, requestId: string, details: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      event,
      request_id: requestId,
      timestamp: new Date().toISOString(),
      ...details,
    }),
  );
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
  const requestId = buildRequestId(req);
  setCorsHeaders(res);
  logLifecycle('mcp.request.start', requestId, { method: req.method ?? 'UNKNOWN' });

  if (!validateRequestSecurity(req, res)) {
    logLifecycle('mcp.request.rejected', requestId, { reason: 'request_security_validation_failed' });
    return;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    logLifecycle('mcp.request.complete', requestId, { reason: 'preflight' });
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    setCorsHeaders(res);
    res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are accepted',
    });
    logLifecycle('mcp.request.complete', requestId, { reason: 'method_not_allowed', method: req.method });
    return;
  }

  let server: (Closable & { connect: (transport: StreamableHTTPServerTransport) => Promise<void> }) | undefined;
  let transport: (Closable & { handleRequest: (req: RequestLike, res: ResponseLike, body: unknown) => Promise<void> }) | undefined;
  let cleanupPromise: Promise<void> | null = null;

  const runCleanup = (reason: string): Promise<void> => {
    if (cleanupPromise) {
      return cleanupPromise;
    }

    cleanupPromise = (async () => {
      const cleanupErrors: string[] = [];
      logLifecycle('mcp.request.cleanup.start', requestId, { reason });

      if (transport?.close) {
        try {
          await transport.close();
        } catch (error) {
          const err = error as Error;
          cleanupErrors.push(`transport.close: ${err.message}`);
        }
      }

      if (server?.close) {
        try {
          await server.close();
        } catch (error) {
          const err = error as Error;
          cleanupErrors.push(`server.close: ${err.message}`);
        }
      }

      if (cleanupErrors.length > 0) {
        logLifecycle('mcp.request.cleanup.error', requestId, { reason, errors: cleanupErrors });
        return;
      }

      logLifecycle('mcp.request.cleanup.complete', requestId, { reason });
    })();

    return cleanupPromise;
  };

  const scheduleCleanup = (reason: string): void => {
    void runCleanup(reason);
  };

  try {
    // Extract API token from Authorization header or environment.
    // Supports both `Bearer <token>` and `Token <token>` schemes.
    const authHeader = getHeaderValue(req.headers.authorization);
    const resolvedAuth = extractApiToken(authHeader, process.env.T49_API_TOKEN);
    const apiToken = resolvedAuth.token;

    if (!apiToken) {
      setCorsHeaders(res);
      res.status(401).json({
        error: 'Unauthorized',
        message:
          'Missing valid Authorization header. Use `Authorization: Bearer <token>` or `Authorization: Token <token>`, or set T49_API_TOKEN.',
      });
      logLifecycle('mcp.request.complete', requestId, { reason: 'missing_api_token' });
      return;
    }

    logLifecycle('mcp.request.auth', requestId, {
      auth_source: resolvedAuth.source,
    });

    setCorsHeaders(res);

    // Create MCP server and per-request transport.
    server = createTerminal49McpServer(apiToken, process.env.T49_API_BASE_URL);
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // Stateless mode
      enableJsonResponse: true, // Return JSON instead of SSE
    });

    // Clean up on response lifecycle and also in finally to guarantee closure.
    res.on('close', () => {
      scheduleCleanup('response_close');
    });
    res.on('finish', () => {
      scheduleCleanup('response_finish');
    });

    // Connect server to transport and handle request
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    logLifecycle('mcp.request.complete', requestId, { reason: 'handled' });
  } catch (error) {
    const err = error as Error;
    logLifecycle('mcp.request.error', requestId, {
      error: err.name,
      message: err.message,
    });
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
  } finally {
    await runCleanup('finally');
  }
}
