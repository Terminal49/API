/**
 * Reads and writes the reference numbers (ref_numbers) on a container,
 * shipment or tracking request, for the tools that add and remove them.
 *
 * The API replaces the whole list on every PATCH and has no ETag, so a write
 * reads the list, sends the merged list and reads it back. A read-back that
 * differs from the list sent means someone else changed the list in between.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { nullableString } from './api-fields.js';
import type { SoftResult } from './soft-results.js';

export const REFERENCE_ENTITY_TYPES = [
  'container',
  'shipment',
  'tracking_request',
] as const;

export type ReferenceEntityType = (typeof REFERENCE_ENTITY_TYPES)[number];

export const referenceEntityInput = {
  entity_type: z
    .enum(REFERENCE_ENTITY_TYPES)
    .describe('The kind of record that carries the reference numbers.'),
  entity_id: z
    .string()
    .uuid()
    .describe(
      'The Terminal49 ID (UUID format) of that record. Identifier only; never pass conversation text.',
    ),
};

/** At most this many reference numbers in one call. */
export const MAX_REFERENCE_NUMBERS_PER_CALL = 20;

/**
 * The longest number add accepts. Remove accepts longer ones, because a
 * record can already hold a number added another way.
 */
const MAX_LENGTH = { add: 64, remove: 1000 } as const;

export function referenceNumbersInput(verb: 'add' | 'remove') {
  const maxLength = MAX_LENGTH[verb];
  return z
    .array(z.string().trim().min(1).max(maxLength))
    .min(1)
    .max(MAX_REFERENCE_NUMBERS_PER_CALL)
    .describe(
      `Reference numbers to ${verb}, such as PO numbers, 1 to ${MAX_REFERENCE_NUMBERS_PER_CALL} per call, each up to ${maxLength} characters. Matching is exact after trimming spaces, on both the numbers passed and the numbers on the record.`,
    );
}

/** Whether a stored number matches a requested one, which is already trimmed. */
export function sameNumber(stored: string, requested: string): boolean {
  return stored.trim() === requested;
}

export const referenceTargetSchema = z.object({
  entity_type: z.enum(REFERENCE_ENTITY_TYPES),
  entity_id: z.string(),
  /** The container number, Bill of Lading or request number. */
  label: z.string().nullable(),
});

export type ReferenceTarget = z.infer<typeof referenceTargetSchema>;

export interface ReferenceRecord {
  target: ReferenceTarget;
  /** Null when the record's list could not be read. */
  ref_numbers: string[] | null;
}

const rawRecordSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z
      .object({
        ref_numbers: z.unknown(),
        number: nullableString,
        bill_of_lading_number: nullableString,
        request_number: nullableString,
      })
      .catch({
        ref_numbers: undefined,
        number: null,
        bill_of_lading_number: null,
        request_number: null,
      }),
  }),
});

const rawRefNumbersSchema = z.array(z.string().nullable()).nullable();

/**
 * The reference numbers in a raw ref_numbers value. A write sends a whole new
 * list built on this one, so a value that is not a list of strings reads as
 * null and stops the write, instead of reading as empty and wiping the list.
 * Null entries hold no number and are dropped.
 */
function readRefNumbers(value: unknown): string[] | null {
  const parsed = rawRefNumbersSchema.safeParse(value);
  if (!parsed.success) return null;
  return (parsed.data ?? []).filter((entry) => entry !== null);
}

function parseRecord(
  entityType: ReferenceEntityType,
  raw: unknown,
): ReferenceRecord {
  const { data } = rawRecordSchema.parse(raw);
  const { attributes } = data;
  const label = {
    container: attributes.number,
    shipment: attributes.bill_of_lading_number,
    tracking_request: attributes.request_number,
  }[entityType];
  return {
    target: { entity_type: entityType, entity_id: data.id, label },
    ref_numbers: readRefNumbers(attributes.ref_numbers),
  };
}

export interface UnreadableReferenceNumbers extends SoftResult<'unreadable_reference_numbers'> {
  record: ReferenceTarget;
}

/** Returned instead of a write when the record's list could not be read. */
export function unreadableReferenceNumbers(
  record: ReferenceTarget,
): UnreadableReferenceNumbers {
  return {
    error: 'unreadable_reference_numbers',
    message:
      'Terminal49 returned the reference numbers on this record in a form this tool cannot read. Nothing was changed.',
    alternative: 'Change the reference numbers in the Terminal49 dashboard.',
    record,
  };
}

export async function readReferenceRecord(
  client: Terminal49Client,
  entityType: ReferenceEntityType,
  id: string,
): Promise<ReferenceRecord> {
  const raw = await {
    container: () => client.containers.get(id, [], { format: 'raw' }),
    shipment: () =>
      client.shipments.get(id, false, { format: 'raw', include: [] }),
    tracking_request: () => client.trackingRequests.get(id, { format: 'raw' }),
  }[entityType]();
  return parseRecord(entityType, raw);
}

/** Sends the full list. Terminal49 replaces the record's list with it. */
export async function writeReferenceNumbers(
  client: Terminal49Client,
  entityType: ReferenceEntityType,
  id: string,
  refNumbers: string[],
): Promise<void> {
  const attributes = { ref_numbers: refNumbers };
  await {
    container: () =>
      client.containers.update(id, attributes, { format: 'raw' }),
    shipment: () => client.shipments.update(id, attributes, { format: 'raw' }),
    tracking_request: () =>
      client.trackingRequests.update(id, attributes, { format: 'raw' }),
  }[entityType]();
}

/** The list with each value once, in first-seen order. */
export function uniqueValues(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sameValues(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}

export interface ReadBack {
  /** The list Terminal49 holds now, or the list sent when the read failed. */
  ref_numbers: string[];
  /** Null when the record could not be read after the write. */
  concurrent_change_detected: boolean | null;
  read_back_note?: string;
}

export const READ_BACK_NOTE =
  'The change was saved, but the record could not be read again to confirm it. ref_numbers shows the list that was sent.';

/**
 * Reads the list after a write. The write already happened, so a failed read
 * (a 429 included) is reported in the result instead of failing the call.
 */
export async function readBackReferenceNumbers(
  client: Terminal49Client,
  entityType: ReferenceEntityType,
  id: string,
  sent: string[],
): Promise<ReadBack> {
  try {
    const { ref_numbers } = await readReferenceRecord(client, entityType, id);
    if (ref_numbers) {
      return {
        ref_numbers,
        concurrent_change_detected: !sameValues(ref_numbers, sent),
      };
    }
  } catch {
    // Reported below with the list that was sent.
  }
  return {
    ref_numbers: sent,
    concurrent_change_detected: null,
    read_back_note: READ_BACK_NOTE,
  };
}

export const CONCURRENT_CHANGE_NOTE =
  'The list read back differs from the list sent, so someone else changed these reference numbers at the same time. Show the user the list as it is now.';

export const referenceResultFields = {
  record: referenceTargetSchema.optional(),
  previous: z.array(z.string()).optional(),
  ref_numbers: z.array(z.string()).optional(),
  concurrent_change_detected: z.boolean().nullable().optional(),
  read_back_note: z.string().optional(),
  undo: z.string().optional(),
};
