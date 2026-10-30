/**
 * Zod pieces for reading JSON:API payloads at the tool boundary. A field that
 * is missing or has an unexpected type reads as null, or an empty list, so
 * one odd attribute never fails a whole tool call. The envelope around the
 * records is the opposite: a malformed one fails the call, so a broken
 * response never reads as an empty result.
 */
import { z } from 'zod';

export const nullableString = z.string().nullable().catch(null);
export const nullableNumber = z.number().nullable().catch(null);
export const nullableBoolean = z.boolean().nullable().catch(null);
export const stringList = z.array(z.string()).catch([]);

/**
 * A response's top-level included. JSON:API leaves it out when there is
 * nothing to include, so absent reads as empty, but present and not a list
 * fails.
 */
export const includedList = z.array(z.unknown()).default([]);

/** A response's top-level links or meta: absent reads as empty, malformed fails. */
export const topLevelObject = z.record(z.string(), z.unknown()).default({});

const resourceIdentifier = z.object({ id: z.string(), type: z.string() });

/** A JSON:API relationship to one record, read as its id and type. */
export const relationshipRef = z
  .object({ data: resourceIdentifier.nullable() })
  .nullable()
  .catch(null);

/**
 * A JSON:API relationship to many records, read as their ids and types. Null
 * when the API leaves the relationship out, so callers can tell "not sent"
 * from "none". A malformed entry is dropped and the valid ones are kept.
 */
export const relationshipList = z
  .object({
    data: z.array(z.unknown()).transform((entries) =>
      entries.flatMap((entry) => {
        const parsed = resourceIdentifier.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
  })
  .nullable()
  .catch(null);

/** Keeps the pagination links the API sends as strings; null means no page. */
export function stringLinks(
  links: Record<string, unknown>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(links).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
