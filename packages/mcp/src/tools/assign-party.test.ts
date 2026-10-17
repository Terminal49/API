import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  ACME_ID,
  createdRoleBody,
  OTHER_ROLE_ID,
  PARTY_CONTAINER_ID,
  PARTY_SHIPMENT_ID,
  partiesBeyondLoadCap,
  partiesPage,
  partyBody,
  partyRolesBody,
  RAY_ID,
  ROLE_ID,
} from '../test/party-fixtures.js';
import { auditEvents, writeContext } from '../test/write-context.js';
import { assignPartyOutputSchema, executeAssignParty } from './assign-party.js';

const ROLES_PATH = `/shipments/${PARTY_SHIPMENT_ID}/party_roles`;
const NEW_PARTY_ID = 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70';

describe('assign_party', () => {
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

  it('assigns a party by id on a shipment', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: {
        body: partyRolesBody([
          {
            id: OTHER_ROLE_ID,
            role: 'customer',
            partyId: RAY_ID,
            name: 'Ray Drayage',
          },
        ]),
      },
      [`GET /parties/${ACME_ID}`]: { body: partyBody(ACME_ID, 'Acme Imports') },
      [`POST ${ROLES_PATH}`]: {
        status: 201,
        body: createdRoleBody(ROLE_ID, 'customer', ACME_ID),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_id: ACME_ID,
      },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'assigned',
      message: expect.stringMatching(/other parties in this role/),
      record: { entity_type: 'shipment', entity_id: PARTY_SHIPMENT_ID },
      party_role: {
        id: ROLE_ID,
        role: 'customer',
        party_id: ACME_ID,
        party_name: 'Acme Imports',
      },
      party_created: false,
      other_parties_in_role: [
        {
          id: OTHER_ROLE_ID,
          role: 'customer',
          party_id: RAY_ID,
          party_name: 'Ray Drayage',
        },
      ],
      undo: 'unassign_party',
    });
    expect(assignPartyOutputSchema.parse(result)).toEqual(result);
    expect(requests.at(-1)?.body).toEqual({
      data: {
        type: 'party_role',
        attributes: { role: 'customer' },
        relationships: { party: { data: { type: 'party', id: ACME_ID } } },
      },
    });
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'assign_party',
        tier: 'A',
        outcome: 'assigned',
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
      }),
    ]);
    expect(logged.join('\n')).not.toMatch(/Acme|Ray/);
  });

  it('returns already_present without writing when the party has the role', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: {
        body: partyRolesBody([
          { id: ROLE_ID, role: 'customer', partyId: ACME_ID, name: 'Acme' },
        ]),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_id: ACME_ID,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_present',
      party_role: { id: ROLE_ID, party_id: ACME_ID },
      other_parties_in_role: [],
    });
    expect(result).not.toHaveProperty('undo');
    expect(requests.map((request) => request.method)).toEqual(['GET']);
  });

  it('reuses the party whose name matches ignoring case and punctuation', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': {
        body: partiesPage([
          { id: ACME_ID, name: 'ACME Imports, Inc.' },
          { id: RAY_ID, name: 'Acme Imports Holdings' },
        ]),
      },
      [`POST ${ROLES_PATH}`]: {
        status: 201,
        body: createdRoleBody(ROLE_ID, 'shipper', ACME_ID),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'shipper',
        party_name: 'acme imports inc',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'assigned',
      party_role: { party_id: ACME_ID, party_name: 'ACME Imports, Inc.' },
      party_created: false,
    });
    expect(
      requests.some(
        (request) => request.path === '/parties' && request.method === 'POST',
      ),
    ).toBe(false);
  });

  it('finds the existing role when the name resolves to an assigned party', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: {
        body: partyRolesBody([
          { id: ROLE_ID, role: 'shipper', partyId: ACME_ID, name: 'Acme' },
        ]),
      },
      'GET /parties': { body: partiesPage([{ id: ACME_ID, name: 'Acme' }]) },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'shipper',
        party_name: 'ACME',
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_present',
      party_role: { id: ROLE_ID },
    });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('returns party_not_found with the closest names when creating is not allowed', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': {
        body: partiesPage([
          { id: ACME_ID, name: 'Acme Imports' },
          { id: RAY_ID, name: 'Ray Drayage' },
        ]),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_name: 'Acme',
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'party_not_found',
      candidates: [{ id: ACME_ID, name: 'Acme Imports' }],
    });
    expect(assignPartyOutputSchema.parse(result)).toEqual(result);
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ outcome: 'party_not_found' }),
    ]);
  });

  it('returns ambiguous_party when two parties share the name', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': {
        body: partiesPage([
          { id: ACME_ID, name: 'Acme' },
          { id: RAY_ID, name: 'ACME.' },
        ]),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_name: 'acme',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'ambiguous_party',
      candidates: [
        { id: ACME_ID, name: 'Acme' },
        { id: RAY_ID, name: 'ACME.' },
      ],
    });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('creates a missing party only when asked, then assigns it', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': { body: partiesPage([]) },
      'POST /parties': {
        status: 201,
        body: partyBody(NEW_PARTY_ID, 'Blue Harbor Trading'),
      },
      [`POST ${ROLES_PATH}`]: {
        status: 201,
        body: createdRoleBody(ROLE_ID, 'consignee', NEW_PARTY_ID),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'consignee',
        party_name: 'Blue Harbor Trading',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'assigned',
      party_role: {
        id: ROLE_ID,
        party_id: NEW_PARTY_ID,
        party_name: 'Blue Harbor Trading',
      },
      party_created: true,
    });
    const create = requests.find(
      (request) => request.method === 'POST' && request.path === '/parties',
    );
    expect(create?.body).toEqual({
      data: {
        type: 'party',
        attributes: { company_name: 'Blue Harbor Trading' },
      },
    });
  });

  it('says the party was created when the assignment is then rate limited', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': { body: partiesPage([]) },
      'POST /parties': {
        status: 201,
        body: partyBody(NEW_PARTY_ID, 'Blue Harbor Trading'),
      },
      [`POST ${ROLES_PATH}`]: {
        status: 429,
        headers: { 'Retry-After': '30' },
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'consignee',
        party_name: 'Blue Harbor Trading',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'rate_limited',
      retry_after_s: 30,
      party_created: true,
      message: expect.stringMatching(/The party was created/),
    });
    expect(assignPartyOutputSchema.parse(result)).toEqual(result);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ outcome: 'created', entity_type: 'party' }),
      expect.objectContaining({ outcome: 'rate_limited' }),
    ]);
  });

  it('reuses a party another call created first when the create is refused', async () => {
    let listed = 0;
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': () => {
        listed += 1;
        return {
          body: partiesPage(
            listed === 1 ? [] : [{ id: ACME_ID, name: 'Blue Harbor Trading' }],
          ),
        };
      },
      'POST /parties': { status: 422 },
      [`POST ${ROLES_PATH}`]: {
        status: 201,
        body: createdRoleBody(ROLE_ID, 'consignee', ACME_ID),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'consignee',
        party_name: 'Blue Harbor Trading',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'assigned',
      party_role: { party_id: ACME_ID },
      party_created: false,
    });
    expect(
      requests.filter(
        (request) => request.method === 'POST' && request.path === '/parties',
      ),
    ).toHaveLength(1);
  });

  it('returns already_present when Terminal49 says the role is taken', async () => {
    let reads = 0;
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: () => {
        reads += 1;
        return {
          body: partyRolesBody(
            reads === 1
              ? []
              : [
                  {
                    id: ROLE_ID,
                    role: 'customer',
                    partyId: ACME_ID,
                    name: 'Acme',
                  },
                ],
          ),
        };
      },
      [`GET /parties/${ACME_ID}`]: { body: partyBody(ACME_ID, 'Acme') },
      [`POST ${ROLES_PATH}`]: { status: 422 },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_id: ACME_ID,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_present',
      party_role: { id: ROLE_ID },
    });
  });

  it('returns noop when Terminal49 refuses the assignment and the role is not there', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      [`GET /parties/${ACME_ID}`]: { body: partyBody(ACME_ID, 'Acme') },
      [`POST ${ROLES_PATH}`]: { status: 422 },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_id: ACME_ID,
      },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'noop',
      message:
        'Terminal49 would not assign this party in this role. Nothing was changed.',
      alternative: 'Assign the party in the Terminal49 dashboard.',
      record: { entity_type: 'shipment', entity_id: PARTY_SHIPMENT_ID },
      party_created: false,
    });
    expect(assignPartyOutputSchema.parse(result)).toEqual(result);
  });

  it('returns noop when Terminal49 refuses the assignment and the party holds only another role', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: {
        body: partyRolesBody([
          {
            id: OTHER_ROLE_ID,
            role: 'shipper',
            partyId: ACME_ID,
            name: 'Acme',
          },
        ]),
      },
      [`GET /parties/${ACME_ID}`]: { body: partyBody(ACME_ID, 'Acme') },
      [`POST ${ROLES_PATH}`]: { status: 422 },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_id: ACME_ID,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ status: 'noop', party_created: false });
    expect(result).not.toHaveProperty('party_role');
    expect(
      requests.filter(
        (request) => request.method === 'GET' && request.path === ROLES_PATH,
      ),
    ).toHaveLength(2);
  });

  it('says the party was created when Terminal49 then refuses the assignment', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': { body: partiesPage([]) },
      'POST /parties': {
        status: 201,
        body: partyBody(NEW_PARTY_ID, 'Blue Harbor Trading'),
      },
      [`POST ${ROLES_PATH}`]: { status: 422 },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'consignee',
        party_name: 'Blue Harbor Trading',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'noop',
      message: expect.stringMatching(
        /The party was created, but it is not linked to the record\.$/,
      ),
      party_created: true,
      created_party: { id: NEW_PARTY_ID, name: 'Blue Harbor Trading' },
    });
    expect(assignPartyOutputSchema.parse(result)).toEqual(result);
  });

  it('names the created party when the assignment then fails with a server error', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': { body: partiesPage([]) },
      'POST /parties': {
        status: 201,
        body: partyBody(NEW_PARTY_ID, 'Blue Harbor Trading'),
      },
      [`POST ${ROLES_PATH}`]: { status: 500 },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'consignee',
        party_name: 'Blue Harbor Trading',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'party_not_linked',
      message: expect.stringMatching(/The party was created/),
      record: { entity_type: 'shipment', entity_id: PARTY_SHIPMENT_ID },
      party_created: true,
      created_party: { id: NEW_PARTY_ID, name: 'Blue Harbor Trading' },
    });
    expect(assignPartyOutputSchema.parse(result)).toEqual(result);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({ outcome: 'created', entity_type: 'party' }),
      expect.objectContaining({ outcome: 'party_not_linked' }),
    ]);
  });

  it('says the party was created when the read after a refused assignment is rate limited', async () => {
    let reads = 0;
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: () => {
        reads += 1;
        return reads === 1 ? { body: partyRolesBody([]) } : { status: 429 };
      },
      'GET /parties': { body: partiesPage([]) },
      'POST /parties': {
        status: 201,
        body: partyBody(NEW_PARTY_ID, 'Blue Harbor Trading'),
      },
      [`POST ${ROLES_PATH}`]: { status: 422 },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'consignee',
        party_name: 'Blue Harbor Trading',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'rate_limited',
      party_created: true,
      created_party: { id: NEW_PARTY_ID },
    });
    expect(result).toHaveProperty(
      'message',
      expect.not.stringMatching(/Nothing was changed/),
    );
  });

  it.each([false, true])(
    'neither trusts nor creates a name past the party load cap (create %s)',
    async (create) => {
      const { client, requests } = fakeApiClient({
        [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
        'GET /parties': partiesBeyondLoadCap([{ id: ACME_ID, name: 'Acme' }]),
      });

      const result = await executeAssignParty(
        {
          entity_type: 'shipment',
          entity_id: PARTY_SHIPMENT_ID,
          role: 'customer',
          party_name: 'Acme',
          create_party_if_missing: create,
        },
        client,
        writeContext(client),
      );

      expect(result).toMatchObject({
        error: 'party_lookup_incomplete',
        message: expect.stringMatching(/more than 1000 parties/),
      });
      expect(assignPartyOutputSchema.parse(result)).toEqual(result);
      expect(requests.every((request) => request.method === 'GET')).toBe(true);
    },
  );

  it('does not link a single exact match when the party list was cut off', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': partiesBeyondLoadCap(
        [{ id: RAY_ID, name: 'ACME' }],
        [{ id: ACME_ID, name: 'Acme' }],
      ),
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_name: 'Acme',
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'party_lookup_incomplete',
      candidates: [{ id: ACME_ID, name: 'Acme' }],
    });
    expect(requests.every((request) => request.method === 'GET')).toBe(true);
  });

  it('says the party probably exists when the create is refused and the name is still not found', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': { body: partiesPage([]) },
      'POST /parties': { status: 422 },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_name: 'Acme',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'party_not_found',
      message: expect.stringMatching(/probably exists already/),
      alternative: expect.stringMatching(/party_id/),
    });
  });

  it('matches a party that has only a nickname', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': {
        body: {
          data: [
            { id: ACME_ID, type: 'party', attributes: { nickname: 'Acme' } },
          ],
          links: { next: null },
        },
      },
      [`POST ${ROLES_PATH}`]: {
        status: 201,
        body: createdRoleBody(ROLE_ID, 'customer', ACME_ID),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_name: 'Acme',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'assigned',
      party_role: { party_id: ACME_ID, party_name: 'Acme' },
      party_created: false,
    });
    expect(
      requests.some(
        (request) => request.method === 'POST' && request.path === '/parties',
      ),
    ).toBe(false);
  });

  it('reports the party it created when another call linked it first', async () => {
    let reads = 0;
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: () => {
        reads += 1;
        return {
          body: partyRolesBody(
            reads === 1
              ? []
              : [
                  {
                    id: ROLE_ID,
                    role: 'consignee',
                    partyId: NEW_PARTY_ID,
                    name: 'Blue Harbor Trading',
                  },
                ],
          ),
        };
      },
      'GET /parties': { body: partiesPage([]) },
      'POST /parties': {
        status: 201,
        body: partyBody(NEW_PARTY_ID, 'Blue Harbor Trading'),
      },
      [`POST ${ROLES_PATH}`]: { status: 422 },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'consignee',
        party_name: 'Blue Harbor Trading',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_present',
      party_role: { id: ROLE_ID, party_id: NEW_PARTY_ID },
      party_created: true,
      created_party: { id: NEW_PARTY_ID, name: 'Blue Harbor Trading' },
    });
    expect(result).toHaveProperty(
      'message',
      expect.not.stringMatching(/Nothing was changed/),
    );
    expect(assignPartyOutputSchema.parse(result)).toEqual(result);
  });

  it('audits the party it creates as its own event', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': { body: partiesPage([]) },
      'POST /parties': {
        status: 201,
        body: partyBody(NEW_PARTY_ID, 'Blue Harbor Trading'),
      },
      [`POST ${ROLES_PATH}`]: { status: 422 },
    });

    await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'consignee',
        party_name: 'Blue Harbor Trading',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'assign_party',
        tier: 'A',
        phase: 'execute',
        outcome: 'created',
        entity_type: 'party',
        entity_id: NEW_PARTY_ID,
      }),
      expect.objectContaining({
        tool: 'assign_party',
        outcome: 'noop',
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
      }),
    ]);
    expect(logged.join('\n')).not.toMatch(/Blue Harbor/);
  });

  it('matches a name that is only the nickname of a party with a company name', async () => {
    const { client, requests } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
      'GET /parties': {
        body: {
          data: [
            {
              id: ACME_ID,
              type: 'party',
              attributes: {
                company_name: 'Acme Logistics LLC',
                nickname: 'ACME',
              },
            },
          ],
          links: { next: null },
        },
      },
      [`POST ${ROLES_PATH}`]: {
        status: 201,
        body: createdRoleBody(ROLE_ID, 'customer', ACME_ID),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_name: 'ACME',
        create_party_if_missing: true,
      },
      client,
      writeContext(client),
    );

    expect(result).toEqual(
      expect.objectContaining({
        status: 'assigned',
        party_role: {
          id: ROLE_ID,
          role: 'customer',
          party_id: ACME_ID,
          party_name: 'Acme Logistics LLC',
        },
        party_created: false,
      }),
    );
    expect(assignPartyOutputSchema.parse(result)).toEqual(result);
    expect(
      requests.some(
        (request) => request.method === 'POST' && request.path === '/parties',
      ),
    ).toBe(false);
  });

  it('assigns the dray carrier on a container', async () => {
    const path = `/containers/${PARTY_CONTAINER_ID}/party_roles`;
    const { client, requests } = fakeApiClient({
      [`GET ${path}`]: { body: partyRolesBody([]) },
      [`GET /parties/${RAY_ID}`]: { body: partyBody(RAY_ID, 'Ray Drayage') },
      [`POST ${path}`]: {
        status: 201,
        body: createdRoleBody(ROLE_ID, 'pickup_dray_carrier', RAY_ID),
      },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'container',
        entity_id: PARTY_CONTAINER_ID,
        role: 'pickup_dray_carrier',
        party_id: RAY_ID,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'assigned',
      record: { entity_type: 'container', entity_id: PARTY_CONTAINER_ID },
      party_role: { role: 'pickup_dray_carrier', party_id: RAY_ID },
    });
    expect(requests.at(-1)?.path).toBe(path);
  });

  it('returns party_not_found for an unknown party id', async () => {
    const { client } = fakeApiClient({
      [`GET ${ROLES_PATH}`]: { body: partyRolesBody([]) },
    });

    const result = await executeAssignParty(
      {
        entity_type: 'shipment',
        entity_id: PARTY_SHIPMENT_ID,
        role: 'customer',
        party_id: ACME_ID,
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ error: 'party_not_found', candidates: [] });
  });

  it.each([
    [
      { role: 'customer', party_id: ACME_ID, entity_type: 'container' },
      /accepts only the pickup_dray_carrier role/,
    ],
    [
      { role: 'customer', party_id: ACME_ID, party_name: 'Acme' },
      /exactly one of party_id or party_name/,
    ],
    [{ role: 'customer' }, /exactly one of party_id or party_name/],
    [
      { role: 'customer', party_id: ACME_ID, create_party_if_missing: true },
      /only with party_name/,
    ],
  ] as const)('rejects %o before any request', async (input, message) => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeAssignParty(
        {
          entity_type: 'shipment',
          entity_id:
            'entity_type' in input ? PARTY_CONTAINER_ID : PARTY_SHIPMENT_ID,
          ...input,
        },
        client,
        writeContext(client),
      ),
    ).rejects.toThrow(message);
    expect(requests).toEqual([]);
    expect(auditEvents(logged)).toEqual([]);
  });
});
