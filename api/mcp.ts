/**
 * Vercel Serverless Function for Terminal49 MCP Server
 * Uses StreamableHTTPServerTransport for MCP protocol
 *
 * Endpoint: POST /api/mcp
 */

import '../packages/mcp/src/instrument.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as Sentry from '@sentry/node';
import { createTerminal49McpServer } from '../packages/mcp/src/server.js';
import { captureMcpException } from '../packages/mcp/src/sentry.js';
import { protectedResourceMetadataUrl } from '../packages/mcp/src/resource.js';

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
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id',
  );
}

function getHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function extractAuthorizationToken(
  authorizationHeader: string | undefined,
): { scheme?: 'Bearer' | 'Token'; token?: string; source?: 'authorization' } {
  if (authorizationHeader?.trim()) {
    const trimmed = authorizationHeader.trim();
    const authMatch = trimmed.match(/^(bearer|token)\s+(.+)$/i);
    if (authMatch?.[2]) {
      const token = authMatch[2].trim();
      if (token.length > 0) {
        const scheme = authMatch[1].toLowerCase() === 'bearer' ? 'Bearer' : 'Token';
        return { scheme, token, source: 'authorization' };
      }
    }
  }

  return {};
}

type ResolvedTerminal49Auth = {
  apiToken: string;
  accountId?: string;
  authSource: 'authorization' | 'environment' | 'workos_mcp';
};

type ConnectedClientResolutionResponse = {
  data?: {
    attributes?: {
      access_token?: string;
      account_id?: string;
    };
  };
  error?: string;
};

type UnauthorizedReason = 'missing_credentials' | 'invalid_token';

function oauthConfigured(): boolean {
  return Boolean(
    process.env.WORKOS_AUTHORIZATION_SERVER_URL?.trim() || process.env.WORKOS_ISSUER?.trim(),
  );
}

function wwwAuthenticateHeader(req: RequestLike, reason: UnauthorizedReason): string {
  const parts = ['Bearer realm="mcp"'];

  // RFC 6750 §3.1: include an error code only when a token was actually
  // presented and rejected; omit it when the client sent no credentials.
  if (reason === 'invalid_token') {
    parts.push('error="invalid_token"');
    parts.push('error_description="The access token is invalid or expired"');
  }

  // Only advertise OAuth discovery when the WorkOS resolver path is actually
  // active: AuthKit enabled AND the authorization server configured. If AuthKit
  // is off, a Bearer token isn't resolved (it's treated as a passthrough key), so
  // an OAuth-aware client would complete the WorkOS flow and then loop with a
  // token the handler won't honor. The PRM endpoint also 500s without WORKOS_*.
  if (authKitMcpEnabled() && oauthConfigured()) {
    parts.push(`resource_metadata="${protectedResourceMetadataUrl(req)}"`);
  }

  return parts.join(', ');
}

function setUnauthorizedChallenge(
  res: ResponseLike,
  req: RequestLike,
  reason: UnauthorizedReason,
): void {
  res.setHeader('WWW-Authenticate', wwwAuthenticateHeader(req, reason));
}

function authKitMcpEnabled(): boolean {
  return process.env.T49_MCP_AUTHKIT_ENABLED === 'true';
}

function resolveEndpointUrl(): string {
  const apiBaseUrl = process.env.T49_API_BASE_URL?.trim() || 'https://api.terminal49.com/v2';
  return `${apiBaseUrl.replace(/\/+$/, '')}/connected-clients/resolve`;
}

type ResolveFailureKind = 'config' | 'invalid_token' | 'upstream';

class ConnectedClientResolveError extends Error {
  readonly kind: ResolveFailureKind;

  constructor(message: string, kind: ResolveFailureKind) {
    super(message);
    this.name = 'ConnectedClientResolveError';
    this.kind = kind;
  }
}

async function resolveConnectedClientToken(
  token: string,
  requestId: string,
): Promise<{ apiToken: string; accountId: string }> {
  const resolveSecret = process.env.T49_CONNECTED_CLIENTS_RESOLVE_SECRET?.trim() ||
    process.env.T49_MCP_RESOLVE_SECRET?.trim();
  if (!resolveSecret) {
    throw new ConnectedClientResolveError(
      'T49_CONNECTED_CLIENTS_RESOLVE_SECRET must be set when AuthKit MCP auth is enabled.',
      'config',
    );
  }

  let response: Response;
  try {
    response = await fetch(resolveEndpointUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-T49-Connected-Clients-Resolve-Secret': resolveSecret,
        'X-Request-Id': requestId,
      },
      body: JSON.stringify({ access_token: token }),
    });
  } catch (error) {
    throw new ConnectedClientResolveError(
      `Terminal49 connected client resolve request failed: ${(error as Error).message}`,
      'upstream',
    );
  }

  let payload: ConnectedClientResolutionResponse = {};
  try {
    payload = (await response.json()) as ConnectedClientResolutionResponse;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    // Only a token the resolver actively rejects (401/403) is a client auth
    // failure. A 5xx / 429 / network error means the resolver is unavailable —
    // surface that as retryable so clients don't discard a valid token and loop
    // through re-authentication during a Terminal49 outage.
    const kind: ResolveFailureKind =
      response.status === 401 || response.status === 403 ? 'invalid_token' : 'upstream';
    throw new ConnectedClientResolveError(
      payload.error || `Terminal49 connected client resolve failed with ${response.status}`,
      kind,
    );
  }

  const accessToken = payload.data?.attributes?.access_token;
  const accountId = payload.data?.attributes?.account_id;
  if (!accessToken || !accountId) {
    throw new ConnectedClientResolveError(
      'Terminal49 connected client resolve response is missing access_token or account_id.',
      'upstream',
    );
  }

  return { apiToken: `Bearer ${accessToken}`, accountId };
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
  let shouldFlushSentry = false;

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

    if (!callerToken) {
      setCorsHeaders(res);
      setUnauthorizedChallenge(res, req, 'missing_credentials');
      res.status(401).json({
        error: 'Unauthorized',
        message:
          'Missing valid Authorization header. Use `Authorization: Bearer <token>` or `Authorization: Token <token>`.',
      });
      logLifecycle('mcp.request.complete', requestId, { reason: 'missing_authorization' });
      return;
    }

    const configuredApiToken = process.env.T49_API_TOKEN?.trim();
    const configuredClientSecret = process.env.T49_MCP_CLIENT_SECRET?.trim();
    let resolvedTerminal49Auth: ResolvedTerminal49Auth = {
      apiToken: callerToken,
      authSource: resolvedAuth.source ?? 'authorization',
    };

    // Intentional: when AuthKit is enabled, `Bearer` is reserved for WorkOS OAuth
    // access tokens (resolved below). API keys authenticate with the `Token`
    // scheme (passthrough), which is what the docs instruct. Existing Bearer
    // API-key clients must migrate to `Token` before AuthKit is enabled — see
    // packages/mcp/WORKOS_MCP_SETUP.md (rollout note).
    if (authKitMcpEnabled() && resolvedAuth.scheme === 'Bearer') {
      try {
        const resolved = await resolveConnectedClientToken(callerToken, requestId);
        resolvedTerminal49Auth = {
          apiToken: resolved.apiToken,
          accountId: resolved.accountId,
          authSource: 'workos_mcp',
        };
      } catch (error) {
        const err = error as Error;
        const kind: ResolveFailureKind =
          err instanceof ConnectedClientResolveError ? err.kind : 'upstream';
        setCorsHeaders(res);
        // Keep the detailed reason in the server log (correlated by request_id);
        // return a generic, category-appropriate response so internals never leak.
        logLifecycle('mcp.request.complete', requestId, {
          reason: 'connected_client_resolve_failed',
          kind,
          message: err.message,
        });
        if (kind === 'invalid_token') {
          setUnauthorizedChallenge(res, req, 'invalid_token');
          res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid or expired token.',
          });
        } else if (kind === 'config') {
          res.status(500).json({
            error: 'Server misconfiguration',
            message: 'Authorization is not configured correctly.',
          });
        } else {
          // Upstream/transient: do NOT send a 401 challenge — that tells clients
          // their token is bad and triggers re-auth loops. 502 invites a retry.
          res.status(502).json({
            error: 'Bad Gateway',
            message: 'Authorization service is temporarily unavailable. Please retry.',
          });
        }
        return;
      }
    } else if (configuredApiToken) {
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
        setCorsHeaders(res);
        setUnauthorizedChallenge(res, req, 'invalid_token');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid client credentials.',
        });
        logLifecycle('mcp.request.complete', requestId, { reason: 'invalid_client_secret' });
        return;
      }

      resolvedTerminal49Auth = {
        apiToken: configuredApiToken,
        authSource: 'environment',
      };
    }

    logLifecycle('mcp.request.auth', requestId, {
      auth_source: resolvedTerminal49Auth.authSource,
    });

    setCorsHeaders(res);

    // Create MCP server and per-request transport.
    server = createTerminal49McpServer(
      resolvedTerminal49Auth.apiToken,
      process.env.T49_API_BASE_URL,
      resolvedTerminal49Auth.accountId,
    );
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
    captureMcpException(error);
    shouldFlushSentry = true;
    logLifecycle('mcp.request.error', requestId, {
      error: err.name,
      message: err.message,
    });
    if (!res.headersSent) {
      setCorsHeaders(res);
      // The real error is logged above (correlated by request_id). Never echo
      // err.message to the client — it can carry upstream URLs, tokens, or
      // stack detail.
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  } finally {
    await runCleanup('finally');
    if (shouldFlushSentry || Sentry.isInitialized()) {
      await Sentry.flush(2000).catch(() => undefined);
    }
  }
}
