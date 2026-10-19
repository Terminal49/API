import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Terminal49Client } from '@terminal49/sdk';
import {
  CALL_BUDGET_MS,
  executeSetCustomField,
  executeSetPartyRole,
} from './record-writes.js';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const PARTY = '99999999-9999-4999-8999-999999999999';
const OTHER_PARTY = '88888888-8888-4888-8888-888888888888';

function fakeClient() {
  const manager = () => ({
    partyRoles: vi.fn(),
    addPartyRole: vi.fn().mockResolvedValue({}),
    removePartyRole: vi.fn().mockResolvedValue(undefined),
    customFields: vi.fn(),
    setCustomField: vi.fn().mockResolvedValue({}),
    deleteCustomField: vi.fn().mockResolvedValue(undefined),
  });
  const client = { containers: manager(), shipments: manager() };
  return client as typeof client & Terminal49Client;
}

function partyRoleDoc(
  ...roles: { id: string; role: string; partyId: string }[]
) {
  return {
    data: roles.map(({ id, role, partyId }) => ({
      id,
      type: 'party_role',
      attributes: { role },
      relationships: { party: { data: { type: 'party', id: partyId } } },
    })),
  };
}

describe('set_party_role', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('assigns the drayage carrier, skips containers that already have it, and reports failures', async () => {
    const client = fakeClient();
    client.containers.partyRoles.mockImplementation(async (id: string) =>
      id === C2
        ? partyRoleDoc({
            id: 'pr-2',
            role: 'pickup_dray_carrier',
            partyId: PARTY,
          })
        : partyRoleDoc(),
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

    expect(client.containers.partyRoles).toHaveBeenCalledWith(C1, {
      format: 'raw',
    });
    expect(client.containers.addPartyRole).toHaveBeenCalledWith(C1, {
      role: 'pickup_dray_carrier',
      partyId: PARTY,
    });
    expect(result.updated).toEqual([C1]);
    expect(result.unchanged).toEqual([C2]);
    expect(result.failed).toEqual([{ id: C3, error: 'Party not found' }]);
    expect(result.summary).toBe(
      'Assigned pickup_dray_carrier on 1 container; 1 already had it; 1 failed.',
    );
  });

  it('removes only the matching role', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc(
        { id: 'pr-1', role: 'customer', partyId: PARTY },
        { id: 'pr-2', role: 'shipper', partyId: PARTY },
      ),
    );

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

  it('refuses to add a second drayage carrier beside a different one', async () => {
    const client = fakeClient();
    client.containers.partyRoles.mockResolvedValue(
      partyRoleDoc({
        id: 'pr-old',
        role: 'pickup_dray_carrier',
        partyId: OTHER_PARTY,
      }),
    );

    const result = await executeSetPartyRole(
      {
        container_ids: [C1],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'add',
      },
      client,
    );

    expect(client.containers.addPartyRole).not.toHaveBeenCalled();
    expect(client.containers.removePartyRole).not.toHaveBeenCalled();
    expect(result.updated).toEqual([]);
    expect(result.failed).toEqual([
      {
        id: C1,
        error:
          'Already has a different pickup_dray_carrier. Use action "replace" to swap it.',
      },
    ]);
  });

  it('adds another party beside existing ones in a role that holds several', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({ id: 'pr-old', role: 'shipper', partyId: OTHER_PARTY }),
    );

    const result = await executeSetPartyRole(
      { shipment_ids: [C1], role: 'shipper', party_id: PARTY, action: 'add' },
      client,
    );

    expect(client.shipments.addPartyRole).toHaveBeenCalledWith(C1, {
      role: 'shipper',
      partyId: PARTY,
    });
    expect(client.shipments.removePartyRole).not.toHaveBeenCalled();
    expect(result.updated).toEqual([C1]);
  });

  it('replaces the drayage carrier: attaches the new party, then detaches the old', async () => {
    const client = fakeClient();
    const calls: string[] = [];
    client.containers.partyRoles.mockImplementation(async (id: string) =>
      id === C2
        ? partyRoleDoc({
            id: 'pr-same',
            role: 'pickup_dray_carrier',
            partyId: PARTY,
          })
        : partyRoleDoc({
            id: 'pr-old',
            role: 'pickup_dray_carrier',
            partyId: OTHER_PARTY,
          }),
    );
    client.containers.addPartyRole.mockImplementation(async () => {
      calls.push('add');
    });
    client.containers.removePartyRole.mockImplementation(
      async (_id: string, roleId: string) => {
        calls.push(`remove ${roleId}`);
      },
    );

    const result = await executeSetPartyRole(
      {
        container_ids: [C1, C2],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'replace',
      },
      client,
    );

    expect(calls).toEqual(['add', 'remove pr-old']);
    expect(client.containers.addPartyRole).toHaveBeenCalledWith(C1, {
      role: 'pickup_dray_carrier',
      partyId: PARTY,
    });
    expect(result.updated).toEqual([C1]);
    expect(result.unchanged).toEqual([C2]);
    expect(result.summary).toBe(
      'Set pickup_dray_carrier on 1 container; 1 already had only that party; 0 failed.',
    );
  });

  it('returns at the time budget, flags a half-done swap, and starts no write after it', async () => {
    vi.useFakeTimers();
    const client = fakeClient();
    const calls: string[] = [];
    const after = <T>(ms: number, value: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
    const oldCarrier = partyRoleDoc({
      id: 'pr-old',
      role: 'pickup_dray_carrier',
      partyId: OTHER_PARTY,
    });
    client.containers.partyRoles.mockImplementation((id: string) =>
      after(id === C1 ? CALL_BUDGET_MS + 5_000 : 0, oldCarrier),
    );
    client.containers.addPartyRole.mockImplementation((id: string) => {
      calls.push(`add ${id}`);
      return after(CALL_BUDGET_MS / 2, {});
    });
    client.containers.removePartyRole.mockImplementation((id: string) => {
      calls.push(`remove ${id}`);
      return after(CALL_BUDGET_MS * 3, undefined);
    });

    let result: Awaited<ReturnType<typeof executeSetPartyRole>> | undefined;
    void executeSetPartyRole(
      {
        container_ids: [C1, C2],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'replace',
      },
      client,
    ).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(CALL_BUDGET_MS);

    expect(result).toEqual({
      updated: [],
      unchanged: [],
      failed: [
        {
          id: C2,
          error:
            'Ran out of time while saving. The change may or may not have been applied; check this record before calling again.',
        },
      ],
      not_attempted: [C1],
      summary:
        'Set pickup_dray_carrier on 0 containers; 0 already had only that party; 1 failed. Ran out of time before 1 more; call again with not_attempted.',
    });
    await vi.advanceTimersByTimeAsync(CALL_BUDGET_MS * 4);
    expect(calls).toEqual([`add ${C2}`, `remove ${C2}`]);
  });

  it('keeps the new carrier when the old one is gone by the time it is detached', async () => {
    // Rails replaces a shipment's pickup_dray_carrier itself when one is added,
    // so the old assignment can already be deleted when the tool detaches it.
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({
        id: 'pr-old',
        role: 'pickup_dray_carrier',
        partyId: OTHER_PARTY,
      }),
    );
    client.shipments.removePartyRole.mockRejectedValue(
      Object.assign(new Error('Not found'), {
        name: 'NotFoundError',
        status: 404,
      }),
    );

    const result = await executeSetPartyRole(
      {
        shipment_ids: [C1],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'replace',
      },
      client,
    );

    expect(client.shipments.addPartyRole).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ updated: [C1], failed: [] });
  });

  it('says so when the new carrier is attached but the old one cannot be detached', async () => {
    const client = fakeClient();
    client.containers.partyRoles.mockResolvedValue(
      partyRoleDoc({
        id: 'pr-old',
        role: 'pickup_dray_carrier',
        partyId: OTHER_PARTY,
      }),
    );
    client.containers.removePartyRole.mockRejectedValue(
      Object.assign(new Error('Forbidden'), {
        name: 'AuthorizationError',
        status: 403,
      }),
    );

    const result = await executeSetPartyRole(
      {
        container_ids: [C1],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'replace',
      },
      client,
    );

    expect(result.failed).toEqual([
      {
        id: C1,
        error:
          'Attached the new party but could not detach another party in pickup_dray_carrier: Not allowed to change this record.',
      },
    ]);
  });

  it('warns that a detach may have applied when the connection drops after it was sent', async () => {
    const client = fakeClient();
    client.containers.partyRoles.mockResolvedValue(
      partyRoleDoc({
        id: 'pr-old',
        role: 'pickup_dray_carrier',
        partyId: OTHER_PARTY,
      }),
    );
    client.containers.removePartyRole.mockRejectedValue(
      Object.assign(new Error('read ECONNRESET'), { name: 'NetworkError' }),
    );

    const result = await executeSetPartyRole(
      {
        container_ids: [C1],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'replace',
      },
      client,
    );

    expect(result.failed).toEqual([
      {
        id: C1,
        error:
          'Attached the new party but could not detach another party in pickup_dray_carrier: Saving got no clear answer from Terminal49. The change may or may not have been applied; check this record before calling again.',
      },
    ]);
  });

  it('does not claim an attach it skipped when a detach fails', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc(
        { id: 'pr-keep', role: 'shipper', partyId: PARTY },
        { id: 'pr-old', role: 'shipper', partyId: OTHER_PARTY },
      ),
    );
    client.shipments.removePartyRole.mockRejectedValue(
      Object.assign(new Error('Forbidden'), {
        name: 'AuthorizationError',
        status: 403,
      }),
    );

    const result = await executeSetPartyRole(
      {
        shipment_ids: [C1],
        role: 'shipper',
        party_id: PARTY,
        action: 'replace',
      },
      client,
    );

    expect(client.shipments.addPartyRole).not.toHaveBeenCalled();
    expect(client.shipments.removePartyRole).toHaveBeenCalledWith(C1, 'pr-old');
    expect(result.failed).toEqual([
      {
        id: C1,
        error:
          'Kept the party but could not detach another party in shipper: Not allowed to change this record.',
      },
    ]);
  });

  it('points a second shipment customer at remove-then-add, not replace', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({ id: 'pr-old', role: 'customer', partyId: OTHER_PARTY }),
    );

    const result = await executeSetPartyRole(
      { shipment_ids: [C1], role: 'customer', party_id: PARTY, action: 'add' },
      client,
    );

    expect(client.shipments.addPartyRole).not.toHaveBeenCalled();
    expect(result.failed).toEqual([
      {
        id: C1,
        error:
          'Already has a different customer. Remove the current customer, then add the new one.',
      },
    ]);
  });

  it('refuses to replace a shipment customer instead of risking a shipment with none', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({ id: 'pr-old', role: 'customer', partyId: OTHER_PARTY }),
    );

    const result = await executeSetPartyRole(
      {
        shipment_ids: [C1],
        role: 'customer',
        party_id: PARTY,
        action: 'replace',
      },
      client,
    );

    expect(client.shipments.addPartyRole).not.toHaveBeenCalled();
    expect(client.shipments.removePartyRole).not.toHaveBeenCalled();
    expect(result.failed).toEqual([
      {
        id: C1,
        error:
          'Replacing the customer is not supported. Remove the current customer, then add the new one.',
      },
    ]);
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
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets a multi-select field, and a repeat with the options reordered is unchanged', async () => {
    const client = fakeClient();
    client.containers.customFields
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ slug: 'lanes', value: ['east', 'west'] }]);
    const args = {
      entity: 'container' as const,
      ids: [C1],
      api_slug: 'lanes',
    };

    const first = await executeSetCustomField(
      { ...args, value: ['east', 'west'] },
      client,
    );
    const repeat = await executeSetCustomField(
      { ...args, value: ['west', 'east'] },
      client,
    );

    expect(client.containers.setCustomField).toHaveBeenCalledTimes(1);
    expect(client.containers.setCustomField).toHaveBeenCalledWith(C1, 'lanes', [
      'east',
      'west',
    ]);
    expect(first).toMatchObject({ updated: [C1], unchanged: [] });
    expect(repeat).toMatchObject({ updated: [], unchanged: [C1] });
  });

  it('stops at the time budget and reports records it did not change as not attempted', async () => {
    vi.useFakeTimers();
    const client = fakeClient();
    client.containers.customFields.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([]), 9_000)),
    );
    const ids = Array.from(
      { length: 17 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );

    const pending = executeSetCustomField(
      { entity: 'container', ids, api_slug: 'sales_rep', value: 'X' },
      client,
    );
    await vi.advanceTimersByTimeAsync(CALL_BUDGET_MS * 2);
    const result = await pending;

    expect(result.updated).toEqual(ids.slice(0, 10));
    expect(result.not_attempted).toEqual(ids.slice(10));
    expect(client.containers.setCustomField).toHaveBeenCalledTimes(10);
    expect(result.summary).toBe(
      'Set sales_rep on 10 containers; 0 already had that value; 0 failed. Ran out of time before 7 more; call again with not_attempted.',
    );
  });

  it('returns at the time budget while a write is still running and flags that record', async () => {
    vi.useFakeTimers();
    const client = fakeClient();
    client.containers.customFields.mockResolvedValue([]);
    client.containers.setCustomField.mockImplementation((id: string) =>
      id === C2
        ? new Promise((resolve) => setTimeout(resolve, CALL_BUDGET_MS * 3))
        : Promise.resolve({}),
    );

    let result: Awaited<ReturnType<typeof executeSetCustomField>> | undefined;
    void executeSetCustomField(
      { entity: 'container', ids: [C1, C2], api_slug: 'sales_rep', value: 'X' },
      client,
    ).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(CALL_BUDGET_MS);

    expect(result).toEqual({
      updated: [C1],
      unchanged: [],
      failed: [
        {
          id: C2,
          error:
            'Ran out of time while saving. The change may or may not have been applied; check this record before calling again.',
        },
      ],
      not_attempted: [],
      summary:
        'Set sales_rep on 1 container; 0 already had that value; 1 failed.',
    });
  });

  it('touches no record when the deadline passed before the call started', async () => {
    const client = fakeClient();
    client.containers.customFields.mockResolvedValue([]);

    const result = await executeSetCustomField(
      { entity: 'container', ids: [C1, C2], api_slug: 'sales_rep', value: 'X' },
      client,
      Date.now() - 1,
    );

    expect(client.containers.customFields).not.toHaveBeenCalled();
    expect(result).toEqual({
      updated: [],
      unchanged: [],
      failed: [],
      not_attempted: [C1, C2],
      summary:
        'Set sales_rep on 0 containers; 0 already had that value; 0 failed. Ran out of time before 2 more; call again with not_attempted.',
    });
  });

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

    expect(client.shipments.deleteCustomField).toHaveBeenCalledWith(
      C1,
      'sales_rep',
    );
    expect(client.shipments.deleteCustomField).toHaveBeenCalledTimes(1);
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

  it('warns that a write may have applied when it fails without an API answer', async () => {
    const client = fakeClient();
    client.containers.customFields.mockResolvedValue([]);
    client.containers.setCustomField.mockImplementation(async (id: string) => {
      throw id === C1
        ? Object.assign(new Error('socket hang up'), { name: 'NetworkError' })
        : Object.assign(new Error('Bad gateway'), {
            name: 'UpstreamError',
            status: 502,
          });
    });

    const result = await executeSetCustomField(
      { entity: 'container', ids: [C1, C2], api_slug: 'sales_rep', value: 'X' },
      client,
    );

    const noClearAnswer =
      'Saving got no clear answer from Terminal49. The change may or may not have been applied; check this record before calling again.';
    expect(result.failed).toEqual([
      { id: C1, error: noClearAnswer },
      { id: C2, error: noClearAnswer },
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
