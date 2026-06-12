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

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
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

  const response = await fetch(`${authorizationServer.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`);
  const payload = await response.json();

  res.status(response.status).json(payload);
}
