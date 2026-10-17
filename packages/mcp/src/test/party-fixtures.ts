import type { FakeRequest, FakeResponse } from './fake-api.js';

export const PARTY_SHIPMENT_ID = '0b5e3a1c-7d2f-4e6a-8b9c-1d2e3f4a5b6c';
export const PARTY_CONTAINER_ID = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
export const ACME_ID = 'ba4cb904-827f-4038-8e31-1e92b3356218';
export const RAY_ID = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';
export const ROLE_ID = '1d0f2a0e-5c3b-4c7e-9a52-3b6f8d2e4a11';
export const OTHER_ROLE_ID = '2e1f3b1f-6d4c-4d8f-8b63-4c7f9e3f5b22';

export interface FixtureRole {
  id: string;
  role: string;
  partyId: string;
  name: string;
}

/** A raw GET party_roles body with the linked parties in `included`. */
export function partyRolesBody(roles: readonly FixtureRole[]) {
  return {
    data: roles.map((row) => ({
      id: row.id,
      type: 'party_role',
      attributes: { role: row.role },
      relationships: {
        party: { data: { id: row.partyId, type: 'party' } },
      },
    })),
    included: roles.map((row) => ({
      id: row.partyId,
      type: 'party',
      attributes: { company_name: row.name },
    })),
  };
}

/** A raw POST party_roles body. */
export function createdRoleBody(id: string, role: string, partyId: string) {
  return {
    data: {
      id,
      type: 'party_role',
      attributes: { role },
      relationships: { party: { data: { id: partyId, type: 'party' } } },
    },
  };
}

/** A raw party body. */
export function partyBody(id: string, companyName: string) {
  return {
    data: { id, type: 'party', attributes: { company_name: companyName } },
  };
}

/** A raw GET /parties page with no next link. */
export function partiesPage(parties: readonly { id: string; name: string }[]) {
  return {
    data: parties.map((party) => ({
      id: party.id,
      type: 'party',
      attributes: { company_name: party.name },
    })),
    links: { next: null },
  };
}

/**
 * A GET /parties route that serves 10 full pages of other parties, then a
 * last page with `extra`, so loadParties stops before it reads `extra`.
 */
export function partiesBeyondLoadCap(
  extra: readonly { id: string; name: string }[],
  firstPage: readonly { id: string; name: string }[] = [],
) {
  return (request: FakeRequest): FakeResponse => {
    const page = Number(request.query.get('page[number]') ?? 1);
    if (page > 10) return { body: partiesPage(extra) };
    const filler = Array.from({ length: 100 - firstPage.length }, (_, i) => ({
      id: `filler-${page}-${i}`,
      name: `Filler Party ${page}-${i}`,
    }));
    return {
      body: {
        ...partiesPage(page === 1 ? [...firstPage, ...filler] : filler),
        links: { next: `/v2/parties?page[number]=${page + 1}` },
      },
    };
  };
}
