import { createPublicKey, createVerify } from 'node:crypto';

const ACCOUNT_ID_CLAIM = 'urn:terminal49:account_id';
const LEGACY_ACCOUNT_ID_CLAIM = 'account_id';
const DEFAULT_REQUIRED_SCOPE = 'mcp';
const EXPECTED_ALGORITHM = 'RS256';
const DEFAULT_JWKS_CACHE_MS = 10 * 60 * 1000;

type Jwk = {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
};

type JwksResponse = {
  keys?: Jwk[];
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JwtPayload = { [key: string]: JsonValue };

type VerificationConfig = {
  issuer?: string;
  audience?: string;
  jwksUrl?: string;
  requiredScope?: string;
};

type VerifiedPayload = JwtPayload & {
  t49_user_id: string;
  t49_account_id: string;
};

const jwksCache = new Map<string, { expiresAt: number; keys: Jwk[] }>();

export function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

export async function verifyWorkosJwt(
  token: string,
  config: VerificationConfig = {},
): Promise<VerifiedPayload | null> {
  if (!looksLikeJwt(token)) {
    return null;
  }

  const issuer = (config.issuer ?? process.env.WORKOS_MCP_ISSUER ?? '').trim();
  const audience = (config.audience ?? process.env.WORKOS_MCP_AUDIENCE ?? '').trim();
  const jwksUrl = (config.jwksUrl ?? process.env.WORKOS_MCP_JWKS_URL ?? '').trim();
  const requiredScope = (config.requiredScope ?? DEFAULT_REQUIRED_SCOPE).trim();

  if (!issuer || !audience || !jwksUrl) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }

  const header = decodeSegment(encodedHeader) as Record<string, unknown> | null;
  const payload = decodeSegment(encodedPayload) as JwtPayload | null;
  if (!header || !payload) {
    return null;
  }

  if (header.alg !== EXPECTED_ALGORITHM) {
    return null;
  }

  const kid = typeof header.kid === 'string' ? header.kid : '';
  if (!kid) {
    return null;
  }

  const jwk = (await findJwk(kid, jwksUrl)) ?? (await findJwk(kid, jwksUrl, true));
  if (!jwk || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) {
    return null;
  }

  const isSignatureValid = verifySignature({
    encodedHeader,
    encodedPayload,
    encodedSignature,
    jwk,
  });
  if (!isSignatureValid) {
    return null;
  }

  if (!validClaims(payload, { issuer, audience, requiredScope })) {
    return null;
  }

  const userId = resolveUserId(payload);
  const accountId = resolveAccountId(payload);
  if (!userId || !accountId) {
    return null;
  }

  return {
    ...payload,
    t49_user_id: userId,
    t49_account_id: accountId,
  };
}

async function findJwk(kid: string, jwksUrl: string, forceRefresh = false): Promise<Jwk | null> {
  const keys = await fetchJwks(jwksUrl, forceRefresh);
  return keys.find((key) => key.kid === kid) ?? null;
}

async function fetchJwks(jwksUrl: string, forceRefresh: boolean): Promise<Jwk[]> {
  if (!forceRefresh) {
    const cached = jwksCache.get(jwksUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.keys;
    }
  }

  const response = await fetch(jwksUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    return [];
  }

  const body = (await response.json()) as JwksResponse;
  const keys = Array.isArray(body.keys)
    ? body.keys.filter((key) => typeof key?.kid === 'string')
    : [];

  jwksCache.set(jwksUrl, {
    keys,
    expiresAt: Date.now() + DEFAULT_JWKS_CACHE_MS,
  });

  return keys;
}

function verifySignature(params: {
  encodedHeader: string;
  encodedPayload: string;
  encodedSignature: string;
  jwk: Jwk;
}): boolean {
  const signingInput = `${params.encodedHeader}.${params.encodedPayload}`;
  const signature = decodeBase64UrlBuffer(params.encodedSignature);
  if (!signature) {
    return false;
  }

  const publicKey = createPublicKey({
    key: {
      kty: params.jwk.kty,
      n: params.jwk.n,
      e: params.jwk.e,
    },
    format: 'jwk',
  });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(signingInput);
  verifier.end();

  return verifier.verify(publicKey, signature);
}

function validClaims(
  payload: JwtPayload,
  options: { issuer: string; audience: string; requiredScope: string },
): boolean {
  if (payload.iss !== options.issuer) {
    return false;
  }

  if (!audienceMatches(payload.aud, options.audience)) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = numericClaim(payload.exp);
  if (!exp || exp <= now) {
    return false;
  }

  const nbf = numericClaim(payload.nbf);
  if (nbf && nbf > now) {
    return false;
  }

  const scope = typeof payload.scope === 'string' ? payload.scope : '';
  const scopeParts = scope.split(/\s+/).filter(Boolean);
  if (!scopeParts.includes(options.requiredScope)) {
    return false;
  }

  return true;
}

function audienceMatches(audClaim: JsonValue | undefined, expectedAudience: string): boolean {
  if (typeof audClaim === 'string') {
    return audClaim === expectedAudience;
  }

  if (Array.isArray(audClaim)) {
    return audClaim.includes(expectedAudience);
  }

  return false;
}

function resolveUserId(payload: JwtPayload): string | null {
  if (typeof payload.sub === 'string' && payload.sub.trim()) {
    return payload.sub;
  }

  if (typeof payload.user_id === 'string' && payload.user_id.trim()) {
    return payload.user_id;
  }

  return null;
}

function resolveAccountId(payload: JwtPayload): string | null {
  const accountIdClaim = payload[ACCOUNT_ID_CLAIM];
  if (typeof accountIdClaim === 'string' && accountIdClaim.trim()) {
    return accountIdClaim;
  }

  const legacyAccountIdClaim = payload[LEGACY_ACCOUNT_ID_CLAIM];
  if (typeof legacyAccountIdClaim === 'string' && legacyAccountIdClaim.trim()) {
    return legacyAccountIdClaim;
  }

  if (typeof payload.t49_account_id === 'string' && payload.t49_account_id.trim()) {
    return payload.t49_account_id;
  }

  return null;
}

function numericClaim(value: JsonValue | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function decodeSegment(segment: string): Record<string, unknown> | null {
  const decoded = decodeBase64UrlString(segment);
  if (!decoded) {
    return null;
  }

  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeBase64UrlString(value: string): string | null {
  const buffer = decodeBase64UrlBuffer(value);
  if (!buffer) {
    return null;
  }

  return buffer.toString('utf-8');
}

function decodeBase64UrlBuffer(value: string): Buffer | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4;
    const padded = padding === 0 ? normalized : `${normalized}${'='.repeat(4 - padding)}`;
    return Buffer.from(padded, 'base64');
  } catch {
    return null;
  }
}
