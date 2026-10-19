/**
 * update_custom_field tool (tier C)
 * Replaces or clears a custom field value on a container, shipment or
 * tracking request. Terminal49 keeps no copy of the old value, so the change
 * needs a confirmed preview.
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
  fieldSchema,
  type FieldStop,
  findWritableField,
  readFieldState,
  sameValue,
  type UseShipmentOrContainer,
  writtenValue,
} from './custom-field-values.js';
import {
  type ReferenceTarget,
  referenceTargetSchema,
} from './reference-numbers.js';
import { httpStatus, type SoftResult, ToolInputError } from './soft-results.js';
import {
  confirmationTokenInput,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  confirmedWriteResultSchema,
  runConfirmedWrite,
} from './write-kit.js';

export const updateCustomFieldInputSchema = z
  .object({
    ...customFieldTargetInput,
    value: customFieldValueInput
      .optional()
      .describe(
        'The new value, in the form the field data_type needs (see set_custom_field). Pass value or clear, not both.',
      ),
    clear: z
      .boolean()
      .optional()
      .describe(
        'Set to true to remove the value. Pass value or clear, not both.',
      ),
    confirmation_token: confirmationTokenInput,
  })
  .strict();

export type UpdateCustomFieldArgs = z.input<
  typeof updateCustomFieldInputSchema
>;

const updatePreviewSchema = z.object({
  current: z.object({
    record: referenceTargetSchema,
    field: fieldSchema,
    value: z.unknown(),
    display_value: z.string().nullable(),
  }),
  proposed: z.object({ value: z.unknown() }),
  action: z.enum(['overwrite', 'clear']),
  reach: z.string(),
});

type UpdatePreview = z.infer<typeof updatePreviewSchema>;

export const updateCustomFieldOutputSchema = confirmedWriteResultSchema(
  updatePreviewSchema,
  {
    ...customFieldResultFields,
    previous_value: z.unknown().optional(),
  },
);

const REACH = {
  overwrite:
    'Only this field on this record changes. The current value is replaced, and Terminal49 keeps no copy of it.',
  clear:
    'Only this field on this record is cleared. Views, filters and exports that use it stop showing the current value, and Terminal49 keeps no copy of it.',
} as const;

interface NotSet {
  status: 'not_set';
  message: string;
  alternative?: string;
  record: ReferenceTarget;
  field: Field;
}

interface Unchanged {
  status: 'unchanged';
  message: string;
  record: ReferenceTarget;
  field: Field;
  value: unknown;
  display_value: string | null;
}

interface UpdateOutcome {
  status: 'updated' | 'cleared';
  message: string;
  record: ReferenceTarget;
  field: Field;
  previous_value: unknown;
  value: unknown;
  display_value: string | null;
  undo: 'update_custom_field' | 'set_custom_field';
}

interface ValueRejected {
  status: 'noop';
  message: string;
  alternative: string;
  record: ReferenceTarget;
  field: Field;
}

type Refused = SoftResult<'FeatureNotEnabled' | 'credential_not_supported'>;

type UpdateStop =
  | FieldStop
  | AmbiguousField
  | UseShipmentOrContainer
  | NotSet
  | Unchanged
  | Refused;

type UpdateDone = UpdateOutcome | NotSet | ValueRejected | Refused;

export type UpdateCustomFieldResult = ConfirmedWriteResult<
  UpdatePreview,
  UpdateStop,
  UpdateDone
>;

function notSet(
  record: ReferenceTarget,
  field: Field,
  clearing: boolean,
): NotSet {
  return clearing
    ? {
        status: 'not_set',
        message: 'The field has no value on this record. Nothing was changed.',
        record,
        field,
      }
    : {
        status: 'not_set',
        message:
          'The field has no value on this record, so there is nothing to replace. Nothing was changed.',
        alternative: 'Call set_custom_field to fill it.',
        record,
        field,
      };
}

type Target = z.output<typeof updateCustomFieldInputSchema>;

async function writeValue(
  client: Terminal49Client,
  target: Target,
  value: CustomFieldInputValue | undefined,
): Promise<unknown> {
  const { entity_type, entity_id, api_slug } = target;
  if (value === undefined) {
    return {
      container: () =>
        client.containers.deleteCustomField(entity_id, api_slug, {
          format: 'raw',
        }),
      shipment: () =>
        client.shipments.deleteCustomField(entity_id, api_slug, {
          format: 'raw',
        }),
      tracking_request: () =>
        client.trackingRequests.deleteCustomField(entity_id, api_slug, {
          format: 'raw',
        }),
    }[entity_type]();
  }
  return {
    container: () =>
      client.containers.updateCustomField(entity_id, api_slug, value, {
        format: 'raw',
      }),
    shipment: () =>
      client.shipments.updateCustomField(entity_id, api_slug, value, {
        format: 'raw',
      }),
    tracking_request: () =>
      client.trackingRequests.updateCustomField(entity_id, api_slug, value, {
        format: 'raw',
      }),
  }[entity_type]();
}

export async function executeUpdateCustomField(
  args: UpdateCustomFieldArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<UpdateCustomFieldResult> {
  const parsed = updateCustomFieldInputSchema.parse(args);
  const clearing = parsed.clear === true;
  if ((parsed.value === undefined) === !clearing) {
    throw new ToolInputError(
      'Pass exactly one of value or clear: true to update_custom_field.',
    );
  }

  // The checked value read() builds, which write() sends. Undefined clears.
  let proposed: CustomFieldInputValue | undefined;

  async function read(): Promise<
    ConfirmedWriteRead<UpdatePreview, UpdateStop>
  > {
    const found = await findWritableField(client, parsed, clearing);
    if ('stop' in found) return { stop: found.stop };
    const { definition } = found;
    if (parsed.value !== undefined) {
      const checked = checkValue(definition, parsed.value);
      if (!checked.ok) return { stop: checked.result };
      proposed = checked.value;
    }
    const state = await readFieldState(client, parsed, definition);
    if ('stop' in state) return { stop: state.stop };
    const { record, stored } = state;
    const field = fieldOf(definition);
    if (!stored) return { stop: notSet(record, field, clearing) };
    if (
      proposed !== undefined &&
      sameValue(definition.data_type, stored.value, proposed)
    ) {
      return {
        stop: {
          status: 'unchanged',
          message: 'The field already has this value. Nothing was changed.',
          record,
          field,
          ...stored,
        },
      };
    }
    const action = clearing ? 'clear' : 'overwrite';
    return {
      state: { definition_id: definition.id, value: stored.value },
      preview: {
        current: { record, field, ...stored },
        proposed: { value: proposed ?? null },
        action,
        reach: REACH[action],
      },
    };
  }

  async function refused(
    error: unknown,
    preview: UpdatePreview,
  ): Promise<UpdateDone | undefined> {
    const { record, field } = preview.current;
    const status = httpStatus(error);
    // Defensive: Terminal49 answers a DELETE on an empty field with 204.
    if (clearing && status === 404) return notSet(record, field, true);
    if (status === 422) {
      return {
        status: 'noop',
        message:
          'Terminal49 would not save this value in this field. Nothing was changed.',
        alternative:
          'Check the value with the user, or change it in the Terminal49 dashboard.',
        record,
        field,
      };
    }
    return customFieldsRefused(error, context);
  }

  async function write(preview: UpdatePreview): Promise<UpdateOutcome> {
    const { record, field, value: previous } = preview.current;
    const raw = await writeValue(client, parsed, proposed);
    if (proposed === undefined) {
      return {
        status: 'cleared',
        message: 'Custom field cleared.',
        record,
        field,
        previous_value: previous,
        value: null,
        display_value: null,
        undo: 'set_custom_field',
      };
    }
    return {
      status: 'updated',
      message: 'Custom field updated.',
      record,
      field,
      previous_value: previous,
      ...writtenValue(raw, proposed),
      undo: 'update_custom_field',
    };
  }

  return runConfirmedWrite(context, {
    tool: 'update_custom_field',
    entityType: parsed.entity_type,
    entityId: parsed.entity_id,
    args: parsed,
    async read() {
      try {
        return await read();
      } catch (error) {
        const refused = await customFieldsRefused(error, context);
        if (refused) return { stop: refused };
        throw error;
      }
    },
    write,
    refused,
  });
}
