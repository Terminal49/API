/**
 * update_record tool (tier C, asks only when removing)
 * Adds and removes reference numbers on a container, shipment or tracking
 * request, and tags on a shipment. A call that only adds writes at once; a
 * call that removes anything needs the user's approval of a preview, because
 * searches, filters and integrations that use a removed value stop finding
 * the record.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  CONCURRENT_CHANGE_NOTE,
  LIST_FIELD_ENTITIES,
  LIST_FIELDS,
  type ListField,
  type Lists,
  readBackLists,
  readReferenceRecord,
  referenceEntityInput,
  type ReferenceTarget,
  referenceTargetSchema,
  sameValue,
  uniqueValues,
  type UnreadableList,
  unreadableList,
  writeLists,
} from './reference-numbers.js';
import { httpStatus } from './soft-results.js';
import {
  confirmationTokenInput,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  confirmedWriteResultSchema,
  runConfirmedWrite,
} from './write-kit.js';

export const MAX_VALUES_PER_CALL = 20;

/**
 * The longest value add accepts. Remove accepts longer ones, because a record
 * can already hold a value added another way.
 */
export const MAX_ADD_LENGTH = 64;

function values(verb: 'add' | 'remove', what: string) {
  const maxLength = verb === 'add' ? MAX_ADD_LENGTH : 1000;
  return z
    .array(z.string().trim().min(1).max(maxLength))
    .max(MAX_VALUES_PER_CALL)
    .optional()
    .describe(
      `${what} to ${verb}, up to ${MAX_VALUES_PER_CALL}, each up to ${maxLength} characters. Matching is exact after trimming spaces.`,
    );
}

function listChange(what: string) {
  return z
    .object({ add: values('add', what), remove: values('remove', what) })
    .strict()
    .optional();
}

export const updateRecordInputSchema = z
  .object({
    ...referenceEntityInput,
    ref_numbers: listChange('Reference numbers, such as PO numbers,').describe(
      'Reference numbers to add or remove. Values already there stay unless listed in remove.',
    ),
    tags: listChange('Tags').describe(
      'Shipment tags to add or remove. Shipments only.',
    ),
    confirmation_token: confirmationTokenInput,
  })
  .strict()
  .superRefine((args, ctx) => {
    const fields = LIST_FIELDS.filter((field) => args[field]);
    if (
      !fields.some(
        (field) => args[field]?.add?.length || args[field]?.remove?.length,
      )
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pass at least one value to add or remove.',
      });
    }
    for (const field of fields) {
      if (!LIST_FIELD_ENTITIES[field].includes(args.entity_type)) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} can only be changed on a ${LIST_FIELD_ENTITIES[field].join(' or ')}.`,
        });
      }
    }
  });

export type UpdateRecordArgs = z.input<typeof updateRecordInputSchema>;

const listsSchema = z.object({
  ref_numbers: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

const fieldChangeSchema = z.object({
  adding: z.array(z.string()),
  removing: z.array(z.string()),
  already_present: z.array(z.string()),
  not_present: z.array(z.string()),
});

type FieldChange = z.infer<typeof fieldChangeSchema>;

const changesSchema = z.object({
  ref_numbers: fieldChangeSchema.optional(),
  tags: fieldChangeSchema.optional(),
});

type Changes = z.infer<typeof changesSchema>;

const updatePreviewSchema = z.object({
  current: referenceTargetSchema.merge(listsSchema),
  proposed: listsSchema,
  changes: changesSchema,
  reach: z.string(),
});

type UpdatePreview = z.infer<typeof updatePreviewSchema>;

export const updateRecordOutputSchema = confirmedWriteResultSchema(
  updatePreviewSchema,
  {
    record: referenceTargetSchema.optional(),
    previous: listsSchema.optional(),
    current: listsSchema.optional(),
    changes: changesSchema.optional(),
    concurrent_change_detected: z.boolean().nullable().optional(),
    read_back_note: z.string().optional(),
  },
);

const REMOVE_REACH =
  'Only the listed values are removed from this record. Searches, filters and integrations that use them stop finding it.';

const ADD_REACH =
  'The listed values are added; everything already there stays.';

interface Unchanged {
  status: 'unchanged';
  message: string;
  record: ReferenceTarget;
  current: Lists;
  changes: Changes;
}

interface Updated {
  status: 'updated';
  message: string;
  record: ReferenceTarget;
  previous: Lists;
  current: Lists;
  changes: Changes;
  concurrent_change_detected: boolean | null;
  read_back_note?: string;
}

interface ListRejected {
  status: 'noop';
  message: string;
  alternative: string;
  record: ReferenceTarget;
  current: Lists;
}

type Stop = Unchanged | UnreadableList;

export type UpdateRecordResult = ConfirmedWriteResult<
  UpdatePreview,
  Stop,
  Updated | ListRejected
>;

/** The change one field's add and remove make to its stored list. */
function planField(
  stored: string[],
  add: readonly string[],
  remove: readonly string[],
): { next: string[]; change: FieldChange } {
  const isStored = (value: string) =>
    stored.some((entry) => sameValue(entry, value));
  const adds = uniqueValues(add);
  const removes = uniqueValues(remove);
  const removing = removes.filter(isStored);
  const adding = adds.filter(
    (value) => !isStored(value) && !removes.includes(value),
  );
  const kept = stored.filter(
    (entry) => !removing.some((value) => sameValue(entry, value)),
  );
  return {
    next: [...kept, ...adding],
    change: {
      adding,
      removing,
      already_present: adds.filter(isStored),
      not_present: removes.filter((value) => !isStored(value)),
    },
  };
}

function pick(lists: Lists, fields: readonly ListField[]): Lists {
  const picked: Lists = {};
  for (const field of fields) picked[field] = lists[field];
  return picked;
}

export async function executeUpdateRecord(
  args: UpdateRecordArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<UpdateRecordResult> {
  const parsed = updateRecordInputSchema.parse(args);
  const { entity_type, entity_id } = parsed;
  const fields = LIST_FIELDS.filter((field) => parsed[field]);

  return runConfirmedWrite(context, {
    tool: 'update_record',
    entityType: entity_type,
    entityId: entity_id,
    args: parsed,
    async read(): Promise<ConfirmedWriteRead<UpdatePreview, Stop>> {
      const { target, lists } = await readReferenceRecord(
        client,
        entity_type,
        entity_id,
      );
      const current: Lists = {};
      const proposed: Lists = {};
      const changes: Changes = {};
      for (const field of fields) {
        const stored = lists[field];
        if (!stored) return { stop: unreadableList(target, field) };
        const { next, change } = planField(
          stored,
          parsed[field]?.add ?? [],
          parsed[field]?.remove ?? [],
        );
        current[field] = stored;
        proposed[field] = next;
        changes[field] = change;
      }
      const all = Object.values(changes);
      if (
        all.every((change) => !change.adding.length && !change.removing.length)
      ) {
        return {
          stop: {
            status: 'unchanged',
            message:
              'Every value to add is already there and no value to remove is. Nothing was changed.',
            record: target,
            current,
            changes,
          },
        };
      }
      const preview: UpdatePreview = {
        current: { ...target, ...current },
        proposed,
        changes,
        reach: all.some((change) => change.removing.length)
          ? REMOVE_REACH
          : ADD_REACH,
      };
      if (all.every((change) => !change.removing.length)) {
        return { additive: preview };
      }
      // The token is bound to the whole lists, so any change to them after
      // the preview, not only to the values being removed, is stale.
      return { state: current, preview };
    },
    async refused(error, preview): Promise<ListRejected | undefined> {
      if (httpStatus(error) !== 422) return undefined;
      const {
        entity_type: type,
        entity_id: id,
        label,
        ...current
      } = preview.current;
      return {
        status: 'noop',
        message:
          'Terminal49 would not save these changes on this record. Nothing was changed.',
        alternative: 'Make the change in the Terminal49 dashboard.',
        record: { entity_type: type, entity_id: id, label },
        current: pick(current, fields),
      };
    },
    async write(preview): Promise<Updated | ListRejected> {
      const {
        entity_type: type,
        entity_id: id,
        label,
        ...previous
      } = preview.current;
      const sent = pick(preview.proposed, fields);
      await writeLists(client, entity_type, entity_id, sent);
      const after = await readBackLists(client, entity_type, entity_id, sent);
      return {
        status: 'updated',
        message: after.concurrent_change_detected
          ? `Record updated. ${CONCURRENT_CHANGE_NOTE}`
          : 'Record updated.',
        record: { entity_type: type, entity_id: id, label },
        previous: pick(previous, fields),
        current: after.lists,
        changes: preview.changes,
        concurrent_change_detected: after.concurrent_change_detected,
        ...(after.read_back_note && { read_back_note: after.read_back_note }),
      };
    },
  });
}
