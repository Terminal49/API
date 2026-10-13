import { describe, expect, it, vi } from 'vite-plus/test';
import type { Terminal49Client } from '@terminal49/sdk';
import { executeSetCustomField, executeSetPartyRole } from './record-writes.js';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const PARTY = '99999999-9999-4999-8999-999999999999';

function fakeClient() {
  const manager = () => ({
    partyRoles: vi.fn(),
    addPartyRole: vi.fn().mockResolvedValue({}),
    removePartyRole: vi.fn().mockResolvedValue(undefined),
    customFields: vi.fn(),
    setCustomField: vi.fn().mockResolvedValue({}),
    clearCustomField: vi.fn().mockResolvedValue(undefined),
  });
  const client = { containers: manager(), shipments: manager() };
  return client as typeof client & Terminal49Client;
}

describe('set_party_role', () => {
  it('assigns the drayage carrier, skips containers that already have it, and reports failures', async () => {
    const client = fakeClient();
    client.containers.partyRoles.mockImplementation(async (id: string) =>
      id === C2
        ? [{ id: 'pr-2', role: 'pickup_dray_carrier', partyId: PARTY }]
        : [],
    );
    client.containers.addPartyRole.mockImplementation(async (id: string) => {
      if (id === C3) {
        throw Object.assign(new Error('Party not found'), {
          name: 'ValidationError',
          status: 422,
        });
      }
    });

    const result = await executeSetPartyRole(
      {
        container_ids: [C1, C2, C3],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'add',
      },
      client,
    );

    expect(client.containers.addPartyRole).toHaveBeenCalledWith(
      C1,
      'pickup_dray_carrier',
      PARTY,
    );
    expect(result.updated).toEqual([C1]);
    expect(result.unchanged).toEqual([C2]);
    expect(result.failed).toEqual([{ id: C3, error: 'Party not found' }]);
    expect(result.summary).toBe(
      'Assigned pickup_dray_carrier on 1 container; 1 already had it; 1 failed.',
    );
  });

  it('removes only the matching role', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue([
      { id: 'pr-1', role: 'customer', partyId: PARTY },
      { id: 'pr-2', role: 'shipper', partyId: PARTY },
    ]);

    const result = await executeSetPartyRole(
      {
        shipment_ids: [C1],
        role: 'customer',
        party_id: PARTY,
        action: 'remove',
      },
      client,
    );

    expect(client.shipments.removePartyRole).toHaveBeenCalledTimes(1);
    expect(client.shipments.removePartyRole).toHaveBeenCalledWith(C1, 'pr-1');
    expect(result.updated).toEqual([C1]);
  });

  it('rejects shipment-only roles on containers and mixed record types', async () => {
    const client = fakeClient();
    await expect(
      executeSetPartyRole(
        {
          container_ids: [C1],
          role: 'customer',
          party_id: PARTY,
          action: 'add',
        },
        client,
      ),
    ).rejects.toThrow(/pickup_dray_carrier/);
    await expect(
      executeSetPartyRole(
        {
          container_ids: [C1],
          shipment_ids: [C2],
          role: 'pickup_dray_carrier',
          party_id: PARTY,
          action: 'add',
        },
        client,
      ),
    ).rejects.toThrow(/not both/);
  });
});

describe('set_custom_field', () => {
  it('sets a value where it differs and leaves matching records alone', async () => {
    const client = fakeClient();
    client.containers.customFields.mockImplementation(async (id: string) =>
      id === C2 ? [{ slug: 'sales_rep', value: 'Sofia Cortina' }] : [],
    );

    const result = await executeSetCustomField(
      {
        entity: 'container',
        ids: [C1, C2],
        api_slug: 'sales_rep',
        value: 'Sofia Cortina',
      },
      client,
    );

    expect(client.containers.setCustomField).toHaveBeenCalledTimes(1);
    expect(client.containers.setCustomField).toHaveBeenCalledWith(
      C1,
      'sales_rep',
      'Sofia Cortina',
    );
    expect(result).toMatchObject({
      updated: [C1],
      unchanged: [C2],
      failed: [],
    });
  });

  it('clears with null only where a value exists', async () => {
    const client = fakeClient();
    client.shipments.customFields.mockImplementation(async (id: string) =>
      id === C1 ? [{ slug: 'sales_rep', value: 'Sofia Cortina' }] : [],
    );

    const result = await executeSetCustomField(
      { entity: 'shipment', ids: [C1, C2], api_slug: 'sales_rep', value: null },
      client,
    );

    expect(client.shipments.clearCustomField).toHaveBeenCalledWith(
      C1,
      'sales_rep',
    );
    expect(client.shipments.clearCustomField).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ updated: [C1], unchanged: [C2] });
    expect(result.summary).toBe(
      'Cleared sales_rep on 1 shipment; 1 already empty; 0 failed.',
    );
  });

  it('does not echo unexpected error text', async () => {
    const client = fakeClient();
    client.containers.customFields.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.1:443'),
    );

    const result = await executeSetCustomField(
      { entity: 'container', ids: [C1], api_slug: 'sales_rep', value: 'X' },
      client,
    );

    expect(result.failed).toEqual([
      { id: C1, error: 'The change could not be saved.' },
    ]);
  });

  it('caps a call at 50 records', async () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    await expect(
      executeSetCustomField(
        { entity: 'container', ids, api_slug: 'sales_rep', value: 'X' },
        fakeClient(),
      ),
    ).rejects.toThrow();
  });
});
