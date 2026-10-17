import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { buildServerInstructions } from '../instructions.js';
import { fakeApiClient } from '../test/fake-api.js';
import {
  ACME_ID,
  type FixtureRole,
  OTHER_ROLE_ID,
  PARTY_CONTAINER_ID,
  PARTY_SHIPMENT_ID,
  partyRolesBody,
  RAY_ID,
  ROLE_ID,
} from '../test/party-fixtures.js';
import { auditEvents, tokenOf, writeContext } from '../test/write-context.js';
import { selectTools } from './registry.js';
import {
  executeUnassignParty,
  unassignPartyOutputSchema,
} from './unassign-party.js';

const ROLES_PATH = `/shipments/${PARTY_SHIPMENT_ID}/party_roles`;
const ACME_CUSTOMER: FixtureRole = {
  id: ROLE_ID,
  role: 'customer',
  partyId: ACME_ID,
  name: 'Acme Imports',
};

const args = (confirmation_token?: string) => ({
  entity_type: 'shipment' as const,
  entity_id: PARTY_SHIPMENT_ID,
  party_role_id: ROLE_ID,
  ...(confirmation_token ? { confirmation_token } : {}),
});

/** Party role routes whose DELETE removes the role, like the real API. */
function storedRoles(initial: FixtureRole[]) {
  let roles = initial;
  return {
    get: () => ({ body: partyRolesBody(roles) }),
    remove: () => {
      roles = roles.filter((row) => row.id !== ROLE_ID);
      return { status: 204 };
    },
    replace: (next: FixtureRole[]) => {
      roles = next;
    },
  };
}

describe('unassign_party', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('previews the role, then removes it with the token', async () => {
    const stored = storedRoles([ACME_CUSTOMER]);
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: stored.get,
      [`DELETE ${ROLES_PATH}/${ROLE_ID}`]: stored.remove,
    });

    const preview = await executeUnassignParty(
      args(),
      client,
      writeContext(client),
    );
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: {
          party_role: {
            id: ROLE_ID,
            role: 'customer',
            party_id: ACME_ID,
            party_name: 'Acme Imports',
          },
        },
        proposed: { party_role: null },
        reach: expect.stringMatching(
          /The party and its other assignments stay/,
        ),
      },
    });
    expect(unassignPartyOutputSchema.parse(preview)).toEqual(preview);
    expect(requests.map((request) => request.method)).toEqual(['GET']);

    const result = await executeUnassignParty(
      args(tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'unassigned',
      message: expect.stringMatching(/assign_party/),
      record: { entity_type: 'shipment', entity_id: PARTY_SHIPMENT_ID },
      party_role: {
        id: ROLE_ID,
        role: 'customer',
        party_id: ACME_ID,
        party_name: 'Acme Imports',
      },
      undo: 'assign_party',
    });
    expect(unassignPartyOutputSchema.parse(result)).toEqual(result);
    expect(requests.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `${ROLES_PATH}/${ROLE_ID}`,
    });
    expect(
      auditEvents(logged).map((event) => [event.phase, event.outcome]),
    ).toEqual([
      ['preview', 'confirmation_required'],
      ['execute', 'unassigned'],
    ]);
    expect(logged.join('\n')).not.toMatch(/Acme|t49ct1\./);
  });

  it('returns not_assigned and no token when the role is not on the record', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: {
        body: partyRolesBody([
          {
            id: OTHER_ROLE_ID,
            role: 'shipper',
            partyId: RAY_ID,
            name: 'Ray Drayage',
          },
        ]),
      },
    });

    const result = await executeUnassignParty(
      args(),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'not_assigned',
      party_roles: [{ id: OTHER_ROLE_ID, role: 'shipper', party_id: RAY_ID }],
    });
    expect(result).not.toHaveProperty('confirmation_token');
  });

  it('returns stale_preview when the role now links another party', async () => {
    const stored = storedRoles([ACME_CUSTOMER]);
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: stored.get,
      [`DELETE ${ROLES_PATH}/${ROLE_ID}`]: stored.remove,
    });
    const preview = await executeUnassignParty(
      args(),
      client,
      writeContext(client),
    );
    stored.replace([{ ...ACME_CUSTOMER, partyId: RAY_ID }]);

    const result = await executeUnassignParty(
      args(tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: {
        current: { party_role: { role: 'customer', party_id: RAY_ID } },
      },
    });
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('returns stale_preview when the role now has another name', async () => {
    const stored = storedRoles([ACME_CUSTOMER]);
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: stored.get,
      [`DELETE ${ROLES_PATH}/${ROLE_ID}`]: stored.remove,
    });
    const preview = await executeUnassignParty(
      args(),
      client,
      writeContext(client),
    );
    stored.replace([{ ...ACME_CUSTOMER, role: 'shipper' }]);

    const result = await executeUnassignParty(
      args(tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: { current: { party_role: { role: 'shipper' } } },
    });
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('returns not_assigned when the role disappears before the delete', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([ACME_CUSTOMER]) },
      [`DELETE ${ROLES_PATH}/${ROLE_ID}`]: { status: 404 },
    });
    const preview = await executeUnassignParty(
      args(),
      client,
      writeContext(client),
    );

    const result = await executeUnassignParty(
      args(tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ status: 'not_assigned' });
  });

  it('deletes a container role on the container route', async () => {
    const path = `/containers/${PARTY_CONTAINER_ID}/party_roles`;
    const { client, requests } = fakeApiClient({
      [`GET ${path}`]: {
        body: partyRolesBody([
          { ...ACME_CUSTOMER, role: 'pickup_dray_carrier' },
        ]),
      },
      [`DELETE ${path}/${ROLE_ID}`]: { status: 204 },
    });
    const containerArgs = (confirmation_token?: string) => ({
      ...args(confirmation_token),
      entity_type: 'container' as const,
      entity_id: PARTY_CONTAINER_ID,
    });
    const preview = await executeUnassignParty(
      containerArgs(),
      client,
      writeContext(client),
    );

    const result = await executeUnassignParty(
      containerArgs(tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'unassigned',
      record: { entity_type: 'container', entity_id: PARTY_CONTAINER_ID },
    });
    expect(requests.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `${path}/${ROLE_ID}`,
    });
  });

  it('fails closed without a confirmation secret', async () => {
    const { client, requests } = fakeApiClient({});

    const result = await executeUnassignParty(
      args(),
      client,
      writeContext(client, { confirmationSecret: undefined }),
    );

    expect(result).toMatchObject({ error: 'not_permitted' });
    expect(requests).toEqual([]);
  });

  it('tells the model where party_role_id comes from only when it can read party roles', () => {
    const withReads = buildServerInstructions(
      selectTools({ toolsets: ['core', 'operations'], readOnly: false }),
    );
    const operationsOnly = buildServerInstructions(
      selectTools({ toolsets: ['operations'], readOnly: false }),
    );

    expect(withReads).toMatch(
      /Before unassign_party, read the record's party roles/,
    );
    expect(operationsOnly).not.toMatch(/Before unassign_party/);
  });
});
