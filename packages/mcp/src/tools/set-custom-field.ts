/**
 * set_custom_field tool (tier A)
 * Fills an empty custom field on a container, shipment or tracking request.
 * A field that already has a value returns already_set, and
 * update_custom_field makes the change with a confirmed preview. Terminal49
 * has no create-only write, so a value that lands between the read and the
 * POST is replaced.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  type AmbiguousField,
  checkValue,
  type CustomFieldInputValue,
  customFieldResultFields,
  customFieldsRefused,
  customFieldTargetInput,
  customFieldValueInput,
  type Field,
  fieldOf,
  type FieldStop,
  findWritableField,
  readFieldState,
  sameValue,
  type UseShipmentOrContainer,
  writtenValue,
} from './custom-field-values.js';
import type { ReferenceTarget } from './reference-numbers.js';
import { httpStatus, type SoftResult } from './soft-results.js';
import {
  runWrite,
  type WriteRateLimited,
  writeResultSchema,
} from './write-kit.js';

export const setCustomFieldInputSchema = z
  .object({
    ...customFieldTargetInput,
    value: customFieldValueInput,
  })
  .strict();

export type SetCustomFieldArgs = z.input<typeof setCustomFieldInputSchema>;

export const setCustomFieldOutputSchema = writeResultSchema({
  ...customFieldResultFields,
  current_value: z.unknown().optional(),
  current_display_value: z.string().nullable().optional(),
});

interface SetOutcome {
  status: 'set';
  message: string;
  record: ReferenceTarget;
  field: Field;
  value: unknown;
  display_value: string | null;
  undo: 'update_custom_field';
}

interface AlreadySet {
  status: 'already_set';
  message: string;
  alternative?: string;
  record: ReferenceTarget;
  field: Field;
  current_value: unknown;
  current_display_value: string | null;
}

interface ValueRejected {
  status: 'noop';
  message: string;
  alternative: string;
  record: ReferenceTarget;
  field: Field;
}

export type SetCustomFieldResult =
  | SetOutcome
  | AlreadySet
  | ValueRejected
  | FieldStop
  | AmbiguousField
  | UseShipmentOrContainer
  | SoftResult<'FeatureNotEnabled' | 'credential_not_supported'>
  | WriteRateLimited;

async function setValue(
  client: Terminal49Client,
  args: z.output<typeof setCustomFieldInputSchema>,
  value: CustomFieldInputValue,
): Promise<unknown> {
  const { entity_type, entity_id, api_slug } = args;
  return {
    container: () =>
      client.containers.setCustomField(entity_id, api_slug, value, {
        format: 'raw',
      }),
    shipment: () =>
      client.shipments.setCustomField(entity_id, api_slug, value, {
        format: 'raw',
      }),
    tracking_request: () =>
      client.trackingRequests.setCustomField(entity_id, api_slug, value, {
        format: 'raw',
      }),
  }[entity_type]();
}

export async function executeSetCustomField(
  args: SetCustomFieldArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<SetCustomFieldResult> {
  const parsed = setCustomFieldInputSchema.parse(args);
  return runWrite(
    context,
    {
      tool: 'set_custom_field',
      entityType: parsed.entity_type,
      entityId: parsed.entity_id,
    },
    async () => {
      try {
        return await setIfEmpty(client, parsed);
      } catch (error) {
        const refused = await customFieldsRefused(error, context);
        if (refused) return refused;
        throw error;
      }
    },
  );
}

async function setIfEmpty(
  client: Terminal49Client,
  args: z.output<typeof setCustomFieldInputSchema>,
): Promise<
  | SetOutcome
  | AlreadySet
  | ValueRejected
  | FieldStop
  | AmbiguousField
  | UseShipmentOrContainer
> {
  const found = await findWritableField(client, args);
  if ('stop' in found) return found.stop;
  const { definition } = found;
  const checked = checkValue(definition, args.value);
  if (!checked.ok) return checked.result;

  const state = await readFieldState(client, args, definition);
  if ('stop' in state) return state.stop;
  const { record, stored } = state;
  const field = fieldOf(definition);
  if (stored) {
    const same = sameValue(definition.data_type, stored.value, checked.value);
    return {
      status: 'already_set',
      message: same
        ? 'The field already has this value. Nothing was changed.'
        : 'The field already has a value, so set_custom_field changed nothing.',
      ...(same
        ? {}
        : {
            alternative:
              'To replace the value, show current_value to the user and call update_custom_field.',
          }),
      record,
      field,
      current_value: stored.value,
      current_display_value: stored.display_value,
    };
  }

  let raw: unknown;
  try {
    raw = await setValue(client, args, checked.value);
  } catch (error) {
    if (httpStatus(error) === 422) {
      return {
        status: 'noop',
        message:
          'Terminal49 would not save this value in this field. Nothing was changed.',
        alternative:
          'Check the value with the user, or set it in the Terminal49 dashboard.',
        record,
        field,
      };
    }
    throw error;
  }
  return {
    status: 'set',
    message: 'Custom field set.',
    record,
    field,
    ...writtenValue(raw, checked.value),
    undo: 'update_custom_field',
  };
}
