import type { IncomingMessage, ServerResponse } from 'node:http';

type RequestLike = {
  method?: string;
} & IncomingMessage;

type ResponseLike = {
  status(code: number): ResponseLike;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
} & ServerResponse;

const DEFAULT_MCP_RESOURCE_URL = 'https://mcp.terminal49.com';

function resourceUrl(req: RequestLike): string {
  const configured = process.env.WORKOS_MCP_RESOURCE?.trim() || process.env.T49_MCP_RESOURCE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  const host = req.headers.host;
  if (!host) {
    return DEFAULT_MCP_RESOURCE_URL;
  }

  const protocol = host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https';
  if (protocol === 'http') {
    return `${protocol}://${host}`;
  }

  return DEFAULT_MCP_RESOURCE_URL;
}

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

  res.status(200).json({
    resource: resourceUrl(req),
    authorization_servers: [authorizationServer.replace(/\/+$/, '')],
    bearer_methods_supported: ['header'],
  });
}
