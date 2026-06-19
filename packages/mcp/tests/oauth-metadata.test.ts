import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import protectedResourceHandler from '../../../api/oauth-protected-resource.ts';

/**
 * Mirrors the MockResponse used in api-handler.test.ts so these tests exercise
 * the real handler code path (status/json/end/setHeader) without an HTTP server.
 * Exhaustive resource-resolution scenarios live in resource.test.ts; this suite
 * covers the PRM document shape and the endpoint's method/error handling.
 */
class MockResponse extends EventEmitter {
  headersSent = false;
  statusCode = 200;
  payload: unknown = undefined;
  jsonCalled = false;
  endCalled = false;
  headers: Record<string, string> = {};

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  json(payload: unknown): void {
    this.payload = payload;
    this.jsonCalled = true;
    this.headersSent = true;
    this.emit('finish');
  }

  setHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  end(): void {
    this.endCalled = true;
    this.headersSent = true;
    this.emit('finish');
  }
}

function createRequest(
  method: string,
  headers: Record<string, string> = {},
): Record<string, unknown> {
  return {
    method,
    headers: { host: 'mcp.test', ...headers },
  };
}

const OAUTH_ENV_KEYS = [
  'WORKOS_AUTHORIZATION_SERVER_URL',
  'WORKOS_ISSUER',
  'WORKOS_MCP_RESOURCE',
  'T49_MCP_RESOURCE_URL',
  'T49_MCP_RESOURCE_METADATA_URL',
  'T49_MCP_SCOPES_SUPPORTED',
] as const;

function clearOauthEnv(): void {
  for (const key of OAUTH_ENV_KEYS) {
    delete process.env[key];
  }
}

function payloadOf(res: MockResponse): Record<string, unknown> {
  return res.payload as Record<string, unknown>;
}

describe('api/oauth-protected-resource (RFC 9728 PRM)', () => {
  beforeEach(clearOauthEnv);
  afterEach(clearOauthEnv);

  it('returns the protected resource metadata document for a GET', () => {
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test/';
    const res = new MockResponse();

    // No resource env set, so `resource` is derived from the request host.
    protectedResourceHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({
      resource: 'https://mcp.test',
      // Trailing slash on the authorization server is normalized away.
      authorization_servers: ['https://auth.workos.test'],
      bearer_methods_supported: ['header'],
    });
  });

  it('advertises an explicitly configured resource over the request host', () => {
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test';
    process.env.WORKOS_MCP_RESOURCE = 'https://mcp.terminal49.com';
    const res = new MockResponse();

    protectedResourceHandler(createRequest('GET', { host: 'preview.vercel.app' }) as never, res as never);

    expect(payloadOf(res).resource).toBe('https://mcp.terminal49.com');
  });

  it('omits scopes_supported when T49_MCP_SCOPES_SUPPORTED is unset', () => {
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test';
    const res = new MockResponse();

    protectedResourceHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.payload).not.toHaveProperty('scopes_supported');
  });

  it('advertises scopes_supported from env, trimmed and de-blanked', () => {
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test';
    process.env.T49_MCP_SCOPES_SUPPORTED = ' mcp:tools , , mcp:resources ';
    const res = new MockResponse();

    protectedResourceHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(payloadOf(res).scopes_supported).toEqual(['mcp:tools', 'mcp:resources']);
  });

  it('omits scopes_supported when the env value is only separators/whitespace', () => {
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test';
    process.env.T49_MCP_SCOPES_SUPPORTED = ' , , ';
    const res = new MockResponse();

    protectedResourceHandler(createRequest('GET') as never, res as never);

    expect(res.payload).not.toHaveProperty('scopes_supported');
  });

  it('falls back to WORKOS_ISSUER when no explicit authorization server is set', () => {
    process.env.WORKOS_ISSUER = 'https://issuer.workos.test/';
    const res = new MockResponse();

    protectedResourceHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(payloadOf(res).authorization_servers).toEqual(['https://issuer.workos.test']);
  });

  it('returns 500 when no authorization server is configured', () => {
    const res = new MockResponse();

    protectedResourceHandler(createRequest('GET') as never, res as never);

    expect(res.statusCode).toBe(500);
    expect(payloadOf(res).error).toContain('WORKOS_AUTHORIZATION_SERVER_URL');
  });

  it('answers CORS preflight with 200, the right methods, and no body', () => {
    const res = new MockResponse();

    protectedResourceHandler(createRequest('OPTIONS') as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.endCalled).toBe(true);
    expect(res.jsonCalled).toBe(false);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
  });

  it('rejects non-GET methods with 405 and CORS headers', () => {
    process.env.WORKOS_AUTHORIZATION_SERVER_URL = 'https://auth.workos.test';
    const res = new MockResponse();

    protectedResourceHandler(createRequest('POST') as never, res as never);

    expect(res.statusCode).toBe(405);
    expect(payloadOf(res).error).toBe('Method not allowed');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
