import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client } from './client.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';

const partyRolesDoc = {
  data: [
    {
      id: 'pr-1',
      type: 'party_role',
      attributes: { role: 'pickup_dray_carrier' },
      relationships: { party: { data: { id: 'party-1', type: 'party' } } },
    },
  ],
  included: [
    {
      id: 'party-1',
      type: 'party',
      attributes: { company_name: 'Manzo Transport' },
    },
  ],
};

function buildClient(
  handlers: Parameters<typeof createMockFetch>[0],
): ReturnType<typeof createMockFetch> & { client: Terminal49Client } {
  const mock = createMockFetch(handlers);
  const client = new Terminal49Client({
    apiToken: 'token-123',
    apiBaseUrl: baseUrl,
    fetchImpl: mock.fetchImpl,
  } as any);
  return { ...mock, client };
}

describe('party roles', () => {
  it('lists a container’s party roles with their parties', async () => {
    const { client, calls } = buildClient({
      '/containers/c1/party_roles?include=party': () =>
        jsonResponse(partyRolesDoc),
    });

    const roles = await client.containers.partyRoles('c1', {
      format: 'mapped',
    });

    expect(calls[0].url.pathname).toBe('/v2/containers/c1/party_roles');
    expect(roles).toEqual([
      {
        id: 'pr-1',
        role: 'pickup_dray_carrier',
        partyId: 'party-1',
        partyName: 'Manzo Transport',
      },
    ]);
  });

  it('assigns a party to a shipment in a role', async () => {
    const { client, calls } = buildClient({
      '/shipments/s1/party_roles': () =>
        jsonResponse({ data: partyRolesDoc.data[0] }, 201),
    });

    await client.shipments.addPartyRole('s1', 'customer', 'party-1');

    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      data: {
        type: 'party_role',
        attributes: { role: 'customer' },
        relationships: { party: { data: { type: 'party', id: 'party-1' } } },
      },
    });
  });

  it('removes a party role by id', async () => {
    const { client, calls } = buildClient({
      '/containers/c1/party_roles/pr-1': () =>
        new Response(null, { status: 204 }),
    });

    await client.containers.removePartyRole('c1', 'pr-1');

    expect(calls[0].init?.method).toBe('DELETE');
  });
});

describe('clearing custom fields', () => {
  it('deletes the value by api_slug', async () => {
    const { client, calls } = buildClient({
      '/shipments/s1/custom_fields/sales_rep': () =>
        new Response(null, { status: 204 }),
    });

    await client.shipments.clearCustomField('s1', 'sales_rep');

    expect(calls[0].init?.method).toBe('DELETE');
    expect(calls[0].url.pathname).toBe(
      '/v2/shipments/s1/custom_fields/sales_rep',
    );
  });
});
