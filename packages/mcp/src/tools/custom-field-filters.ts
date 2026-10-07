/**
 * Resolve custom field filters written the way a user says them ("Sales Rep",
 * "incoterm") into the api_slug keys the API filters on.
 *
 * The API silently ignores an unknown slug and returns the unfiltered list, so
 * every key is checked against the account's definitions before the request.
 * Only text and enum fields filter on the deployed API (checked 2026-10-06);
 * number, boolean, and date fields are rejected instead of returning an
 * unscoped list that looks scoped.
 */

import { Terminal49Client, ValidationError } from '@terminal49/sdk';

const FILTERABLE_TYPES = new Set(['short_text', 'enum', 'enum_multi']);
const PRESENCE = new Set(['@exists', '@not_exists']);

interface Definition {
  slug: string;
  name: string;
  dataType: string;
  options: string[];
}

export interface ResolvedCustomFieldFilter {
  field: string;
  api_slug: string;
  data_type: string;
  value: string;
}

const normalize = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]/g, '');

async function loadDefinitions(
  client: Terminal49Client,
): Promise<Definition[]> {
  const doc: any = await client.customFieldDefinitions.list({
    include: 'options',
    pageSize: 100,
    format: 'raw',
  });
  const options = new Map<string, string>();
  for (const item of doc?.included ?? []) {
    if (item?.type === 'custom_field_option' && item.attributes?.value)
      options.set(item.id, String(item.attributes.value));
  }
  return (doc?.data ?? [])
    .filter(
      (item: any) =>
        item?.attributes?.api_slug && !item.attributes.discarded_at,
    )
    .map((item: any) => ({
      slug: item.attributes.api_slug,
      name: item.attributes.display_name ?? item.attributes.api_slug,
      dataType: item.attributes.data_type ?? 'short_text',
      options: (item.relationships?.options?.data ?? [])
        .map((ref: any) => options.get(ref.id))
        .filter(Boolean),
    }));
}

function findDefinition(definitions: Definition[], field: string) {
  return (
    definitions.find((d) => d.slug === field) ??
    definitions.find((d) => d.name.toLowerCase() === field.toLowerCase()) ??
    definitions.find(
      (d) =>
        normalize(d.name) === normalize(field) ||
        normalize(d.slug) === normalize(field),
    )
  );
}

// Enum values match case-sensitively on the stored option value, so map each
// term to the option the user meant ("fob" -> "FOB").
function enumValue(definition: Definition, value: string): string {
  return value
    .split(',')
    .map((term) => term.trim())
    .map((term) => {
      if (PRESENCE.has(term) || definition.options.length === 0) return term;
      const option = definition.options.find(
        (o) => o.toLowerCase() === term.toLowerCase(),
      );
      if (!option)
        throw new ValidationError(
          `Invalid custom field filter "${definition.name}": "${term}" is not an option. Options: ${definition.options.join(', ')}.`,
          400,
          { filter: 'custom_fields', field: definition.slug },
        );
      return option;
    })
    .join(',');
}

export async function resolveCustomFieldFilters(
  requested: Record<string, string> | undefined,
  client: Terminal49Client,
): Promise<{
  custom_fields?: Record<string, string>;
  resolved: ResolvedCustomFieldFilter[];
}> {
  if (!requested || Object.keys(requested).length === 0)
    return { resolved: [] };
  const definitions = await loadDefinitions(client);
  const filterable = definitions.filter((d) =>
    FILTERABLE_TYPES.has(d.dataType),
  );
  const customFields: Record<string, string> = {};
  const resolved: ResolvedCustomFieldFilter[] = [];
  for (const [field, raw] of Object.entries(requested)) {
    const definition = findDefinition(definitions, field);
    if (!definition)
      throw new ValidationError(
        `Invalid custom field filter "${field}": no custom field with that name. Filterable fields: ${filterable.map((d) => d.name).join(', ') || 'none'}.`,
        400,
        { filter: 'custom_fields', field },
      );
    if (!FILTERABLE_TYPES.has(definition.dataType))
      throw new ValidationError(
        `Invalid custom field filter "${definition.name}": ${definition.dataType} custom fields cannot be filtered yet. Read the field from container details instead.`,
        400,
        { filter: 'custom_fields', field: definition.slug },
      );
    const value =
      definition.dataType === 'short_text'
        ? raw.trim()
        : enumValue(definition, raw);
    customFields[definition.slug] = value;
    resolved.push({
      field: definition.name,
      api_slug: definition.slug,
      data_type: definition.dataType,
      value,
    });
  }
  return { custom_fields: customFields, resolved };
}
