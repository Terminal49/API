import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import type { Terminal49Client } from '@terminal49/sdk';
import {
  CALL_BUDGET_MS,
  executeSetCustomField,
  executeSetPartyRole,
} from './record-writes.js';
import { auditEvents, tokenOf, writeContext } from '../test/write-context.js';

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '33333333-3333-4333-8333-333333333333';
const PARTY = '99999999-9999-4999-8999-999999999999';
const OTHER_PARTY = '88888888-8888-4888-8888-888888888888';
const MISSING_PARTY = '77777777-7777-4777-8777-777777777777';

const PARTY_ID_HINT =
  "Use the party_id shown in the record's party_roles (get_container include ['party_roles'] or get_shipment_details include_party_roles), not an id from list_parties, which can list a customer under its account id.";

function fakeClient() {
  const manager = () => ({
    partyRoles: vi.fn(),
    addPartyRole: vi.fn().mockResolvedValue({}),
    removePartyRole: vi.fn().mockResolvedValue(undefined),
    customFields: vi.fn(),
    setCustomField: vi.fn().mockResolvedValue({}),
    deleteCustomField: vi.fn().mockResolvedValue(undefined),
  });
  const client = {
    containers: manager(),
    shipments: manager(),
    parties: {
      get: vi.fn(async (id: string) => ({
        data: {
          id,
          type: 'party',
          attributes: { company_name: id === PARTY ? 'Manzo Transport' : null },
        },
      })),
    },
  };
  return client as typeof client & Terminal49Client;
}

type Client = ReturnType<typeof fakeClient>;
type PartyRoleArgs = Parameters<typeof executeSetPartyRole>[0];
type CustomFieldArgs = Parameters<typeof executeSetCustomField>[0];

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
    included: [
      {
        id: OTHER_PARTY,
        type: 'party',
        attributes: { company_name: 'Old Dray Co' },
      },
    ],
  };
}

const notFound = () =>
  Object.assign(new Error('Not found'), {
    name: 'NotFoundError',
    status: 404,
  });

/** Runs a call, and when it asks for approval, runs it again with the token. */
async function approved<T extends object>(
  call: (extra: { confirmation_token?: string }) => Promise<T>,
): Promise<T> {
  const first = await call({});
  if (!('status' in first) || first.status !== 'confirmation_required') {
    return first;
  }
  return call({ confirmation_token: tokenOf(first) });
}

describe('set_party_role', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const setParty = (
    client: Client,
    args: Parameters<typeof executeSetPartyRole>[0],
  ) =>
    approved((extra) =>
      executeSetPartyRole({ ...args, ...extra }, client, writeContext(client)),
    );

  it('assigns the drayage carrier at once, skips containers that already have it, and reports failures', async () => {
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
      writeContext(client),
    );

    expect(client.containers.partyRoles).toHaveBeenCalledWith(C1, {
      format: 'raw',
    });
    expect(client.containers.addPartyRole).toHaveBeenCalledWith(C1, {
      role: 'pickup_dray_carrier',
      partyId: PARTY,
    });
    expect(result).toEqual({
      updated: [C1],
      unchanged: [C2],
      failed: [{ id: C3, error: 'Party not found' }],
      not_attempted: [],
      summary:
        'Assigned pickup_dray_carrier on 1 container; 1 already had it; 1 failed.',
    });
  });

  it('previews a remove, lists only the records that change, and writes once the token comes back', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockImplementation(async (id: string) =>
      id === C1
        ? partyRoleDoc(
            { id: 'pr-1', role: 'customer', partyId: PARTY },
            { id: 'pr-2', role: 'shipper', partyId: PARTY },
          )
        : partyRoleDoc(),
    );
    const args = {
      shipment_ids: [C1, C2],
      role: 'customer' as const,
      party_id: PARTY,
      action: 'remove' as const,
    };

    const preview = await executeSetPartyRole(
      args,
      client,
      writeContext(client),
    );

    expect(client.shipments.removePartyRole).not.toHaveBeenCalled();
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        reach:
          'Detaches Manzo Transport from the customer role on 1 shipment. 1 unchanged.',
        changes: [
          {
            id: C1,
            current: [{ party_id: PARTY, party_name: null }],
            proposed: [],
          },
        ],
        unchanged: 1,
        failed: [],
        not_attempted: [],
      },
    });

    const result = await executeSetPartyRole(
      { ...args, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(client.shipments.removePartyRole).toHaveBeenCalledTimes(1);
    expect(client.shipments.removePartyRole).toHaveBeenCalledWith(C1, 'pr-1');
    expect(result).toEqual({
      updated: [C1],
      unchanged: [C2],
      failed: [],
      not_attempted: [],
      summary:
        'Removed customer on 1 shipment; 1 already without it; 0 failed.',
    });
  });

  it('asks again when a record changed between the preview and the approval', async () => {
    const client = fakeClient();
    let c2Roles = partyRoleDoc();
    client.containers.partyRoles.mockImplementation(async (id: string) =>
      id === C1
        ? partyRoleDoc({
            id: 'pr-old',
            role: 'pickup_dray_carrier',
            partyId: OTHER_PARTY,
          })
        : c2Roles,
    );
    const args = {
      container_ids: [C1, C2],
      role: 'pickup_dray_carrier' as const,
      party_id: PARTY,
      action: 'replace' as const,
    };

    const preview = await executeSetPartyRole(
      args,
      client,
      writeContext(client),
    );
    // C2 had no carrier in the preview and gains one before the approval.
    c2Roles = partyRoleDoc({
      id: 'pr-c2',
      role: 'pickup_dray_carrier',
      partyId: OTHER_PARTY,
    });
    const stale = await executeSetPartyRole(
      { ...args, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(client.containers.addPartyRole).not.toHaveBeenCalled();
    expect(client.containers.removePartyRole).not.toHaveBeenCalled();
    expect(stale).toMatchObject({
      status: 'stale_preview',
      preview: {
        changes: [
          {
            id: C1,
            current: [{ party_id: OTHER_PARTY, party_name: 'Old Dray Co' }],
            proposed: [{ party_id: PARTY, party_name: 'Manzo Transport' }],
          },
          {
            id: C2,
            current: [{ party_id: OTHER_PARTY, party_name: 'Old Dray Co' }],
            proposed: [{ party_id: PARTY, party_name: 'Manzo Transport' }],
          },
        ],
      },
    });
  });

  it('fails a remove whose party_id matches no role while the role is held, instead of reporting unchanged', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({ id: 'pr-old', role: 'customer', partyId: OTHER_PARTY }),
    );

    const result = await setParty(client, {
      shipment_ids: [C1],
      role: 'customer',
      party_id: PARTY,
      action: 'remove',
    });

    expect(client.shipments.removePartyRole).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      updated: [],
      unchanged: [],
      failed: [
        {
          id: C1,
          error: `No customer with party_id ${PARTY} on this record; it has Old Dray Co. ${PARTY_ID_HINT}`,
        },
      ],
    });
  });

  it('reports a remove of a party no record holds in that role as unchanged', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({ id: 'pr-2', role: 'shipper', partyId: PARTY }),
    );

    const result = await setParty(client, {
      shipment_ids: [C1],
      role: 'customer',
      party_id: PARTY,
      action: 'remove',
    });

    expect(result).toMatchObject({ updated: [], unchanged: [C1], failed: [] });
  });

  it('stops before any record when Terminal49 has no party with that id', async () => {
    const client = fakeClient();
    client.parties.get.mockRejectedValue(notFound());

    const result = await executeSetPartyRole(
      {
        container_ids: [C1],
        role: 'pickup_dray_carrier',
        party_id: MISSING_PARTY,
        action: 'add',
      },
      client,
      writeContext(client),
    );

    expect(client.containers.partyRoles).not.toHaveBeenCalled();
    expect(result).toEqual({
      error: 'party_not_found',
      message: `Terminal49 has no party with id ${MISSING_PARTY}, so nothing was changed.`,
      alternative: PARTY_ID_HINT,
    });
  });

  it('explains a 404 on attach as a wrong party_id, not a missing record', async () => {
    const client = fakeClient();
    client.containers.partyRoles.mockResolvedValue(partyRoleDoc());
    client.containers.addPartyRole.mockRejectedValue(notFound());

    const result = await setParty(client, {
      container_ids: [C1],
      role: 'pickup_dray_carrier',
      party_id: PARTY,
      action: 'add',
    });

    expect(result).toMatchObject({
      failed: [
        {
          id: C1,
          error: `Terminal49 has no party with id ${PARTY}. ${PARTY_ID_HINT}`,
        },
      ],
    });
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

    const result = await setParty(client, {
      container_ids: [C1],
      role: 'pickup_dray_carrier',
      party_id: PARTY,
      action: 'add',
    });

    expect(client.containers.addPartyRole).not.toHaveBeenCalled();
    expect(client.containers.removePartyRole).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      updated: [],
      failed: [
        {
          id: C1,
          error:
            'Already has a different pickup_dray_carrier. Use action "replace" to swap it.',
        },
      ],
    });
  });

  it('adds another party beside existing ones in a role that holds several', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({ id: 'pr-old', role: 'shipper', partyId: OTHER_PARTY }),
    );

    const result = await setParty(client, {
      shipment_ids: [C1],
      role: 'shipper',
      party_id: PARTY,
      action: 'add',
    });

    expect(client.shipments.addPartyRole).toHaveBeenCalledWith(C1, {
      role: 'shipper',
      partyId: PARTY,
    });
    expect(client.shipments.removePartyRole).not.toHaveBeenCalled();
    expect(result).toMatchObject({ updated: [C1] });
  });

  it('replaces the drayage carrier after approval: attaches the new party, then detaches the old', async () => {
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
    const args = {
      container_ids: [C1, C2],
      role: 'pickup_dray_carrier' as const,
      party_id: PARTY,
      action: 'replace' as const,
    };

    const preview = await executeSetPartyRole(
      args,
      client,
      writeContext(client),
    );
    expect(calls).toEqual([]);
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        reach:
          'Makes Manzo Transport the only pickup_dray_carrier on 1 container; 1 of them lose the party now in that role. 1 unchanged.',
        changes: [{ id: C1 }],
      },
    });

    const result = await executeSetPartyRole(
      { ...args, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(calls).toEqual(['add', 'remove pr-old']);
    expect(client.containers.addPartyRole).toHaveBeenCalledWith(C1, {
      role: 'pickup_dray_carrier',
      partyId: PARTY,
    });
    expect(result).toMatchObject({
      updated: [C1],
      unchanged: [C2],
      summary:
        'Set pickup_dray_carrier on 1 container; 1 already had only that party; 0 failed.',
    });
  });

  it('runs a replace that detaches nobody at once', async () => {
    const client = fakeClient();
    client.containers.partyRoles.mockResolvedValue(partyRoleDoc());

    const result = await executeSetPartyRole(
      {
        container_ids: [C1],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'replace',
      },
      client,
      writeContext(client),
    );

    expect(client.containers.addPartyRole).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ updated: [C1], unchanged: [] });
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
    // C1 is never read in time: reads get half the budget.
    client.containers.partyRoles.mockImplementation((id: string) =>
      after(id === C1 ? CALL_BUDGET_MS * 2 : 0, oldCarrier),
    );
    client.containers.addPartyRole.mockImplementation((id: string) => {
      calls.push(`add ${id}`);
      return after(CALL_BUDGET_MS / 4, {});
    });
    client.containers.removePartyRole.mockImplementation((id: string) => {
      calls.push(`remove ${id}`);
      return after(CALL_BUDGET_MS * 3, undefined);
    });
    const args = {
      container_ids: [C1, C2],
      role: 'pickup_dray_carrier' as const,
      party_id: PARTY,
      action: 'replace' as const,
    };

    let preview: Awaited<ReturnType<typeof executeSetPartyRole>> | undefined;
    void executeSetPartyRole(args, client, writeContext(client)).then(
      (value) => {
        preview = value;
      },
    );
    await vi.advanceTimersByTimeAsync(CALL_BUDGET_MS);
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: { changes: [{ id: C2 }], not_attempted: [C1] },
    });

    let result: Awaited<ReturnType<typeof executeSetPartyRole>> | undefined;
    void executeSetPartyRole(
      { ...args, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
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
    client.shipments.removePartyRole.mockRejectedValue(notFound());

    const result = await setParty(client, {
      shipment_ids: [C1],
      role: 'pickup_dray_carrier',
      party_id: PARTY,
      action: 'replace',
    });

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

    const result = await setParty(client, {
      container_ids: [C1],
      role: 'pickup_dray_carrier',
      party_id: PARTY,
      action: 'replace',
    });

    expect(result).toMatchObject({
      failed: [
        {
          id: C1,
          error:
            'Attached the new party but could not detach another party in pickup_dray_carrier: Not allowed to change this record.',
        },
      ],
    });
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

    const result = await setParty(client, {
      container_ids: [C1],
      role: 'pickup_dray_carrier',
      party_id: PARTY,
      action: 'replace',
    });

    expect(result).toMatchObject({
      failed: [
        {
          id: C1,
          error:
            'Attached the new party but could not detach another party in pickup_dray_carrier: Saving got no clear answer from Terminal49. The change may or may not have been applied; check this record before calling again.',
        },
      ],
    });
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

    const result = await setParty(client, {
      shipment_ids: [C1],
      role: 'shipper',
      party_id: PARTY,
      action: 'replace',
    });

    expect(client.shipments.addPartyRole).not.toHaveBeenCalled();
    expect(client.shipments.removePartyRole).toHaveBeenCalledWith(C1, 'pr-old');
    expect(result).toMatchObject({
      failed: [
        {
          id: C1,
          error:
            'Kept the party but could not detach another party in shipper: Not allowed to change this record.',
        },
      ],
    });
  });

  it('points a second shipment customer at remove-then-add, not replace', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({ id: 'pr-old', role: 'customer', partyId: OTHER_PARTY }),
    );

    const result = await setParty(client, {
      shipment_ids: [C1],
      role: 'customer',
      party_id: PARTY,
      action: 'add',
    });

    expect(client.shipments.addPartyRole).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failed: [
        {
          id: C1,
          error:
            'Already has a different customer. Remove the current customer, then add the new one.',
        },
      ],
    });
  });

  it('refuses to replace a shipment customer instead of risking a shipment with none', async () => {
    const client = fakeClient();
    client.shipments.partyRoles.mockResolvedValue(
      partyRoleDoc({ id: 'pr-old', role: 'customer', partyId: OTHER_PARTY }),
    );

    const result = await setParty(client, {
      shipment_ids: [C1],
      role: 'customer',
      party_id: PARTY,
      action: 'replace',
    });

    expect(client.shipments.addPartyRole).not.toHaveBeenCalled();
    expect(client.shipments.removePartyRole).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      failed: [
        {
          id: C1,
          error:
            'Replacing the customer is not supported. Remove the current customer, then add the new one.',
        },
      ],
    });
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
        writeContext(client),
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
        writeContext(client),
      ),
    ).rejects.toThrow(/not both/);
  });
});

describe('set_custom_field', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const setField = (
    client: Client,
    args: Parameters<typeof executeSetCustomField>[0],
  ) =>
    approved((extra) =>
      executeSetCustomField(
        { ...args, ...extra },
        client,
        writeContext(client),
      ),
    );

  it('fills a multi-select field at once, and a repeat with the options reordered is unchanged', async () => {
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
      writeContext(client),
    );
    const repeat = await executeSetCustomField(
      { ...args, value: ['west', 'east'] },
      client,
      writeContext(client),
    );

    expect(client.containers.setCustomField).toHaveBeenCalledTimes(1);
    expect(client.containers.setCustomField).toHaveBeenCalledWith(C1, 'lanes', [
      'east',
      'west',
    ]);
    expect(first).toMatchObject({ updated: [C1], unchanged: [] });
    expect(repeat).toMatchObject({ updated: [], unchanged: [C1] });
  });

  it('previews an overwrite with the current and new value, and writes with the token', async () => {
    const client = fakeClient();
    client.containers.customFields.mockImplementation(async (id: string) =>
      id === C1 ? [{ slug: 'sales_rep', value: 'Old Rep' }] : [],
    );
    const args = {
      entity: 'container' as const,
      ids: [C1, C2, C3],
      api_slug: 'sales_rep',
      value: 'Sofia Cortina',
    };

    const preview = await executeSetCustomField(
      args,
      client,
      writeContext(client),
    );

    expect(client.containers.setCustomField).not.toHaveBeenCalled();
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        reach:
          'Sets sales_rep to "Sofia Cortina" on 3 containers; 1 of them lose a current value.',
        changes: [
          { id: C1, current: 'Old Rep', proposed: 'Sofia Cortina' },
          { id: C2, current: null, proposed: 'Sofia Cortina' },
          { id: C3, current: null, proposed: 'Sofia Cortina' },
        ],
        unchanged: 0,
      },
    });

    const result = await executeSetCustomField(
      { ...args, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(client.containers.setCustomField).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ updated: [C1, C2, C3], failed: [] });
  });

  it('rejects a token issued for a different batch', async () => {
    const client = fakeClient();
    client.containers.customFields.mockResolvedValue([
      { slug: 'sales_rep', value: 'Old Rep' },
    ]);
    const args = {
      entity: 'container' as const,
      ids: [C1],
      api_slug: 'sales_rep',
      value: 'New Rep',
    };

    const preview = await executeSetCustomField(
      args,
      client,
      writeContext(client),
    );
    const result = await executeSetCustomField(
      { ...args, ids: [C1, C2], confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(client.containers.setCustomField).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
  });

  it('stops reading at half the budget and reports the rest as not attempted', async () => {
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
      writeContext(client),
    );
    await vi.advanceTimersByTimeAsync(CALL_BUDGET_MS * 2);
    const result = await pending;

    // Five reads finish at 9s; the second round would end past the 10s read
    // deadline, so only the first five records are written.
    expect(client.containers.setCustomField).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      updated: ids.slice(0, 5),
      unchanged: [],
      failed: [],
      not_attempted: ids.slice(5),
      summary:
        'Set sales_rep on 5 containers; 0 already had that value; 0 failed. Ran out of time before 12 more; call again with not_attempted.',
    });
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
      writeContext(client),
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
      writeContext(client, { writeDeadlineAt: Date.now() - 1 }),
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

  it('fills a value where the field is empty and leaves matching records alone', async () => {
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
      writeContext(client),
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

  it('clears with null after approval, only where a value exists', async () => {
    const client = fakeClient();
    client.shipments.customFields.mockImplementation(async (id: string) =>
      id === C1 ? [{ slug: 'sales_rep', value: 'Sofia Cortina' }] : [],
    );
    const args = {
      entity: 'shipment' as const,
      ids: [C1, C2],
      api_slug: 'sales_rep',
      value: null,
    };

    const preview = await executeSetCustomField(
      args,
      client,
      writeContext(client),
    );
    expect(client.shipments.deleteCustomField).not.toHaveBeenCalled();
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        reach: 'Clears sales_rep on 1 shipment. 1 unchanged.',
        changes: [{ id: C1, current: 'Sofia Cortina', proposed: null }],
      },
    });

    const result = await executeSetCustomField(
      { ...args, confirmation_token: tokenOf(preview) },
      client,
      writeContext(client),
    );

    expect(client.shipments.deleteCustomField).toHaveBeenCalledWith(
      C1,
      'sales_rep',
    );
    expect(client.shipments.deleteCustomField).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      updated: [C1],
      unchanged: [C2],
      summary: 'Cleared sales_rep on 1 shipment; 1 already empty; 0 failed.',
    });
  });

  it('reports a clear of fields that are already empty as unchanged, with no preview', async () => {
    const client = fakeClient();
    client.shipments.customFields.mockResolvedValue([
      { slug: 'sales_rep', value: '' },
    ]);

    const result = await executeSetCustomField(
      { entity: 'shipment', ids: [C1], api_slug: 'sales_rep', value: null },
      client,
      writeContext(client),
    );

    expect(client.shipments.deleteCustomField).not.toHaveBeenCalled();
    expect(result).toEqual({
      updated: [],
      unchanged: [C1],
      failed: [],
      not_attempted: [],
      summary: 'Cleared sales_rep on 0 shipments; 1 already empty; 0 failed.',
    });
  });

  it('does not echo unexpected error text', async () => {
    const client = fakeClient();
    client.containers.customFields.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.1:443'),
    );

    const result = await executeSetCustomField(
      { entity: 'container', ids: [C1], api_slug: 'sales_rep', value: 'X' },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      failed: [{ id: C1, error: 'The change could not be saved.' }],
    });
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

    const result = await setField(client, {
      entity: 'container',
      ids: [C1, C2],
      api_slug: 'sales_rep',
      value: 'X',
    });

    const noClearAnswer =
      'Saving got no clear answer from Terminal49. The change may or may not have been applied; check this record before calling again.';
    expect(result).toMatchObject({
      failed: [
        { id: C1, error: noClearAnswer },
        { id: C2, error: noClearAnswer },
      ],
    });
  });

  it('caps a call at 50 records', async () => {
    const ids = Array.from(
      { length: 51 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const client = fakeClient();
    await expect(
      executeSetCustomField(
        { entity: 'container', ids, api_slug: 'sales_rep', value: 'X' },
        client,
        writeContext(client),
      ),
    ).rejects.toThrow();
  });
});

describe('set_party_role party lookup', () => {
  const logged: string[] = [];

  beforeEach(() => {
    logged.length = 0;
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const args: PartyRoleArgs = {
    container_ids: [C1],
    role: 'pickup_dray_carrier',
    party_id: PARTY,
    action: 'add',
  };

  it('returns rate_limited, and audits it, when Terminal49 limits the party lookup', async () => {
    const client = fakeClient();
    client.parties.get.mockRejectedValue(
      Object.assign(new Error('Too many requests'), {
        name: 'RateLimitError',
        status: 429,
        retryAfterMs: 30_000,
      }),
    );

    const result = await executeSetPartyRole(
      args,
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      error: 'rate_limited',
      message:
        'Terminal49 is limiting how often this change can be made. Nothing was changed.',
      alternative: 'Wait 30 seconds and try again.',
      retry_after_s: 30,
    });
    expect(client.containers.partyRoles).not.toHaveBeenCalled();
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'set_party_role',
        outcome: 'rate_limited',
      }),
    ]);
  });

  it('audits a party_id that names no party', async () => {
    const client = fakeClient();
    client.parties.get.mockRejectedValue(notFound());

    await executeSetPartyRole(
      { ...args, party_id: MISSING_PARTY },
      client,
      writeContext(client),
    );

    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'set_party_role',
        outcome: 'party_not_found',
      }),
    ]);
  });

  it('gives up on a party lookup that outlasts the read budget and touches no record', async () => {
    const client = fakeClient();
    client.parties.get.mockReturnValue(new Promise(() => {}));

    const result = await executeSetPartyRole(
      args,
      client,
      writeContext(client, { writeDeadlineAt: Date.now() + 40 }),
    );

    expect(client.containers.partyRoles).not.toHaveBeenCalled();
    expect(result).toEqual({
      updated: [],
      unchanged: [],
      failed: [],
      not_attempted: [C1],
      summary:
        'Assigned pickup_dray_carrier on 0 containers; 0 already had it; 0 failed. Ran out of time before 1 more; call again with not_attempted.',
    });
  });
});

describe('record writes without a confirmation secret', () => {
  it('still runs a call that only adds', async () => {
    const client = fakeClient();
    client.containers.partyRoles.mockResolvedValue(partyRoleDoc());

    const result = await executeSetPartyRole(
      {
        container_ids: [C1],
        role: 'pickup_dray_carrier',
        party_id: PARTY,
        action: 'add',
      },
      client,
      writeContext(client, { confirmationSecret: undefined }),
    );

    expect(client.containers.addPartyRole).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ updated: [C1] });
  });

  it('refuses a call in which a record would lose a value, naming the missing variable', async () => {
    const client = fakeClient();
    client.containers.customFields.mockResolvedValue([
      { slug: 'sales_rep', value: 'Sofia Cortina' },
    ]);

    const result = await executeSetCustomField(
      { entity: 'container', ids: [C1], api_slug: 'sales_rep', value: null },
      client,
      writeContext(client, { confirmationSecret: undefined }),
    );

    expect(client.containers.deleteCustomField).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      error: 'not_permitted',
      message: expect.stringContaining('T49_MCP_CONFIRMATION_SECRET'),
    });
  });
});

/**
 * The server remembers spent confirmations per process, so a replay has to
 * be refused by the approval's binding alone when it reaches another
 * instance. A fresh module tree stands in for that instance.
 */
describe('an approval replayed on another server instance', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('cannot clear a custom field again after the value was put back', async () => {
    const client = fakeClient();
    let updatedAt = '2026-10-01T00:00:00Z';
    client.containers.customFields.mockImplementation(async () => [
      { slug: 'po_number', value: 'PO-1', updatedAt },
    ]);
    const args: CustomFieldArgs = {
      entity: 'container',
      ids: [C1],
      api_slug: 'po_number',
      value: null,
    };

    const preview = await executeSetCustomField(
      args,
      client,
      writeContext(client),
    );
    const confirmation_token = tokenOf(preview);
    await executeSetCustomField(
      { ...args, confirmation_token },
      client,
      writeContext(client),
    );
    expect(client.containers.deleteCustomField).toHaveBeenCalledTimes(1);

    updatedAt = '2026-10-01T00:04:00Z';
    vi.resetModules();
    const other = await import('./record-writes.js');
    const replay = await other.executeSetCustomField(
      { ...args, confirmation_token },
      client,
      writeContext(client),
    );

    expect(replay).toMatchObject({ status: 'stale_preview' });
    expect(client.containers.deleteCustomField).toHaveBeenCalledTimes(1);
  });

  it('cannot detach a party again after it was attached back', async () => {
    const client = fakeClient();
    let assignment = 'pr-1';
    client.containers.partyRoles.mockImplementation(async () =>
      partyRoleDoc({
        id: assignment,
        role: 'pickup_dray_carrier',
        partyId: PARTY,
      }),
    );
    const args: PartyRoleArgs = {
      container_ids: [C1],
      role: 'pickup_dray_carrier',
      party_id: PARTY,
      action: 'remove',
    };

    const preview = await executeSetPartyRole(
      args,
      client,
      writeContext(client),
    );
    const confirmation_token = tokenOf(preview);
    await executeSetPartyRole(
      { ...args, confirmation_token },
      client,
      writeContext(client),
    );
    expect(client.containers.removePartyRole).toHaveBeenCalledTimes(1);

    assignment = 'pr-2';
    vi.resetModules();
    const other = await import('./record-writes.js');
    const replay = await other.executeSetPartyRole(
      { ...args, confirmation_token },
      client,
      writeContext(client),
    );

    expect(replay).toMatchObject({ status: 'stale_preview' });
    expect(client.containers.removePartyRole).toHaveBeenCalledTimes(1);
  });
});
