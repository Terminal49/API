/**
 * Reads and checks custom field values for set_custom_field and
 * update_custom_field.
 *
 * Terminal49 quietly drops an enum option it does not know and stores an
 * empty value instead, and a POST on a field that already has a value
 * replaces it. So a write finds the definition, checks the value against its
 * data type and options, and reads the current value before it sends
 * anything.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { nullableString } from './api-fields.js';
import type { ToolContext } from './context.js';
import {
  type CustomFieldOption,
  type DefinitionEntityType,
  entityType,
  loadOptions,
  OPTION_DATA_TYPES,
  rawDefinitionSchema,
  rawDefinitionsSchema,
} from './list-custom-field-definitions.js';
import {
  REFERENCE_ENTITY_TYPES,
  type ReferenceEntityType,
  readReferenceRecord,
  type ReferenceTarget,
  referenceTargetSchema,
} from './reference-numbers.js';
import {
  isFeatureNotEnabled,
  isNotAuthorized,
  type SoftResult,
} from './soft-results.js';

// ==================== Inputs ====================

export const customFieldTargetInput = {
  entity_type: z
    .enum(REFERENCE_ENTITY_TYPES)
    .describe('The kind of record that holds the custom field.'),
  entity_id: z
    .string()
    .uuid()
    .describe(
      'The Terminal49 ID (UUID format) of that record. Identifier only; never pass conversation text.',
    ),
  api_slug: z
    .string()
    .regex(/^[A-Za-z0-9_]{1,255}$/)
    .describe(
      "The field's api_slug from the account's custom field definitions, such as po_number.",
    ),
};

export const MAX_TEXT_LENGTH = 1000;
const MAX_LIST_VALUES = 50;

export const customFieldValueInput = z
  .union([
    z.string().trim().min(1).max(MAX_TEXT_LENGTH),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().trim().min(1).max(256)).min(1).max(MAX_LIST_VALUES),
  ])
  .describe(
    'The value, in the form the field data_type needs: text for short_text; a number for number; YYYY-MM-DD for date; an ISO 8601 date and time with a time zone, such as 2026-03-01T14:30:00Z, for datetime; true or false for boolean; one option value for enum; a list of option values for enum_multi.',
  );

export type CustomFieldInputValue = z.infer<typeof customFieldValueInput>;

// ==================== Definitions ====================

export interface FieldDefinition {
  id: string;
  api_slug: string;
  display_name: string | null;
  entity_type: DefinitionEntityType | null;
  data_type: string | null;
  /** The allowed option values, for enum and enum_multi fields. */
  options?: CustomFieldOption[];
}

export const fieldSchema = z.object({
  api_slug: z.string(),
  display_name: z.string().nullable(),
  data_type: z.string().nullable(),
});

export type Field = z.infer<typeof fieldSchema>;

export function fieldOf(definition: FieldDefinition): Field {
  return {
    api_slug: definition.api_slug,
    display_name: definition.display_name,
    data_type: definition.data_type,
  };
}

/**
 * The account's active definition with this slug, with its options unless
 * `withOptions` is false, or undefined. The definitions list is not
 * paginated, so one request sees them all.
 */
export async function findDefinition(
  client: Terminal49Client,
  apiSlug: string,
  withOptions = true,
): Promise<FieldDefinition | undefined> {
  const { data } = rawDefinitionsSchema.parse(
    await client.customFieldDefinitions.list({ format: 'raw' }),
  );
  const match = data
    .map((item) => rawDefinitionSchema.safeParse(item))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []))
    .find(
      ({ attributes }) =>
        attributes.api_slug === apiSlug && !attributes.discarded_at,
    );
  if (!match) return undefined;
  const { attributes } = match;
  const definition: FieldDefinition = {
    id: match.id,
    api_slug: attributes.api_slug,
    display_name: attributes.display_name,
    entity_type: entityType(attributes.entity_type),
    data_type: attributes.data_type,
  };
  if (withOptions && OPTION_DATA_TYPES.has(attributes.data_type ?? '')) {
    definition.options = await loadOptions(match.id, client);
  }
  return definition;
}

// ==================== Soft results ====================

export interface FieldSoftResult<Code extends string> extends SoftResult<Code> {
  api_slug: string;
}

export function unknownField(
  apiSlug: string,
): FieldSoftResult<'unknown_field'> {
  return {
    error: 'unknown_field',
    message: `This account has no active custom field with api_slug ${apiSlug}. Nothing was changed.`,
    alternative:
      "Look up the field's api_slug in the account's custom field definitions.",
    api_slug: apiSlug,
  };
}

const ENTITY_LABELS = {
  container: 'container',
  shipment: 'shipment',
  tracking_request: 'tracking request',
} satisfies Record<ReferenceEntityType, string>;

export interface FieldNotApplicable extends FieldSoftResult<'field_not_applicable'> {
  field_entity_type: DefinitionEntityType | null;
}

/**
 * Undefined when a field for this kind of record can be written on the
 * target. A tracking request takes both kinds; Terminal49 copies the value to
 * the shipment or containers the request creates.
 */
export function fieldNotApplicable(
  definition: FieldDefinition,
  target: ReferenceEntityType,
): FieldNotApplicable | undefined {
  const kind = definition.entity_type;
  if (target === 'tracking_request' || kind === target) return undefined;
  return {
    error: 'field_not_applicable',
    message: `The custom field ${definition.api_slug} belongs on ${kind ? `${ENTITY_LABELS[kind]}s` : 'another kind of record'}, not on a ${ENTITY_LABELS[target]}. Nothing was changed.`,
    alternative: kind
      ? `Set it on the ${ENTITY_LABELS[kind]} instead.`
      : 'Set it in the Terminal49 dashboard.',
    api_slug: definition.api_slug,
    field_entity_type: kind,
  };
}

export const CUSTOM_FIELDS_NOT_ENABLED: SoftResult<'FeatureNotEnabled'> = {
  error: 'FeatureNotEnabled',
  message:
    'Custom fields are not enabled for this Terminal49 account or credential. Nothing was changed.',
  alternative: 'Ask an account admin to enable custom fields.',
};

export const CREDENTIAL_NOT_SUPPORTED: SoftResult<'credential_not_supported'> =
  {
    error: 'credential_not_supported',
    message:
      'Terminal49 accepts custom field changes only from a signed-in Terminal49 user, not from this credential. Nothing was changed.',
    alternative:
      'Connect this MCP server through Terminal49 sign-in, or change the value in the Terminal49 dashboard.',
  };

/**
 * The soft result for a request Terminal49 refused with 401 or 403, when
 * /me says why: the credential type, or a feature the account lacks.
 * Undefined when the refusal has some other cause.
 */
export async function customFieldsRefused(
  error: unknown,
  context: ToolContext,
): Promise<
  SoftResult<'FeatureNotEnabled' | 'credential_not_supported'> | undefined
> {
  if (isFeatureNotEnabled(error)) return { ...CUSTOM_FIELDS_NOT_ENABLED };
  if (!isNotAuthorized(error)) return undefined;
  let status: string | undefined;
  try {
    status = (await context.me()).features.custom_fields?.status;
  } catch {
    return undefined;
  }
  if (status === 'requires_user_credential') {
    return { ...CREDENTIAL_NOT_SUPPORTED };
  }
  if (status === 'requires_paid_plan' || status === 'not_enabled') {
    return { ...CUSTOM_FIELDS_NOT_ENABLED };
  }
  return undefined;
}

// ==================== Value checks ====================

export interface InvalidValue extends FieldSoftResult<'invalid_value'> {
  data_type: string;
  expected: string;
  allowed_values?: string[];
}

export interface UnsupportedField extends FieldSoftResult<'unsupported_field'> {
  data_type: string | null;
}

const EXPECTED = {
  short_text: `text of 1 to ${MAX_TEXT_LENGTH} characters`,
  number: 'a number whose absolute value is under 1000000000000',
  date: 'a date as YYYY-MM-DD',
  datetime:
    'an ISO 8601 date and time with a time zone, such as 2026-03-01T14:30:00Z',
  boolean: 'true or false',
  enum: 'exactly one of allowed_values',
  enum_multi: `a list of 1 to ${MAX_LIST_VALUES} values from allowed_values`,
} as const;

type SupportedDataType = keyof typeof EXPECTED;

function isSupported(dataType: string | null): dataType is SupportedDataType {
  return dataType !== null && Object.hasOwn(EXPECTED, dataType);
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function isDateTime(value: string): boolean {
  return (
    DATETIME.test(value) &&
    isCalendarDate(value.slice(0, 10)) &&
    !Number.isNaN(Date.parse(value))
  );
}

function optionValues(definition: FieldDefinition): string[] {
  return (definition.options ?? []).flatMap((option) =>
    option.value === null ? [] : [option.value],
  );
}

/** The value as Terminal49 should store it, or undefined when it does not fit. */
function acceptedValue(
  dataType: SupportedDataType,
  value: CustomFieldInputValue,
  allowed: readonly string[],
): CustomFieldInputValue | undefined {
  switch (dataType) {
    case 'short_text':
      return typeof value === 'string' ? value : undefined;
    case 'number':
      return typeof value === 'number' && Math.abs(value) < 1e12
        ? value
        : undefined;
    case 'date':
      return typeof value === 'string' && isCalendarDate(value)
        ? value
        : undefined;
    case 'datetime':
      return typeof value === 'string' && isDateTime(value) ? value : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? value : undefined;
    case 'enum':
      return typeof value === 'string' && allowed.includes(value)
        ? value
        : undefined;
    case 'enum_multi': {
      if (!Array.isArray(value)) return undefined;
      const unique = [...new Set(value)];
      return unique.every((entry) => allowed.includes(entry))
        ? unique
        : undefined;
    }
  }
}

export type CheckedValue =
  | { ok: true; value: CustomFieldInputValue }
  | { ok: false; result: InvalidValue | UnsupportedField };

/** Checks a value against the field's data type and, for enums, its options. */
export function checkValue(
  definition: FieldDefinition,
  value: CustomFieldInputValue,
): CheckedValue {
  const dataType = definition.data_type;
  if (!isSupported(dataType)) {
    return { ok: false, result: unsupportedField(definition) };
  }
  const allowed = optionValues(definition);
  const accepted = acceptedValue(dataType, value, allowed);
  if (accepted !== undefined) return { ok: true, value: accepted };
  const hasOptions = OPTION_DATA_TYPES.has(dataType);
  return {
    ok: false,
    result: {
      error: 'invalid_value',
      message: `The value does not fit the custom field ${definition.api_slug}, whose data_type ${dataType} needs ${EXPECTED[dataType]}. Nothing was changed.`,
      alternative: hasOptions
        ? 'Ask the user to choose from allowed_values.'
        : 'Ask the user for a value in that form.',
      api_slug: definition.api_slug,
      data_type: dataType,
      expected: EXPECTED[dataType],
      ...(hasOptions ? { allowed_values: allowed } : {}),
    },
  };
}

function unsupportedField(definition: FieldDefinition): UnsupportedField {
  return {
    error: 'unsupported_field',
    message: `This tool cannot write custom fields of data_type ${definition.data_type ?? 'unknown'}. Nothing was changed.`,
    alternative: 'Change this field in the Terminal49 dashboard.',
    api_slug: definition.api_slug,
    data_type: definition.data_type,
  };
}

// ==================== Current values ====================

export interface StoredValue {
  value: unknown;
  display_value: string | null;
}

const rawFieldsSchema = z.object({
  data: z.array(
    z.object({
      attributes: z.object({
        api_slug: z.string(),
        value: z.unknown(),
        display_value: nullableString,
      }),
    }),
  ),
});

/**
 * Every entry the record holds for the field. A tracking request holds one
 * per container number when it staged a container field per container, and
 * Terminal49 does not say which entry belongs to which container.
 */
export async function readStoredValues(
  client: Terminal49Client,
  entityType: ReferenceEntityType,
  id: string,
  apiSlug: string,
): Promise<StoredValue[]> {
  const raw = await {
    container: () => client.containers.customFields(id, { format: 'raw' }),
    shipment: () => client.shipments.customFields(id, { format: 'raw' }),
    tracking_request: () =>
      client.trackingRequests.customFields(id, { format: 'raw' }),
  }[entityType]();
  return rawFieldsSchema
    .parse(raw)
    .data.filter(({ attributes }) => attributes.api_slug === apiSlug)
    .map(({ attributes: { value, display_value } }) => ({
      value,
      display_value,
    }));
}

/**
 * Terminal49 reports an enum whose option was removed as '' and an
 * enum_multi with none left as [], so both count as no value.
 */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  return !(Array.isArray(value) && value.length === 0);
}

/** A stored or requested value in a form two values can be compared in. */
function comparable(dataType: string | null, value: unknown): unknown {
  if (dataType === 'number') {
    const number = Number(value);
    return Number.isNaN(number) ? value : number;
  }
  if (dataType === 'datetime' && typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? value : time;
  }
  if (dataType === 'enum_multi' && Array.isArray(value)) {
    return [...new Set(value.map(String))].sort();
  }
  return value;
}

/** Whether a stored value already equals the requested one. */
export function sameValue(
  dataType: string | null,
  stored: unknown,
  requested: CustomFieldInputValue,
): boolean {
  return (
    JSON.stringify(comparable(dataType, stored)) ===
    JSON.stringify(comparable(dataType, requested))
  );
}

// ==================== Record state ====================

export interface FieldState {
  definition: FieldDefinition;
  record: ReferenceTarget;
  /** Undefined when the field has no value on the record. */
  stored: StoredValue | undefined;
}

export interface FieldWriteTarget {
  entity_type: ReferenceEntityType;
  entity_id: string;
  api_slug: string;
}

/** A reason a write stops before it reads the record. */
export type FieldStop =
  | FieldSoftResult<'unknown_field'>
  | FieldNotApplicable
  | InvalidValue
  | UnsupportedField;

/**
 * The field's definition, or why this tool cannot write it on this kind of
 * record. A clear checks no value, so it skips loading the options.
 */
export async function findWritableField(
  client: Terminal49Client,
  target: FieldWriteTarget,
  clearing = false,
): Promise<{ definition: FieldDefinition } | { stop: FieldStop }> {
  const definition = await findDefinition(client, target.api_slug, !clearing);
  if (!definition) return { stop: unknownField(target.api_slug) };
  const notApplicable = fieldNotApplicable(definition, target.entity_type);
  if (notApplicable) return { stop: notApplicable };
  // A clear on a field no tool can write would leave no way to restore it.
  if (!isSupported(definition.data_type)) {
    return { stop: unsupportedField(definition) };
  }
  return { definition };
}

export interface AmbiguousField extends FieldSoftResult<'ambiguous_field'> {
  record: ReferenceTarget;
  values: StoredValue[];
}

export interface UseShipmentOrContainer extends FieldSoftResult<'use_shipment_or_container'> {
  record: ReferenceTarget;
  shipment_id: string;
}

/**
 * Terminal49 copies a tracking request's value to its shipment or containers
 * only when the value is first created. Once the shipment exists, a later
 * change on the tracking request does not reach the copies, and a new value
 * replaces theirs.
 */
function useShipmentOrContainer(
  definition: FieldDefinition,
  record: ReferenceTarget,
  shipmentId: string,
): UseShipmentOrContainer {
  return {
    error: 'use_shipment_or_container',
    message: `This tracking request already created shipment ${shipmentId}. A change on the tracking request does not reach that shipment or its containers. Nothing was changed.`,
    alternative:
      definition.entity_type === 'container'
        ? `Change the field on each container of shipment ${shipmentId}.`
        : `Change the field on shipment ${shipmentId}.`,
    api_slug: definition.api_slug,
    record,
    shipment_id: shipmentId,
  };
}

/**
 * The record's label and the field's current value on it. A tracking request
 * that already created its shipment stops. So does a record with more than
 * one entry for the field: Terminal49 changes one of them without saying
 * which, so no single value can be checked or previewed.
 */
export async function readFieldState(
  client: Terminal49Client,
  target: FieldWriteTarget,
  definition: FieldDefinition,
): Promise<FieldState | { stop: AmbiguousField | UseShipmentOrContainer }> {
  const { entity_type, entity_id, api_slug } = target;
  const { target: record, shipment_id } = await readReferenceRecord(
    client,
    entity_type,
    entity_id,
  );
  if (shipment_id) {
    return { stop: useShipmentOrContainer(definition, record, shipment_id) };
  }
  const entries = await readStoredValues(
    client,
    entity_type,
    entity_id,
    api_slug,
  );
  if (entries.length > 1) {
    return {
      stop: {
        error: 'ambiguous_field',
        message: `This ${ENTITY_LABELS[entity_type]} holds ${entries.length} values for the custom field ${api_slug}, one per container. Nothing was changed.`,
        alternative:
          'Show values to the user, and change the field on each container or in the Terminal49 dashboard.',
        api_slug,
        record,
        values: entries,
      },
    };
  }
  const [entry] = entries;
  const stored = entry && hasValue(entry.value) ? entry : undefined;
  return { definition, record, stored };
}

const rawWrittenFieldSchema = z.object({
  data: z.object({
    attributes: z
      .object({ value: z.unknown(), display_value: nullableString })
      .catch({ value: undefined, display_value: null }),
  }),
});

/** The value Terminal49 returned after a write, or the value sent if it returned none. */
export function writtenValue(
  raw: unknown,
  sent: CustomFieldInputValue,
): StoredValue {
  const parsed = rawWrittenFieldSchema.safeParse(raw);
  if (!parsed.success || parsed.data.data.attributes.value === undefined) {
    return { value: sent, display_value: null };
  }
  return {
    value: parsed.data.data.attributes.value,
    display_value: parsed.data.data.attributes.display_value,
  };
}

export const customFieldResultFields = {
  record: referenceTargetSchema.optional(),
  field: fieldSchema.optional(),
  api_slug: z.string().optional(),
  value: z.unknown().optional(),
  display_value: z.string().nullable().optional(),
  data_type: z.string().nullable().optional(),
  expected: z.string().optional(),
  allowed_values: z.array(z.string()).optional(),
  field_entity_type: z.string().nullable().optional(),
  values: z
    .array(
      z.object({ value: z.unknown(), display_value: z.string().nullable() }),
    )
    .optional(),
  shipment_id: z.string().optional(),
  undo: z.string().optional(),
};
