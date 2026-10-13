import { JsonApiDocument } from '../jsonapi.js';
import type { Transport } from '../transport.js';

/** Records that carry party roles and custom fields through these endpoints. */
export type WritableRecordPath = 'containers' | 'shipments';

/** A party attached to a container or shipment in a role. */
export interface PartyRoleAssignment {
  id: string;
  role: string;
  partyId: string | null;
  partyName: string | null;
}

function recordUrl(
  transport: Transport,
  path: WritableRecordPath,
  id: string,
  suffix: string,
): string {
  return `${transport.baseUrl}/${path}/${encodeURIComponent(id)}/${suffix}`;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return body === undefined
    ? { method }
    : {
        method,
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      };
}

export function mapPartyRoles(doc: any): PartyRoleAssignment[] {
  const jsonapi = new JsonApiDocument(doc ?? {});
  const rows = Array.isArray(doc?.data)
    ? doc.data
    : doc?.data
      ? [doc.data]
      : [];
  return rows.map((row: any) => {
    const partyRef = row.relationships?.party?.data;
    const party = partyRef
      ? jsonapi.getIncluded(partyRef.type, partyRef.id)
      : undefined;
    return {
      id: row.id,
      role: row.attributes?.role,
      partyId: partyRef?.id ?? null,
      partyName:
        party?.attributes?.company_name ?? party?.attributes?.name ?? null,
    };
  });
}

export function listPartyRoles(
  transport: Transport,
  path: WritableRecordPath,
  id: string,
): Promise<any> {
  return transport.executeManual(
    `${recordUrl(transport, path, id, 'party_roles')}?include=party`,
  );
}

export function addPartyRole(
  transport: Transport,
  path: WritableRecordPath,
  id: string,
  role: string,
  partyId: string,
): Promise<any> {
  return transport.executeManual(
    recordUrl(transport, path, id, 'party_roles'),
    jsonRequest('POST', {
      data: {
        type: 'party_role',
        attributes: { role },
        relationships: { party: { data: { type: 'party', id: partyId } } },
      },
    }),
  );
}

export function removePartyRole(
  transport: Transport,
  path: WritableRecordPath,
  id: string,
  partyRoleId: string,
): Promise<any> {
  return transport.executeManual(
    recordUrl(
      transport,
      path,
      id,
      `party_roles/${encodeURIComponent(partyRoleId)}`,
    ),
    jsonRequest('DELETE'),
  );
}

export function clearCustomField(
  transport: Transport,
  path: WritableRecordPath,
  id: string,
  apiSlug: string,
): Promise<any> {
  return transport.executeManual(
    recordUrl(
      transport,
      path,
      id,
      `custom_fields/${encodeURIComponent(apiSlug)}`,
    ),
    jsonRequest('DELETE'),
  );
}
