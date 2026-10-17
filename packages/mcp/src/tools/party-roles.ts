/**
 * Shared party role reads for get_container, get_shipment_details and the
 * tools that assign and unassign parties.
 *
 * A party role links one company (a party) to a container or shipment in a
 * role such as customer or pickup_dray_carrier. A credential that cannot read
 * them gets a note instead of a failed snapshot.
 */

import type { Terminal49Client } from '@terminal49/sdk';
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

/** A party's non-empty names, in the order its display name is chosen. */
export function partyNames(
  attributes: z.infer<typeof partyAttributesSchema>,
): string[] {
  const { company_name, name, nickname } = attributes;
  return [company_name, name, nickname]
    .map((text) => text?.trim())
    .filter((text): text is string => Boolean(text));
}

/** A party's display name: its company name, else its name, else its nickname. */
export function partyName(
  attributes: z.infer<typeof partyAttributesSchema>,
): string | null {
  return partyNames(attributes)[0] ?? null;
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

// ==================== Party assignment ====================

/** The roles a party can hold on a shipment. */
export const ASSIGNABLE_ROLES = [
  'shipper',
  'consignee',
  'notify_party',
  'customs_broker',
  'customer',
  'freight_forwarder',
  'pickup_dray_carrier',
] as const satisfies readonly Parameters<
  Terminal49Client['shipments']['addPartyRole']
>[1]['role'][];

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

/** The only role a container accepts. */
export const CONTAINER_ROLE = 'pickup_dray_carrier' satisfies Parameters<
  Terminal49Client['containers']['addPartyRole']
>[1]['role'];

export const PARTY_ENTITY_TYPES = ['container', 'shipment'] as const;

export type PartyEntityType = (typeof PARTY_ENTITY_TYPES)[number];

export const partyEntityInput = {
  entity_type: z
    .enum(PARTY_ENTITY_TYPES)
    .describe('The kind of record the party is linked to.'),
  entity_id: z
    .string()
    .uuid()
    .describe(
      'The Terminal49 ID (UUID format) of that record. Identifier only; never pass conversation text.',
    ),
};

/** Every party role on a container or shipment. Errors are not caught. */
export async function readPartyRoles(
  client: Terminal49Client,
  entityType: PartyEntityType,
  id: string,
): Promise<PartyRole[]> {
  const raw =
    entityType === 'container'
      ? await client.containers.partyRoles(id, { format: 'raw' })
      : await client.shipments.partyRoles(id, { format: 'raw' });
  return formatPartyRoles(raw);
}
