/**
 * Single source of truth for the MCP server's OAuth "resource" identifier.
 *
 * RFC 9728 requires the `resource` advertised in Protected Resource Metadata to
 * be the canonical URI the client actually connects to, and the same value the
 * `WWW-Authenticate: ... resource_metadata=` challenge points at. Computing it
 * in more than one place is how those drift apart (and how token-audience
 * validation starts failing intermittently per host). So both the PRM endpoint
 * and the 401 challenge in api/mcp.ts resolve through here.
 *
 * Resolution order, designed to be correct across every environment:
 *   1. Explicit config (WORKOS_MCP_RESOURCE / T49_MCP_RESOURCE_URL) — set this
 *      in staging and production to pin the canonical audience the backend
 *      validates against. Host header is then ignored.
 *   2. The actual request origin (scheme + host) — covers local dev
 *      (http://localhost:3000) and Vercel preview deploys (the preview domain)
 *      with zero config, and guarantees the PRM resource equals the origin that
 *      served it.
 *   3. DEFAULT_MCP_RESOURCE_URL — last resort when there is no Host header.
 *
 * Security note: deriving from the Host header means a spoofed Host could change
 * the advertised resource. That is bounded by T49_MCP_ALLOWED_HOSTS (validated
 * before any handler logic runs) and is moot whenever step 1 applies, which is
 * why staging/production should always set an explicit resource.
 */

export const DEFAULT_MCP_RESOURCE_URL = 'https://mcp.terminal49.com';

type HeaderValue = string | string[] | undefined;

export type ResourceRequestLike = {
  headers: { host?: HeaderValue };
};

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

function firstHeaderValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

function configuredResource(): string | undefined {
  const configured =
    process.env.WORKOS_MCP_RESOURCE?.trim() || process.env.T49_MCP_RESOURCE_URL?.trim();
  return configured ? stripTrailingSlashes(configured) : undefined;
}

/**
 * Resolve the canonical resource URI for a given request.
 */
export function resolveMcpResource(req: ResourceRequestLike): string {
  const configured = configuredResource();
  if (configured) {
    return configured;
  }

  const host = firstHeaderValue(req.headers.host)?.trim();
  if (!host) {
    return DEFAULT_MCP_RESOURCE_URL;
  }

  const hostname = host.split(':')[0];
  const scheme = LOCAL_HOSTNAMES.has(hostname) ? 'http' : 'https';
  return `${scheme}://${host}`;
}

/**
 * Resolve the Protected Resource Metadata (RFC 9728) URL for a given request.
 * Always derived from the same resource value as {@link resolveMcpResource} so
 * the PRM document and the WWW-Authenticate challenge stay in lockstep.
 */
export function protectedResourceMetadataUrl(req: ResourceRequestLike): string {
  const explicit = process.env.T49_MCP_RESOURCE_METADATA_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const resource = resolveMcpResource(req);
  try {
    return `${new URL(resource).origin}/.well-known/oauth-protected-resource`;
  } catch {
    return `${stripTrailingSlashes(resource)}/.well-known/oauth-protected-resource`;
  }
}
