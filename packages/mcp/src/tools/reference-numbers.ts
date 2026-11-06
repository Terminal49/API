/**
 * Reads and writes the list fields update_record changes: ref_numbers on a
 * container, shipment or tracking request, and tags on a shipment.
 *
 * The API replaces a whole list on every PATCH and has no ETag, so a write
 * reads the lists, sends the merged lists and reads them back. A read-back
 * that differs from the lists sent means someone changed them after the
 * PATCH. A change that lands between the read and the PATCH is overwritten,
 * and nothing here can see it.
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

export const LIST_FIELDS = ['ref_numbers', 'tags'] as const;

export type ListField = (typeof LIST_FIELDS)[number];

export type Lists = Partial<Record<ListField, string[]>>;

/** Which record types carry each list field. */
export const LIST_FIELD_ENTITIES: Record<
  ListField,
  readonly ReferenceEntityType[]
> = {
  ref_numbers: REFERENCE_ENTITY_TYPES,
  tags: ['shipment'],
};

export const referenceEntityInput = {
  entity_type: z
    .enum(REFERENCE_ENTITY_TYPES)
    .describe('The kind of record to update.'),
  entity_id: z
    .string()
    .uuid()
    .describe(
      'The Terminal49 ID (UUID format) of that record. Identifier only; never pass conversation text.',
    ),
};

/** Whether a stored value matches a requested one, which is already trimmed. */
export function sameValue(stored: string, requested: string): boolean {
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
  /** Null for a field the record's raw value could not be read as. */
  lists: Record<ListField, string[] | null>;
}

const rawRecordSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z
      .object({
        ref_numbers: z.unknown(),
        // Only shipments carry tags.
        tags: z.unknown().optional(),
        number: nullableString,
        bill_of_lading_number: nullableString,
        request_number: nullableString,
      })
      .catch({
        ref_numbers: undefined,
        tags: undefined,
        number: null,
        bill_of_lading_number: null,
        request_number: null,
      }),
  }),
});

const rawListSchema = z.array(z.string().nullable()).nullable();

/**
 * The values in a raw list. A write sends a whole new list built on this one,
 * so a value that is not a list of strings reads as null and stops the write,
 * instead of reading as empty and wiping the list. Null entries hold no value
 * and are dropped.
 */
function readList(value: unknown): string[] | null {
  const parsed = rawListSchema.safeParse(value);
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
    lists: {
      ref_numbers: readList(attributes.ref_numbers),
      tags: readList(attributes.tags),
    },
  };
}

export interface UnreadableList extends SoftResult<'unreadable_list'> {
  record: ReferenceTarget;
  field: ListField;
}

export function unreadableList(
  record: ReferenceTarget,
  field: ListField,
): UnreadableList {
  return {
    error: 'unreadable_list',
    message: `Terminal49 returned ${field} on this record in a form this tool cannot read. Nothing was changed.`,
    alternative: `Change ${field} in the Terminal49 dashboard.`,
    record,
    field,
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

/** Sends whole lists. Terminal49 replaces each list sent with it. */
export async function writeLists(
  client: Terminal49Client,
  entityType: ReferenceEntityType,
  id: string,
  lists: Lists,
): Promise<void> {
  await {
    container: () => client.containers.update(id, lists, { format: 'raw' }),
    shipment: () => client.shipments.update(id, lists, { format: 'raw' }),
    tracking_request: () =>
      client.trackingRequests.update(id, lists, { format: 'raw' }),
  }[entityType]();
}

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
  /** The lists Terminal49 holds now, or the lists sent when the read failed. */
  lists: Lists;
  /** Null when the record could not be read after the write. */
  concurrent_change_detected: boolean | null;
  read_back_note?: string;
}

export const READ_BACK_NOTE =
  'The change was saved, but the record could not be read again to confirm it. The lists shown are the ones that were sent.';

/**
 * Reads the lists after a write. The write already happened, so a failed
 * read (a 429 included) is reported in the result instead of failing the call.
 */
export async function readBackLists(
  client: Terminal49Client,
  entityType: ReferenceEntityType,
  id: string,
  sent: Lists,
): Promise<ReadBack> {
  try {
    const { lists } = await readReferenceRecord(client, entityType, id);
    const fields = Object.keys(sent) as ListField[];
    if (fields.every((field) => lists[field])) {
      const after: Lists = {};
      for (const field of fields) after[field] = lists[field] ?? [];
      return {
        lists: after,
        concurrent_change_detected: fields.some(
          (field) => !sameValues(after[field] ?? [], sent[field] ?? []),
        ),
      };
    }
  } catch {}
  return {
    lists: sent,
    concurrent_change_detected: null,
    read_back_note: READ_BACK_NOTE,
  };
}

export const CONCURRENT_CHANGE_NOTE =
  'The lists read back differ from the lists sent, so someone else changed this record at the same time. Show the user the lists as they are now.';
