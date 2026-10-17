/**
 * remove_reference_numbers tool (tier C)
 * Removes reference numbers from a container, shipment or tracking request.
 * Searches, filters and integrations that use a removed number stop finding
 * the record, so it needs a confirmed preview.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  CONCURRENT_CHANGE_NOTE,
  readBackReferenceNumbers,
  readReferenceRecord,
  referenceEntityInput,
  referenceNumbersInput,
  referenceResultFields,
  type ReferenceTarget,
  referenceTargetSchema,
  sameNumber,
  uniqueValues,
  type UnreadableReferenceNumbers,
  unreadableReferenceNumbers,
  writeReferenceNumbers,
} from './reference-numbers.js';
import { httpStatus } from './soft-results.js';
import {
  confirmationTokenInput,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  confirmedWriteResultSchema,
  runConfirmedWrite,
} from './write-kit.js';

export const removeReferenceNumbersInputSchema = z
  .object({
    ...referenceEntityInput,
    remove: referenceNumbersInput('remove'),
    confirmation_token: confirmationTokenInput,
  })
  .strict();

export type RemoveReferenceNumbersArgs = z.input<
  typeof removeReferenceNumbersInputSchema
>;

const removePreviewSchema = z.object({
  current: referenceTargetSchema.extend({ ref_numbers: z.array(z.string()) }),
  proposed: z.object({ ref_numbers: z.array(z.string()) }),
  removing: z.array(z.string()),
  not_present: z.array(z.string()),
  reach: z.string(),
});

type RemovePreview = z.infer<typeof removePreviewSchema>;

export const removeReferenceNumbersOutputSchema = confirmedWriteResultSchema(
  removePreviewSchema,
  {
    ...referenceResultFields,
    removed: z.array(z.string()).optional(),
    not_present: z.array(z.string()).optional(),
  },
);

const REMOVE_REACH =
  'Only the listed reference numbers are removed from this record. Searches, filters and integrations that use them stop finding it.';

interface NotPresent {
  status: 'not_present';
  message: string;
  record: ReferenceTarget;
  ref_numbers: string[];
  not_present: string[];
}

interface RemoveOutcome {
  status: 'removed';
  message: string;
  record: ReferenceTarget;
  previous: string[];
  ref_numbers: string[];
  removed: string[];
  not_present: string[];
  concurrent_change_detected: boolean | null;
  read_back_note?: string;
  undo: 'add_reference_numbers';
}

interface ListRejected {
  status: 'noop';
  message: string;
  alternative: string;
  record: ReferenceTarget;
  ref_numbers: string[];
}

type RemoveStop = NotPresent | UnreadableReferenceNumbers;

export type RemoveReferenceNumbersResult = ConfirmedWriteResult<
  RemovePreview,
  RemoveStop,
  RemoveOutcome | ListRejected
>;

export async function executeRemoveReferenceNumbers(
  args: RemoveReferenceNumbersArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<RemoveReferenceNumbersResult> {
  const parsed = removeReferenceNumbersInputSchema.parse(args);
  const { entity_type, entity_id, remove } = parsed;
  return runConfirmedWrite(context, {
    tool: 'remove_reference_numbers',
    entityType: entity_type,
    entityId: entity_id,
    args: parsed,
    async read(): Promise<ConfirmedWriteRead<RemovePreview, RemoveStop>> {
      const { target, ref_numbers } = await readReferenceRecord(
        client,
        entity_type,
        entity_id,
      );
      if (!ref_numbers) return { stop: unreadableReferenceNumbers(target) };
      const requested = uniqueValues(remove);
      const isStored = (value: string) =>
        ref_numbers.some((stored) => sameNumber(stored, value));
      const removing = requested.filter(isStored);
      const notPresent = requested.filter((value) => !isStored(value));
      if (removing.length === 0) {
        return {
          stop: {
            status: 'not_present',
            message:
              'None of these reference numbers are on this record. Nothing was changed.',
            record: target,
            ref_numbers,
            not_present: notPresent,
          },
        };
      }
      return {
        // The token is bound to the whole list, so any change to it after
        // the preview, not only to the numbers being removed, is stale.
        state: { ref_numbers },
        preview: {
          current: { ...target, ref_numbers },
          proposed: {
            ref_numbers: ref_numbers.filter(
              (stored) => !removing.some((value) => sameNumber(stored, value)),
            ),
          },
          removing,
          not_present: notPresent,
          reach: REMOVE_REACH,
        },
      };
    },
    async write(preview): Promise<RemoveOutcome | ListRejected> {
      const { ref_numbers: previous, ...target } = preview.current;
      const sent = preview.proposed.ref_numbers;
      try {
        await writeReferenceNumbers(client, entity_type, entity_id, sent);
      } catch (error) {
        if (httpStatus(error) === 422) {
          return {
            status: 'noop',
            message:
              'Terminal49 would not save the shorter list on this record. Nothing was changed.',
            alternative:
              'Remove these reference numbers in the Terminal49 dashboard.',
            record: target,
            ref_numbers: previous,
          };
        }
        throw error;
      }
      const after = await readBackReferenceNumbers(
        client,
        entity_type,
        entity_id,
        sent,
      );
      return {
        status: 'removed',
        message: after.concurrent_change_detected
          ? `Reference numbers removed. ${CONCURRENT_CHANGE_NOTE}`
          : 'Reference numbers removed.',
        record: target,
        previous,
        ...after,
        removed: preview.removing,
        not_present: preview.not_present,
        undo: 'add_reference_numbers',
      };
    },
  });
}
