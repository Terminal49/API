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

  it('maps only the documented tracking-slot fields and drops unknown ones', async () => {
    // The backend adds fields to tracking_slots over time; strict downstream schemas
    // (the MCP whoami tool) must never see them.
    const doc = structuredClone(apiKeyDoc);
    const account = doc.included.find((r: any) => r.type === 'account');
    account.attributes.tracking_slots.some_future_field = 'ignored';
    const { client } = clientFor(doc);

    const me = await client.me({ format: 'mapped' });

    expect(me.account.trackingSlots).toEqual({
      limit: 10,
      used: 4,
      activeContainers: 3,
      pendingTrackingRequests: 1,
      remaining: 6,
    });
  });

  it('omits a missing breakdown count instead of failing', async () => {
    const doc = structuredClone(apiKeyDoc);
    const account = doc.included.find((r: any) => r.type === 'account');
    delete account.attributes.tracking_slots.active_containers;
    const { client } = clientFor(doc);

    const me = await client.me({ format: 'mapped' });

    expect(me.account.trackingSlots).toEqual({
      limit: 10,
      used: 4,
      pendingTrackingRequests: 1,
      remaining: 6,
    });
  });

  it('maps malformed tracking slots to null instead of failing', async () => {
    const doc = structuredClone(apiKeyDoc);
    const account = doc.included.find((r: any) => r.type === 'account');
    account.attributes.tracking_slots.limit = 'ten';
    const { client } = clientFor(doc);

    const me = await client.me({ format: 'mapped' });

    expect(me.account.trackingSlots).toBeNull();
  });

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
      name: 'Example fixture key',
      user: null,
      account: {
        id: 'account-1',
        companyName: 'Example Fixture Shipper',
        companyType: 'shipper',
        plan: 'free_plan',
        trackingSlots: {
          limit: 10,
          used: 4,
          activeContainers: 3,
          pendingTrackingRequests: 1,
          remaining: 6,
        },
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
      companyName: 'Example Fixture Shipper',
      companyType: 'freight_forwarder',
      scac: 'SYNU',
      plan: 'customer',
      trackingSlots: null,
    });
    expect(me.user).toMatchObject({
      id: userDoc.data.id,
      email: 'fixture@example.test',
      name: 'Example Operator',
      role: 'account_manager',
      jobRole: 'forwarder',
      jobTitle: 'Operations lead',
      admin: false,
    });
    expect(me.user.accounts.map((account: any) => account.id)).toEqual([
      me.account.id,
    ]);
  });

  it.each([
    [
      'included account',
      (doc: any) => {
        doc.included = [];
      },
    ],
    [
      'account linkage',
      (doc: any) => {
        delete doc.data.relationships.account.data;
      },
    ],
    [
      'account company name',
      (doc: any) => {
        delete doc.included[0].attributes.company_name;
      },
    ],
  ])('rejects a mapped credential missing %s', async (_name, corrupt) => {
    const doc = structuredClone(apiKeyDoc);
    corrupt(doc);
    const { client } = clientFor(doc);

    await expect(client.me({ format: 'mapped' })).rejects.toThrow(
      'Invalid /me response',
    );
  });

  it('rejects a mapped credential missing the included user', async () => {
    const doc = structuredClone(userDoc);
    doc.included = doc.included.filter((item: any) => item.type !== 'user');
    const { client } = clientFor(doc);

    await expect(client.me({ format: 'mapped' })).rejects.toThrow(
      'Invalid /me response',
    );
  });

  it('rejects a linked user without an email', async () => {
    const doc = structuredClone(userDoc);
    const user = doc.included.find((item: any) => item.type === 'user');
    delete user.attributes.email;
    const { client } = clientFor(doc);

    await expect(client.me({ format: 'mapped' })).rejects.toThrow(
      'Invalid /me response',
    );
  });

  it('rejects a linked user without account-list linkage', async () => {
    const doc = structuredClone(userDoc);
    const user = doc.included.find((item: any) => item.type === 'user');
    delete user.relationships.accounts;
    const { client } = clientFor(doc);
    await expect(client.me({ format: 'mapped' })).rejects.toThrow(
      'Invalid /me response',
    );
  });

  it('rejects account-list linkage without an included account', async () => {
    const doc = structuredClone(userDoc);
    const user = doc.included.find((item: any) => item.type === 'user');
    user.relationships.accounts.data.push({
      id: 'missing-account',
      type: 'account',
    });
    const { client } = clientFor(doc);
    await expect(client.me({ format: 'mapped' })).rejects.toThrow(
      'Invalid /me response',
    );
  });

  it('returns both shapes when asked', async () => {
    const { client } = clientFor(userDoc);

    const both = await client.me({ format: 'both' });

    expect(both.raw.data.type).toBe('credential');
    expect(both.mapped.kind).toBe('user');
  });
});
