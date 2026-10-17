/**
 * The only records the live write evals may change. The sandbox account also
 * holds demo data, so each selector picks a record only on an exact match and
 * returns undefined otherwise. The eval then skips; it never falls back to
 * another record.
 */

import { isRecord } from './client.js';

/** The reference number that marks the one shipment the write evals edit. */
export const EVAL_FIXTURE_REF = 'MCP-EVAL-FIXTURE';

/** The one party the write evals assign. assign_party creates it once. */
export const EVAL_PARTY_NAME = 'MCP Eval (do not use)';

/** The api_slug of the one short_text custom field the write evals set. */
export const EVAL_CUSTOM_FIELD_SLUG = 'mcp_eval_fixture';

export interface FixtureShipment {
  id: string;
  billOfLading: string | undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function onlyOne<T>(matches: T[]): T | undefined {
  return matches.length === 1 ? matches[0] : undefined;
}

/** The one list_shipments row whose reference numbers include EVAL_FIXTURE_REF. */
export function selectFixtureShipment(
  items: readonly unknown[],
): FixtureShipment | undefined {
  const row = onlyOne(
    items
      .filter(isRecord)
      .filter(
        (item) =>
          typeof item.id === 'string' &&
          stringList(item.refNumbers ?? item.ref_numbers).includes(
            EVAL_FIXTURE_REF,
          ),
      ),
  );
  if (!row) return undefined;
  return {
    id: String(row.id),
    billOfLading:
      typeof row.billOfLading === 'string' ? row.billOfLading : undefined,
  };
}

/** The id of the one list_parties party named exactly EVAL_PARTY_NAME. */
export function selectEvalParty(parties: unknown): string | undefined {
  const party = onlyOne(
    (Array.isArray(parties) ? parties : [])
      .filter(isRecord)
      .filter(
        (item) => item.name === EVAL_PARTY_NAME && typeof item.id === 'string',
      ),
  );
  return party ? String(party.id) : undefined;
}

/** The api_slug of the live short_text definition EVAL_CUSTOM_FIELD_SLUG. */
export function selectEvalDefinition(definitions: unknown): string | undefined {
  const definition = onlyOne(
    (Array.isArray(definitions) ? definitions : [])
      .filter(isRecord)
      .filter(
        (item) =>
          item.api_slug === EVAL_CUSTOM_FIELD_SLUG &&
          item.data_type === 'short_text' &&
          item.archived !== true,
      ),
  );
  return definition ? EVAL_CUSTOM_FIELD_SLUG : undefined;
}

/** The id of the first list_documents row attached to the fixture shipment. */
export function selectFixtureDocument(
  items: unknown,
  shipmentId: string,
): string | undefined {
  const document = (Array.isArray(items) ? items : [])
    .filter(isRecord)
    .find(
      (item) =>
        typeof item.id === 'string' &&
        stringList(item.shipment_ids).includes(shipmentId),
    );
  return document ? String(document.id) : undefined;
}
