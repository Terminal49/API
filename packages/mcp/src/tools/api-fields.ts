/**
 * Zod pieces for reading JSON:API payloads at the tool boundary. A field that
 * is missing or has an unexpected type reads as null, or an empty list, so
 * one odd attribute never fails a whole tool call.
 */
import { z } from 'zod';

export const nullableString = z.string().nullable().catch(null);
export const nullableNumber = z.number().nullable().catch(null);
export const nullableBoolean = z.boolean().nullable().catch(null);
export const stringList = z.array(z.string()).catch([]);

/** A JSON:API relationship to one record, read as its id and type. */
export const relationshipRef = z
  .object({ data: z.object({ id: z.string(), type: z.string() }).nullable() })
  .nullable()
  .catch(null);
