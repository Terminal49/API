import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client } from './client.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';
const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
);

function loadFixture(name: string): any {
  return JSON.parse(
    fs.readFileSync(path.resolve(fixturesDir, `${name}.json`), 'utf-8'),
  );
}

function clientFor(doc: unknown) {
  const { fetchImpl, calls } = createMockFetch({
    '/me': () => jsonResponse(doc),
  });
  // SAFETY: `fetchImpl` is a test-only constructor option, as in client.test.ts.
  const client = new Terminal49Client({
    apiToken: 'token-123',
    apiBaseUrl: baseUrl,
    fetchImpl,
  } as any);
  return { client, calls };
}

describe('Terminal49Client.me', () => {
  const apiKeyDoc = loadFixture('me.get.api-key');
  const userDoc = loadFixture('me.get.user');

  it('returns the raw JSON:API document by default', async () => {
    const { client, calls } = clientFor(apiKeyDoc);

    const result = await client.me();

    expect(calls).toHaveLength(1);
    expect(calls[0].url.pathname).toBe('/v2/me');
    expect(result.data.type).toBe('credential');
    expect(result.data.attributes.kind).toBe('api_key');
  });

  it('maps an API key credential with its account and no user', async () => {
    const { client } = clientFor(apiKeyDoc);

    const me = await client.me({ format: 'mapped' });

    expect(me).toMatchObject({
      id: apiKeyDoc.data.id,
      kind: 'api_key',
      channel: 'api',
      name: 'Production key',
      user: null,
      account: {
        id: 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a',
        companyName: 'Acme Logistics',
        companyType: 'shipper',
        plan: 'free_plan',
        trackingSlots: { limit: 10, used: 4, remaining: 6 },
      },
    });
    expect(me.account.scac).toBeUndefined();
    expect(me.features.data_out_api).toEqual({ status: 'requires_paid_plan' });
    expect(me.features.custom_fields).toEqual({
      status: 'requires_user_credential',
    });
  });

  it('maps a signed-in user with the accounts they can switch to', async () => {
    const { client } = clientFor(userDoc);

    const me = await client.me({ format: 'mapped' });

    expect(me.kind).toBe('user');
    expect(me.channel).toBe('mcp');
    expect(me.name).toBeUndefined();
    expect(me.account).toMatchObject({
      companyName: 'Acme Logistics',
      companyType: 'freight_forwarder',
      scac: 'ACML',
      plan: 'customer',
      trackingSlots: null,
    });
    expect(me.user).toMatchObject({
      id: userDoc.data.id,
      email: 'ops@example.com',
      name: 'Jordan Lee',
      role: 'account_manager',
      jobRole: 'forwarder',
      jobTitle: 'Operations lead',
      admin: false,
    });
    expect(me.user.accounts.map((account: any) => account.id)).toEqual([
      me.account.id,
    ]);
  });

  it('returns both shapes when asked', async () => {
    const { client } = clientFor(userDoc);

    const both = await client.me({ format: 'both' });

    expect(both.raw.data.type).toBe('credential');
    expect(both.mapped.kind).toBe('user');
  });
});
