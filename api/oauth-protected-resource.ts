import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveMcpResource } from '../packages/mcp/src/resource.js';

type RequestLike = {
  method?: string;
} & IncomingMessage;

type ResponseLike = {
  status(code: number): ResponseLike;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
} & ServerResponse;

export default function handler(req: RequestLike, res: ResponseLike): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const authorizationServer = process.env.WORKOS_AUTHORIZATION_SERVER_URL?.trim() ||
    process.env.WORKOS_ISSUER?.trim();

  if (!authorizationServer) {
    res.status(500).json({ error: 'WORKOS_AUTHORIZATION_SERVER_URL or WORKOS_ISSUER must be set.' });
    return;
  }

  // RFC 9728 recommends advertising supported scopes. Driven by env so the
  // value stays in sync with what the WorkOS authorization server actually
  // issues; omitted entirely when unset to avoid advertising scopes the AS
  // would reject.
  const scopesSupported = (process.env.T49_MCP_SCOPES_SUPPORTED ?? '')
    .split(',')
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);

  res.status(200).json({
    resource: resolveMcpResource(req),
    authorization_servers: [authorizationServer.replace(/\/+$/, '')],
    bearer_methods_supported: ['header'],
    ...(scopesSupported.length > 0 ? { scopes_supported: scopesSupported } : {}),
  });
}
