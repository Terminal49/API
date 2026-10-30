/**
 * The only record the live write evals may change. The sandbox account also
 * holds demo data, so the selector picks a shipment only on an exact match
 * and returns undefined otherwise. The eval then skips; it never falls back
 * to another record.
 */

import { isRecord } from './client.js';

/** The reference number that marks the one shipment the write evals edit. */
export const EVAL_FIXTURE_REF = 'MCP-EVAL-FIXTURE';

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** The id of the one list_shipments row whose reference numbers include EVAL_FIXTURE_REF. */
export function selectFixtureShipment(
  items: readonly unknown[],
): string | undefined {
  const matches = items
    .filter(isRecord)
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        stringList(item.refNumbers ?? item.ref_numbers).includes(
          EVAL_FIXTURE_REF,
        ),
    );
  return matches.length === 1 ? String(matches[0].id) : undefined;
}
