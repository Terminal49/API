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

/**
 * Compatibility shim for OAuth clients that probe the resource origin for
 * Authorization Server Metadata (RFC 8414) instead of following RFC 9728
 * Protected Resource Metadata discovery. PRM-aware clients (ChatGPT, Claude)
 * never reach this route — they read `authorization_servers` from the PRM
 * document and fetch AS metadata straight from the WorkOS issuer.
 *
 * This 302-redirects to the WorkOS issuer's metadata rather than proxying it
 * verbatim. The client then fetches the document from the issuer's own origin,
 * so the document's `issuer` value matches the fetch origin (RFC 8414 §3.3). A
 * verbatim proxy would serve WorkOS's issuer from this origin, and a strict
 * client would reject that mismatch — which is why the verbatim proxy was
 * removed in favor of this redirect.
 */
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

  const target = `${authorizationServer.replace(/\/+$/, '')}/.well-known/oauth-authorization-server`;
  res.setHeader('Location', target);
  res.status(302).end();
}
