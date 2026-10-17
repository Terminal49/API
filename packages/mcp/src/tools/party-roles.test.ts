import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import { executeGetContainer } from './get-container.js';
import { executeGetShipmentDetails } from './get-shipment-details.js';
import { PARTY_ROLES_NOTE } from './party-roles.js';

const CONTAINER_ID = '3f9a1c2e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
const SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';
const PARTY_ID = 'ba4cb904-827f-4038-8e31-1e92b3356218';
const ROLE_ID = '1d0f2a0e-5c3b-4c7e-9a52-3b6f8d2e4a11';

const container = {
  data: {
    id: CONTAINER_ID,
    type: 'container',
    attributes: { number: 'CAIU2885402', current_status: 'on_ship' },
    relationships: {},
  },
  included: [],
};

const shipment = {
  data: {
    id: SHIPMENT_ID,
    type: 'shipment',
    attributes: { bill_of_lading_number: 'MAEU123456789' },
    relationships: {},
  },
  included: [],
};

const partyRoles = (role: string, roleableType: string) => ({
  data: [
    {
      id: ROLE_ID,
      type: 'party_role',
      attributes: { role, roleable_type: roleableType },
      relationships: { party: { data: { id: PARTY_ID, type: 'party' } } },
    },
  ],
  included: [
    {
      id: PARTY_ID,
      type: 'party',
      attributes: { company_name: 'ACME LOGISTICS', nickname: 'ACME' },
    },
  ],
});

describe('party roles on snapshots', () => {
  it('adds party roles to get_container only when requested', async () => {
    const { client, requests } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: { body: container },
      [`GET /containers/${CONTAINER_ID}/party_roles`]: {
        body: partyRoles('pickup_dray_carrier', 'Cargo'),
      },
    });

    const without = await executeGetContainer({ id: CONTAINER_ID }, client);
    const withRoles = await executeGetContainer(
      { id: CONTAINER_ID, include: ['party_roles'] },
      client,
    );

    expect(without).not.toHaveProperty('party_roles');
    expect(withRoles.party_roles).toEqual([
      {
        id: ROLE_ID,
        role: 'pickup_dray_carrier',
        party_id: PARTY_ID,
        party_name: 'ACME LOGISTICS',
      },
    ]);
    expect(withRoles._metadata.includes_loaded).toContain('party_roles');
    expect(
      requests.filter((request) => request.path.endsWith('/party_roles')),
    ).toHaveLength(1);
    expect(
      requests
        .filter((request) => request.path === `/containers/${CONTAINER_ID}`)
        .map((request) => request.query.get('include')),
    ).not.toContainEqual(expect.stringContaining('party_roles'));
  });

  it('adds party roles to get_shipment_details only when requested', async () => {
    const { client } = fakeApiClient({
      [`GET /shipments/${SHIPMENT_ID}`]: { body: shipment },
      [`GET /shipments/${SHIPMENT_ID}/party_roles`]: {
        body: partyRoles('customer', 'Shipment'),
      },
    });

    const without = await executeGetShipmentDetails(
      { id: SHIPMENT_ID },
      client,
    );
    const withRoles = await executeGetShipmentDetails(
      { id: SHIPMENT_ID, include_party_roles: true },
      client,
    );

    expect(without).not.toHaveProperty('party_roles');
    expect(withRoles.party_roles).toEqual([
      {
        id: ROLE_ID,
        role: 'customer',
        party_id: PARTY_ID,
        party_name: 'ACME LOGISTICS',
      },
    ]);
    expect(withRoles._metadata.includes_loaded).toContain('party_roles');
  });

  it('keeps the snapshot and adds a note when party roles are not readable', async () => {
    const { client } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: { body: container },
      [`GET /containers/${CONTAINER_ID}/party_roles`]: { status: 403 },
    });

    const result = await executeGetContainer(
      { id: CONTAINER_ID, include: ['party_roles'] },
      client,
    );

    expect(result).toMatchObject({
      container_number: 'CAIU2885402',
      party_roles: null,
      party_roles_note: PARTY_ROLES_NOTE,
    });
    expect(result._metadata.includes_loaded).not.toContain('party_roles');
  });

  it('names a party without a company name by its nickname', async () => {
    const roles = {
      ...partyRoles('customer', 'Cargo'),
      included: [
        {
          id: PARTY_ID,
          type: 'party',
          attributes: { company_name: null, nickname: 'ACME' },
        },
      ],
    };
    const { client } = fakeApiClient({
      [`GET /containers/${CONTAINER_ID}`]: { body: container },
      [`GET /containers/${CONTAINER_ID}/party_roles`]: { body: roles },
    });

    const result = await executeGetContainer(
      { id: CONTAINER_ID, include: ['party_roles'] },
      client,
    );

    expect(result.party_roles?.[0]?.party_name).toBe('ACME');
  });
});
