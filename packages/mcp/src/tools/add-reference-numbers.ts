/**
 * add_reference_numbers tool (tier A)
 * Adds reference numbers, such as PO numbers, to a container, shipment or
 * tracking request. It keeps every number already there, so a repeated call
 * changes nothing.
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
  sameNumber,
  uniqueValues,
  type UnreadableReferenceNumbers,
  unreadableReferenceNumbers,
  writeReferenceNumbers,
} from './reference-numbers.js';
import { httpStatus } from './soft-results.js';
import {
  runWrite,
  type WriteRateLimited,
  writeResultSchema,
} from './write-kit.js';

export const addReferenceNumbersInputSchema = z
  .object({
    ...referenceEntityInput,
    add: referenceNumbersInput('add'),
  })
  .strict();

export type AddReferenceNumbersArgs = z.input<
  typeof addReferenceNumbersInputSchema
>;

export const addReferenceNumbersOutputSchema = writeResultSchema({
  ...referenceResultFields,
  added: z.array(z.string()).optional(),
  already_present: z.array(z.string()).optional(),
});

interface AddOutcome {
  status: 'added' | 'already_present';
  message: string;
  record: ReferenceTarget;
  previous: string[];
  ref_numbers: string[];
  added: string[];
  already_present: string[];
  concurrent_change_detected: boolean | null;
  read_back_note?: string;
  undo?: 'remove_reference_numbers';
}

interface ListRejected {
  status: 'noop';
  message: string;
  alternative: string;
  record: ReferenceTarget;
  previous: string[];
}

export type AddReferenceNumbersResult =
  | AddOutcome
  | ListRejected
  | UnreadableReferenceNumbers
  | WriteRateLimited;

export async function executeAddReferenceNumbers(
  args: AddReferenceNumbersArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<AddReferenceNumbersResult> {
  const { entity_type, entity_id, add } =
    addReferenceNumbersInputSchema.parse(args);
  return runWrite(
    context,
    {
      tool: 'add_reference_numbers',
      entityType: entity_type,
      entityId: entity_id,
    },
    async (): Promise<
      AddOutcome | ListRejected | UnreadableReferenceNumbers
    > => {
      const before = await readReferenceRecord(client, entity_type, entity_id);
      const previous = before.ref_numbers;
      if (!previous) return unreadableReferenceNumbers(before.target);
      const requested = uniqueValues(add);
      const isStored = (value: string) =>
        previous.some((stored) => sameNumber(stored, value));
      const added = requested.filter((value) => !isStored(value));
      const alreadyPresent = requested.filter(isStored);

      if (added.length === 0) {
        return {
          status: 'already_present',
          message:
            'Every reference number is already on this record. Nothing was changed.',
          record: before.target,
          previous,
          ref_numbers: previous,
          added: [],
          already_present: alreadyPresent,
          concurrent_change_detected: false,
        };
      }

      const sent = [...previous, ...added];
      try {
        await writeReferenceNumbers(client, entity_type, entity_id, sent);
      } catch (error) {
        if (httpStatus(error) === 422) {
          return {
            status: 'noop',
            message:
              'Terminal49 would not save these reference numbers on this record. Nothing was changed.',
            alternative:
              'Check the reference numbers with the user, or add them in the Terminal49 dashboard.',
            record: before.target,
            previous,
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
        status: 'added',
        message: after.concurrent_change_detected
          ? `Reference numbers added. ${CONCURRENT_CHANGE_NOTE}`
          : 'Reference numbers added.',
        record: before.target,
        previous,
        ...after,
        added,
        already_present: alreadyPresent,
        undo: 'remove_reference_numbers',
      };
    },
  );
}
