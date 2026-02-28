/**
 * Vercel Serverless Function for Terminal49 MCP Server
 * Uses StreamableHTTPServerTransport for MCP protocol
 *
 * Endpoint: POST /api/mcp
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { looksLikeJwt, verifyWorkosJwt } from '../packages/mcp/src/auth/workos-jwt.js';
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

function extractAuthorizationToken(
  authorizationHeader: string | undefined,
): { token?: string; source?: 'authorization'; scheme?: 'bearer' | 'token' } {
  if (authorizationHeader?.trim()) {
    const trimmed = authorizationHeader.trim();
    const authMatch = trimmed.match(/^(bearer|token)\s+(.+)$/i);
    if (authMatch?.[2]) {
      const token = authMatch[2].trim();
      if (token.length > 0) {
        return {
          token,
          source: 'authorization',
          scheme: authMatch[1]?.toLowerCase() === 'bearer' ? 'bearer' : 'token',
        };
      }
    }
  }

  return {};
}

function isMatchingClientSecret(providedToken: string, expectedSecret: string): boolean {
  const providedBuffer = Buffer.from(providedToken);
  const expectedBuffer = Buffer.from(expectedSecret);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
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
  if (allowList.size === 0) {
    return true;
  }

  if (!hostHeader) {
    return false;
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

function oauthResourceMetadataUrl(): string {
  return (
    process.env.T49_MCP_RESOURCE_METADATA_URL?.trim() ??
    'https://api.terminal49.com/.well-known/oauth-authorization-server'
  );
}

function setOAuthChallengeHeader(res: ResponseLike): void {
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${oauthResourceMetadataUrl()}"`);
}

function unauthorized(res: ResponseLike, payload: { error: string; message: string }): void {
  setCorsHeaders(res);
  setOAuthChallengeHeader(res);
  res.status(401).json(payload);
}

async function verifyViaInternalPrincipal(token: string): Promise<boolean> {
  const verifyUrl = process.env.T49_MCP_TOKEN_VERIFY_URL?.trim();
  const internalAuthToken = process.env.T49_MCP_INTERNAL_AUTH_TOKEN?.trim();
  if (!verifyUrl || !internalAuthToken) {
    return false;
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 2000);

  try {
    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${internalAuthToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      return false;
    }

    const payload = (await response.json()) as { active?: boolean; user_id?: string; account_id?: string };
    return Boolean(payload?.active && payload?.user_id && payload?.account_id);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
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

  let server: McpServer | undefined;
  let transport: StreamableHTTPServerTransport | undefined;
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
    // Require caller Authorization; supports both `Bearer <token>` and `Token <token>`.
    // Use T49_API_TOKEN only as upstream credential, never as client-auth fallback.
    const authHeader = getHeaderValue(req.headers.authorization);
    const resolvedAuth = extractAuthorizationToken(authHeader);
    const callerToken = resolvedAuth.token;
    const callerScheme = resolvedAuth.scheme;

    if (!callerToken) {
      unauthorized(res, {
        error: 'Unauthorized',
        message:
          'Missing valid Authorization header. Use `Authorization: Bearer <token>` or `Authorization: Token <token>`.',
      });
      logLifecycle('mcp.request.complete', requestId, { reason: 'missing_authorization' });
      return;
    }

    const configuredApiToken = process.env.T49_API_TOKEN?.trim();
    const configuredClientSecret = process.env.T49_MCP_CLIENT_SECRET?.trim();
    let apiToken = callerToken;
    let authSource: 'authorization' | 'environment' | 'oauth_local' | 'oauth_remote' =
      resolvedAuth.source ?? 'authorization';

    const jwtLikeBearerToken = callerScheme === 'bearer' && looksLikeJwt(callerToken);
    if (jwtLikeBearerToken) {
      const localVerificationPayload = await verifyWorkosJwt(callerToken);
      if (localVerificationPayload) {
        apiToken = `Bearer ${callerToken}`;
        authSource = 'oauth_local';
      } else if (await verifyViaInternalPrincipal(callerToken)) {
        apiToken = `Bearer ${callerToken}`;
        authSource = 'oauth_remote';
      } else {
        unauthorized(res, {
          error: 'Unauthorized',
          message: 'Invalid OAuth bearer token.',
        });
        logLifecycle('mcp.request.complete', requestId, { reason: 'invalid_oauth_bearer' });
        return;
      }
    }

    if (configuredApiToken && authSource !== 'oauth_local' && authSource !== 'oauth_remote') {
      if (!configuredClientSecret) {
        setCorsHeaders(res);
        res.status(500).json({
          error: 'Server misconfiguration',
          message: 'T49_MCP_CLIENT_SECRET must be set when T49_API_TOKEN is configured.',
        });
        logLifecycle('mcp.request.complete', requestId, { reason: 'missing_client_secret' });
        return;
      }

      if (!isMatchingClientSecret(callerToken, configuredClientSecret)) {
        unauthorized(res, {
          error: 'Unauthorized',
          message: 'Invalid client credentials.',
        });
        logLifecycle('mcp.request.complete', requestId, { reason: 'invalid_client_secret' });
        return;
      }

      apiToken = configuredApiToken;
      authSource = 'environment';
    }

    logLifecycle('mcp.request.auth', requestId, {
      auth_source: authSource,
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
