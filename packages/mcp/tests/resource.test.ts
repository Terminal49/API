import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_MCP_RESOURCE_URL,
  protectedResourceMetadataUrl,
  resolveMcpResource,
} from '../src/resource.ts';

const RESOURCE_ENV_KEYS = [
  'WORKOS_MCP_RESOURCE',
  'T49_MCP_RESOURCE_URL',
  'T49_MCP_RESOURCE_METADATA_URL',
] as const;

function clearResourceEnv(): void {
  for (const key of RESOURCE_ENV_KEYS) {
    delete process.env[key];
  }
}

function req(host?: string | string[]): { headers: { host?: string | string[] } } {
  return { headers: host === undefined ? {} : { host } };
}

describe('resolveMcpResource', () => {
  beforeEach(clearResourceEnv);
  afterEach(clearResourceEnv);

  describe('explicit configuration (staging / production)', () => {
    it('uses WORKOS_MCP_RESOURCE and ignores the Host header', () => {
      process.env.WORKOS_MCP_RESOURCE = 'https://mcp.terminal49.com';
      expect(resolveMcpResource(req('attacker.example.com'))).toBe('https://mcp.terminal49.com');
    });

    it('falls back to T49_MCP_RESOURCE_URL when WORKOS_MCP_RESOURCE is unset', () => {
      process.env.T49_MCP_RESOURCE_URL = 'https://mcp.staging.terminal49.com';
      expect(resolveMcpResource(req('whatever.host'))).toBe('https://mcp.staging.terminal49.com');
    });

    it('prefers WORKOS_MCP_RESOURCE over T49_MCP_RESOURCE_URL', () => {
      process.env.WORKOS_MCP_RESOURCE = 'https://primary.example.com';
      process.env.T49_MCP_RESOURCE_URL = 'https://secondary.example.com';
      expect(resolveMcpResource(req())).toBe('https://primary.example.com');
    });

    it('strips trailing slashes from configured values', () => {
      process.env.WORKOS_MCP_RESOURCE = 'https://mcp.test///';
      expect(resolveMcpResource(req('mcp.test'))).toBe('https://mcp.test');
    });
  });

  describe('request-origin derivation (dev / preview, no config)', () => {
    it('derives https://{host} for a normal production-style host', () => {
      expect(resolveMcpResource(req('mcp.terminal49.com'))).toBe('https://mcp.terminal49.com');
    });

    it('derives https://{host} for a Vercel preview host', () => {
      expect(resolveMcpResource(req('t49-mcp-git-feature.vercel.app'))).toBe(
        'https://t49-mcp-git-feature.vercel.app',
      );
    });

    it('uses http for localhost', () => {
      expect(resolveMcpResource(req('localhost:3000'))).toBe('http://localhost:3000');
    });

    it('uses http for 127.0.0.1', () => {
      expect(resolveMcpResource(req('127.0.0.1:8080'))).toBe('http://127.0.0.1:8080');
    });

    it('reads the first value when Host is an array', () => {
      expect(resolveMcpResource(req(['mcp.test', 'second.host']))).toBe('https://mcp.test');
    });

    it('falls back to the default when there is no Host header', () => {
      expect(resolveMcpResource(req())).toBe(DEFAULT_MCP_RESOURCE_URL);
    });
  });
});

describe('protectedResourceMetadataUrl', () => {
  beforeEach(clearResourceEnv);
  afterEach(clearResourceEnv);

  it('honors an explicit T49_MCP_RESOURCE_METADATA_URL override', () => {
    process.env.T49_MCP_RESOURCE_METADATA_URL =
      'https://custom.example.com/.well-known/oauth-protected-resource';
    expect(protectedResourceMetadataUrl(req('mcp.test'))).toBe(
      'https://custom.example.com/.well-known/oauth-protected-resource',
    );
  });

  it('derives the metadata URL from the configured resource origin', () => {
    process.env.WORKOS_MCP_RESOURCE = 'https://mcp.terminal49.com';
    expect(protectedResourceMetadataUrl(req('ignored.host'))).toBe(
      'https://mcp.terminal49.com/.well-known/oauth-protected-resource',
    );
  });

  it('derives from the request origin (preserving port) when unconfigured', () => {
    expect(protectedResourceMetadataUrl(req('localhost:3000'))).toBe(
      'http://localhost:3000/.well-known/oauth-protected-resource',
    );
  });

  it('stays in lockstep with resolveMcpResource for the same request (RFC 9728)', () => {
    // The whole point of one shared resolver: the PRM `resource` origin and the
    // WWW-Authenticate `resource_metadata` host must always agree.
    const r = req('t49-mcp-git-feature.vercel.app');
    const resourceOrigin = new URL(resolveMcpResource(r)).origin;
    const metadataOrigin = new URL(protectedResourceMetadataUrl(r)).origin;
    expect(metadataOrigin).toBe(resourceOrigin);
  });
});
