/**
 * Calls the reference number and party tools through the MCP client and the
 * HTTP handler. Each call builds a new server, as the stateless gateway does,
 * so a confirmed write proves the token survives between requests.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { callTool } from './test/call-tool.js';
import type { FakeRoutes } from './test/fake-api.js';
import {
  ACME_ID,
  createdRoleBody,
  type FixtureRole,
  PARTY_CONTAINER_ID,
  PARTY_SHIPMENT_ID,
  partiesPage,
  partyRolesBody,
  ROLE_ID,
} from './test/party-fixtures.js';
import { REF_CONTAINER_ID, storedRefNumbers } from './test/reference-record.js';
import {
  meBody,
  TEST_CONFIRMATION_SECRET,
  tokenOf,
} from './test/write-context.js';
import { addReferenceNumbersOutputSchema } from './tools/add-reference-numbers.js';
import { assignPartyOutputSchema } from './tools/assign-party.js';
import { removeReferenceNumbersOutputSchema } from './tools/remove-reference-numbers.js';
import { unassignPartyOutputSchema } from './tools/unassign-party.js';

vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const CONFIRMING = {
  toolsets: ['operations'] as const,
  confirmationSecret: TEST_CONFIRMATION_SECRET,
};
const ROLES_PATH = `/shipments/${PARTY_SHIPMENT_ID}/party_roles`;

function partyRoutes(): FakeRoutes {
  let roles: FixtureRole[] = [];
  return {
    'GET /me': { body: meBody() },
    'GET /parties': {
      body: partiesPage([{ id: ACME_ID, name: 'Acme Imports' }]),
    },
    [`GET ${ROLES_PATH}`]: () => ({ body: partyRolesBody(roles) }),
    [`POST ${ROLES_PATH}`]: () => {
      roles = [
        {
          id: ROLE_ID,
          role: 'customer',
          partyId: ACME_ID,
          name: 'Acme Imports',
        },
      ];
      return {
        status: 201,
        body: createdRoleBody(ROLE_ID, 'customer', ACME_ID),
      };
    },
    [`DELETE ${ROLES_PATH}/${ROLE_ID}`]: () => {
      roles = [];
      return { status: 204 };
    },
  };
}

describe('reference number and party tools over the MCP client transport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds a reference number, then removes it across separate requests', async () => {
    const stored = storedRefNumbers(['PO-1']);
    const routes: FakeRoutes = {
      'GET /me': { body: meBody() },
      [`GET /containers/${REF_CONTAINER_ID}`]: stored.get,
      [`PATCH /containers/${REF_CONTAINER_ID}`]: stored.patch,
    };
    const target = { entity_type: 'container', entity_id: REF_CONTAINER_ID };

    const added = await callTool(
      'add_reference_numbers',
      { ...target, add: ['PO-2'] },
      routes,
      CONFIRMING,
    );
    expect(added.isError).not.toBe(true);
    expect(added.structuredContent).toMatchObject({
      status: 'added',
      ref_numbers: ['PO-1', 'PO-2'],
    });
    expect(
      addReferenceNumbersOutputSchema.safeParse(added.structuredContent)
        .success,
    ).toBe(true);

    const preview = await callTool(
      'remove_reference_numbers',
      { ...target, remove: ['PO-2'] },
      routes,
      CONFIRMING,
    );
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
    });
    const removed = await callTool(
      'remove_reference_numbers',
      {
        ...target,
        remove: ['PO-2'],
        confirmation_token: tokenOf(preview.structuredContent),
      },
      routes,
      CONFIRMING,
    );

    expect(removed.isError).not.toBe(true);
    expect(removed.structuredContent).toMatchObject({
      status: 'removed',
      ref_numbers: ['PO-1'],
    });
    expect(
      removeReferenceNumbersOutputSchema.safeParse(removed.structuredContent)
        .success,
    ).toBe(true);
    expect(stored.current()).toEqual(['PO-1']);
  });

  it('assigns a party by name, then unassigns it across separate requests', async () => {
    const routes = partyRoutes();
    const target = { entity_type: 'shipment', entity_id: PARTY_SHIPMENT_ID };

    const assigned = await callTool(
      'assign_party',
      { ...target, role: 'customer', party_name: 'acme imports' },
      routes,
      CONFIRMING,
    );
    expect(assigned.isError).not.toBe(true);
    expect(assigned.structuredContent).toMatchObject({
      status: 'assigned',
      party_role: { id: ROLE_ID, party_id: ACME_ID },
    });
    expect(
      assignPartyOutputSchema.safeParse(assigned.structuredContent).success,
    ).toBe(true);

    const again = await callTool(
      'assign_party',
      { ...target, role: 'customer', party_id: ACME_ID },
      routes,
      CONFIRMING,
    );
    expect(again.structuredContent).toMatchObject({
      status: 'already_present',
    });

    const preview = await callTool(
      'unassign_party',
      { ...target, party_role_id: ROLE_ID },
      routes,
      CONFIRMING,
    );
    const unassigned = await callTool(
      'unassign_party',
      {
        ...target,
        party_role_id: ROLE_ID,
        confirmation_token: tokenOf(preview.structuredContent),
      },
      routes,
      CONFIRMING,
    );

    expect(unassigned.isError).not.toBe(true);
    expect(unassigned.structuredContent).toMatchObject({
      status: 'unassigned',
      undo: 'assign_party',
    });
    expect(
      unassignPartyOutputSchema.safeParse(unassigned.structuredContent).success,
    ).toBe(true);
  });

  it('returns party_not_found as a soft result', async () => {
    const result = await callTool(
      'assign_party',
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_name: 'Nobody Freight',
      },
      partyRoutes(),
      CONFIRMING,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: 'party_not_found',
    });
  });

  it('refuses a non-dray role on a container with a fixed message', async () => {
    const result = await callTool(
      'assign_party',
      {
        entity_type: 'container',
        entity_id: PARTY_CONTAINER_ID,
        role: 'customer',
        party_id: ACME_ID,
      },
      {},
      CONFIRMING,
    );

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      "A container accepts only the pickup_dray_carrier role. Assign customer on the container's shipment.",
    );
  });

  it.each([
    [
      'add_reference_numbers',
      { entity_type: 'tracking_request', add: ['PO-1'] },
      'tracking request',
    ],
    [
      'remove_reference_numbers',
      { entity_type: 'shipment', remove: ['PO-1'] },
      'shipment',
    ],
    [
      'assign_party',
      { entity_type: 'shipment', role: 'customer', party_id: ACME_ID },
      'shipment',
    ],
    [
      'unassign_party',
      { entity_type: 'container', party_role_id: ROLE_ID },
      'container',
    ],
  ])(
    'names the missing record when %s reads a 404',
    async (name, args, label) => {
      const result = await callTool(
        name,
        { ...args, entity_id: PARTY_SHIPMENT_ID },
        { 'GET /me': { body: meBody() } },
        CONFIRMING,
      );

      expect(result.isError).toBe(true);
      expect(result.text).toBe(
        `No ${label} found with id ${PARTY_SHIPMENT_ID}.`,
      );
    },
  );
});
