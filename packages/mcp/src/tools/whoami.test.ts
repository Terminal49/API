import type { CurrentCredential, Terminal49Client } from '@terminal49/sdk';
import { describe, expect, it, vi } from 'vite-plus/test';
import { executeWhoami } from './whoami.js';

const ACCOUNT_ID = 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a';
const OTHER_ACCOUNT_ID = 'c8f3d0b2-6e4a-4f9c-8d1b-2a3f4e5d6c7b';

function clientReturning(me: CurrentCredential) {
  const meFn = vi.fn().mockResolvedValue(me);
  // SAFETY: executeWhoami only calls `client.me`, so a stub with that one method stands in
  // for the full SDK client.
  const client = { me: meFn } as unknown as Terminal49Client;
  return { client, me: meFn };
}

describe('executeWhoami', () => {
  it('describes an API key without a user and with an empty switch list', async () => {
    const { client, me } = clientReturning({
      id: 'key-1',
      kind: 'api_key',
      channel: 'api',
      name: 'Production key',
      features: { data_out_api: { status: 'requires_paid_plan' } },
      account: {
        id: ACCOUNT_ID,
        companyName: 'Acme Logistics',
        companyType: 'shipper',
        plan: 'free_plan',
        city: 'Oakland',
        stateAbbr: 'CA',
        country: 'United States',
        trackingSlots: { limit: 10, used: 4, remaining: 6 },
      },
      user: null,
    });

    const result = await executeWhoami(client);

    expect(me).toHaveBeenCalledWith({ format: 'mapped' });
    expect(result).toEqual({
      kind: 'api_key',
      channel: 'api',
      credential_name: 'Production key',
      account: {
        id: ACCOUNT_ID,
        company_name: 'Acme Logistics',
        company_type: 'shipper',
        plan: 'free_plan',
        scac: null,
        abbr_name: null,
        location: 'Oakland, CA, United States',
        tracking_slots: { limit: 10, used: 4, remaining: 6 },
      },
      user: null,
      other_accounts: [],
      features: { data_out_api: { status: 'requires_paid_plan' } },
    });
  });

  it('describes a signed-in user and lists only the accounts they could switch to', async () => {
    const { client } = clientReturning({
      id: 'user-1',
      kind: 'user',
      channel: 'mcp',
      features: {},
      account: {
        id: ACCOUNT_ID,
        companyName: 'Acme Logistics',
        plan: 'customer',
        trackingSlots: null,
      },
      user: {
        id: 'user-1',
        email: 'ops@example.com',
        name: 'Jordan Lee',
        role: 'account_manager',
        jobRole: 'forwarder',
        admin: true,
        accounts: [
          { id: ACCOUNT_ID, companyName: 'Acme Logistics' },
          { id: OTHER_ACCOUNT_ID, companyName: 'Acme Brokerage' },
        ],
      },
    });

    const result = await executeWhoami(client);

    expect(result.kind).toBe('user');
    expect(result.credential_name).toBeNull();
    expect(result.account.location).toBeNull();
    expect(result.user).toEqual({
      id: 'user-1',
      email: 'ops@example.com',
      name: 'Jordan Lee',
      role: 'account_manager',
      job_role: 'forwarder',
      job_title: null,
      terminal49_staff: true,
    });
    expect(result.other_accounts).toEqual([
      { id: OTHER_ACCOUNT_ID, company_name: 'Acme Brokerage' },
    ]);
  });
});
