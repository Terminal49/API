import type { Transport } from '../transport.js';

/** Collections that expose `/{collection}/{id}/custom_fields` sub-resources. */
export type CustomFieldParent =
  | 'containers'
  | 'shipments'
  | 'tracking_requests';

/** Collections that expose `/{collection}/{id}/party_roles` sub-resources. */
export type PartyRoleParent = 'containers' | 'shipments';

/** Roles accepted by the `party_roles` endpoints. */
export type PartyRoleName =
  | 'shipper'
  | 'consignee'
  | 'notify_party'
  | 'customs_broker'
  | 'customer'
  | 'freight_forwarder'
  | 'pickup_dray_carrier';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function entityUrl(
  transport: Transport,
  parent: string,
  id: string,
  ...segments: string[]
): string {
  const path = [parent, id, ...segments].map(encodeURIComponent).join('/');
  return `${transport.baseUrl}/${path}`;
}

export function listCustomFields(
  transport: Transport,
  parent: CustomFieldParent,
  id: string,
): Promise<any> {
  return transport.executeManual(
    `${entityUrl(transport, parent, id, 'custom_fields')}?include=definition`,
  );
}

export function createCustomField(
  transport: Transport,
  parent: CustomFieldParent,
  id: string,
  apiSlug: string,
  value: unknown,
): Promise<any> {
  const payload = {
    data: { type: 'custom_field', attributes: { api_slug: apiSlug, value } },
  };
  return transport.executeManual(
    entityUrl(transport, parent, id, 'custom_fields'),
    { method: 'POST', body: JSON.stringify(payload), headers: JSON_HEADERS },
  );
}

export function updateCustomField(
  transport: Transport,
  parent: CustomFieldParent,
  id: string,
  apiSlug: string,
  value: unknown,
): Promise<any> {
  const payload = { data: { type: 'custom_field', attributes: { value } } };
  return transport.executeManual(
    entityUrl(transport, parent, id, 'custom_fields', apiSlug),
    { method: 'PATCH', body: JSON.stringify(payload), headers: JSON_HEADERS },
  );
}

export function deleteCustomField(
  transport: Transport,
  parent: CustomFieldParent,
  id: string,
  apiSlug: string,
): Promise<any> {
  return transport.executeManual(
    entityUrl(transport, parent, id, 'custom_fields', apiSlug),
    { method: 'DELETE' },
  );
}

export function listPartyRoles(
  transport: Transport,
  parent: PartyRoleParent,
  id: string,
): Promise<any> {
  return transport.executeManual(
    entityUrl(transport, parent, id, 'party_roles'),
  );
}

export function createPartyRole(
  transport: Transport,
  parent: PartyRoleParent,
  id: string,
  role: PartyRoleName,
  partyId: string,
): Promise<any> {
  const payload = {
    data: {
      type: 'party_role',
      attributes: { role },
      relationships: { party: { data: { type: 'party', id: partyId } } },
    },
  };
  return transport.executeManual(
    entityUrl(transport, parent, id, 'party_roles'),
    { method: 'POST', body: JSON.stringify(payload), headers: JSON_HEADERS },
  );
}

export function deletePartyRole(
  transport: Transport,
  parent: PartyRoleParent,
  id: string,
  partyRoleId: string,
): Promise<any> {
  return transport.executeManual(
    entityUrl(transport, parent, id, 'party_roles', partyRoleId),
    { method: 'DELETE' },
  );
}
