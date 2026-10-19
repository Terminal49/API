/**
 * list_custom_field_definitions tool
 * Lists the account's custom fields: the api_slug to read or write each one,
 * its data type, and the allowed options for enum fields. An agent needs
 * these before it can interpret or set a custom field value.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import {
  nullableBoolean,
  nullableNumber,
  nullableString,
} from './api-fields.js';
import {
  CUSTOM_FIELDS_AUTH_NOTE,
  CUSTOM_FIELDS_FEATURE_NOTE,
} from './custom-fields.js';
import {
  httpStatus,
  isFeatureNotEnabled,
  isNotAuthorized,
} from './soft-results.js';

const ENTITY_TYPES = {
  container: 'Cargo',
  shipment: 'Shipment',
} as const;

type EntityType = keyof typeof ENTITY_TYPES;

export const CUSTOM_FIELD_OPTIONS_NOTE =
  'The allowed options for this field could not be loaded. Try again later.';

/** Data types whose values must be one of the definition's options. */
const OPTION_DATA_TYPES = new Set(['enum', 'enum_multi']);

export const listCustomFieldDefinitionsInputSchema = z.object({
  entity_type: z
    .enum(['container', 'shipment'])
    .optional()
    .describe(
      'Only list fields for containers or for shipments. Omit for both.',
    ),
  include_archived: z
    .boolean()
    .optional()
    .default(false)
    .describe('Also list archived fields. Default: false'),
});

export type ListCustomFieldDefinitionsArgs = z.input<
  typeof listCustomFieldDefinitionsInputSchema
>;

const optionSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  value: z.string().nullable(),
});

const definitionSchema = z.object({
  id: z.string(),
  api_slug: z.string(),
  display_name: z.string().nullable(),
  description: z.string().nullable(),
  entity_type: z.enum(['container', 'shipment']).nullable(),
  data_type: z.string().nullable(),
  reference_type: z.string().nullable(),
  validation: z.record(z.string(), z.unknown()).nullable(),
  sensitive: z.boolean().nullable(),
  archived: z.boolean(),
  options: z.array(optionSchema).nullable().optional(),
  options_note: z.string().optional(),
});

export const listCustomFieldDefinitionsOutputSchema = z.object({
  total: z.number(),
  definitions: z.array(definitionSchema).nullable(),
  custom_fields_note: z.string().optional(),
});

export type ListCustomFieldDefinitionsResult = z.infer<
  typeof listCustomFieldDefinitionsOutputSchema
>;
type Definition = z.infer<typeof definitionSchema>;

const rawDefinitionsSchema = z.object({ data: z.array(z.unknown()) });

const rawDefinitionSchema = z.object({
  id: z.string(),
  attributes: z.object({
    api_slug: z.string(),
    display_name: nullableString,
    description: nullableString,
    entity_type: nullableString,
    data_type: nullableString,
    reference_type: nullableString,
    validation: z.record(z.string(), z.unknown()).nullable().catch(null),
    sensitive: nullableBoolean,
    discarded_at: nullableString,
  }),
});

const rawOptionsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({
        label: nullableString,
        value: nullableString,
        position: nullableNumber,
      }),
    }),
  ),
});

function entityType(apiType: string | null): EntityType | null {
  if (apiType === ENTITY_TYPES.container) return 'container';
  if (apiType === ENTITY_TYPES.shipment) return 'shipment';
  return null;
}

async function loadOptions(
  definitionId: string,
  client: Terminal49Client,
): Promise<Definition['options']> {
  const { data } = rawOptionsSchema.parse(
    await client.customFieldOptions.list(definitionId, { format: 'raw' }),
  );
  return data
    .sort(
      (a, b) =>
        (a.attributes.position ?? Infinity) -
        (b.attributes.position ?? Infinity),
    )
    .map((option) => ({
      id: option.id,
      label: option.attributes.label,
      value: option.attributes.value,
    }));
}

export async function executeListCustomFieldDefinitions(
  args: ListCustomFieldDefinitionsArgs,
  client: Terminal49Client,
): Promise<ListCustomFieldDefinitionsResult> {
  const { entity_type, include_archived } =
    listCustomFieldDefinitionsInputSchema.parse(args);

  let raw: unknown;
  try {
    raw = await client.customFieldDefinitions.list({
      filters: { entityType: entity_type && ENTITY_TYPES[entity_type] },
      format: 'raw',
    });
  } catch (error) {
    if (isFeatureNotEnabled(error)) {
      return {
        total: 0,
        definitions: null,
        custom_fields_note: CUSTOM_FIELDS_FEATURE_NOTE,
      };
    }
    if (isNotAuthorized(error)) {
      return {
        total: 0,
        definitions: null,
        custom_fields_note: CUSTOM_FIELDS_AUTH_NOTE,
      };
    }
    throw error;
  }

  const rows = rawDefinitionsSchema.parse(raw).data.flatMap((item) => {
    const parsed = rawDefinitionSchema.safeParse(item);
    if (!parsed.success) return [];
    return include_archived || !parsed.data.attributes.discarded_at
      ? [parsed.data]
      : [];
  });

  // One request at a time, so an account with many enum fields does not
  // trip the rate limit.
  const definitions: Definition[] = [];
  for (const { id, attributes } of rows) {
    const { discarded_at, entity_type: apiEntityType, ...rest } = attributes;
    const definition: Definition = {
      id,
      ...rest,
      entity_type: entityType(apiEntityType),
      archived: discarded_at !== null,
    };
    if (OPTION_DATA_TYPES.has(attributes.data_type ?? '')) {
      try {
        definition.options = await loadOptions(id, client);
      } catch (error) {
        if (httpStatus(error) === 429) throw error;
        definition.options = null;
        definition.options_note = CUSTOM_FIELD_OPTIONS_NOTE;
      }
    }
    definitions.push(definition);
  }

  return { total: definitions.length, definitions };
}
