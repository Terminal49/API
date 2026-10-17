/**
 * Shared party role loading for get_container and get_shipment_details.
 *
 * A party role links one company (a party) to a container or shipment in a
 * role such as customer or pickup_dray_carrier. A credential that cannot read
 * them gets a note instead of a failed snapshot.
 */

import { z } from 'zod';
import { nullableString, relationshipRef } from './api-fields.js';
import { isFeatureNotEnabled, isNotAuthorized } from './soft-results.js';

export const partyRoleSchema = z.object({
  id: z.string(),
  role: z.string().nullable(),
  party_id: z.string().nullable(),
  party_name: z.string().nullable(),
});

export type PartyRole = z.infer<typeof partyRoleSchema>;

export interface PartyRolesResult {
  party_roles: PartyRole[] | null;
  party_roles_note?: string;
}

export const PARTY_ROLES_NOTE =
  'The party roles request was not authorized or is not enabled for this account. Check the connector sign-in and account permissions.';

export const partyAttributesSchema = z
  .object({
    company_name: nullableString,
    name: nullableString,
    nickname: nullableString,
  })
  .catch({ company_name: null, name: null, nickname: null });

/** A party's display name: its company name, else its name, else its nickname. */
export function partyName(
  attributes: z.infer<typeof partyAttributesSchema>,
): string | null {
  const { company_name, name, nickname } = attributes;
  return (
    [company_name, name, nickname].map((text) => text?.trim()).find(Boolean) ??
    null
  );
}

const rawPartyRolesSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({ role: nullableString }).catch({ role: null }),
      relationships: z
        .object({ party: relationshipRef })
        .catch({ party: null }),
    }),
  ),
  included: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        attributes: partyAttributesSchema,
      }),
    )
    .catch([]),
});

export function formatPartyRoles(raw: unknown): PartyRole[] {
  const { data, included } = rawPartyRolesSchema.parse(raw);
  const names = new Map(
    included
      .filter((item) => item.type === 'party')
      .map((party) => [party.id, partyName(party.attributes)]),
  );
  return data.map((row) => {
    const partyId = row.relationships.party?.data?.id ?? null;
    return {
      id: row.id,
      role: row.attributes.role,
      party_id: partyId,
      party_name: (partyId && names.get(partyId)) ?? null,
    };
  });
}

export async function loadPartyRoles(
  load: () => Promise<unknown>,
): Promise<PartyRolesResult> {
  try {
    return { party_roles: formatPartyRoles(await load()) };
  } catch (error) {
    if (isNotAuthorized(error) || isFeatureNotEnabled(error)) {
      return { party_roles: null, party_roles_note: PARTY_ROLES_NOTE };
    }
    throw error;
  }
}
