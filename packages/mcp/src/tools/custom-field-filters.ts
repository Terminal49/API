/**
 * Resolve custom field filters written the way a user says them ("Sales Rep",
 * "incoterm") into the api_slug keys the API filters on.
 *
 * Names resolve against the account's own definitions
 * (GET /accounts/:id/custom_field_definitions). The unscoped
 * GET /custom_field_definitions lists templates, which the account may never
 * have added, and the API silently ignores a slug the account doesn't define
 * and returns the unfiltered list. So every key is checked first, and values
 * are normalized to the shape each data type filters on.
 */

import { Terminal49Client, ValidationError } from '@terminal49/sdk';

const TEXT_TYPES = new Set(['short_text', 'enum', 'enum_multi']);
const DATE_TYPES = new Set(['date', 'datetime']);
const PRESENCE = new Set(['@exists', '@not_exists']);
const DATE_EXPRESSION = /^(>=|<=|>|<|=)?(\d{4}-\d{2}-\d{2})$/;
const NUMBER_EXPRESSION = /^=?(-?\d+(?:\.\d+)?)$/;

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

function invalid(definition: Definition | string, reason: string): never {
  const name = typeof definition === 'string' ? definition : definition.name;
  throw new ValidationError(
    `Invalid custom field filter "${name}": ${reason}`,
    400,
    {
      filter: 'custom_fields',
      field: typeof definition === 'string' ? definition : definition.slug,
    },
  );
}

// The API takes the account from the credential and ignores the id in the
// path, but the route needs one. OAuth sessions carry it; an API key belongs to
// exactly one account, which /accounts returns.
async function accountId(client: Terminal49Client): Promise<string> {
  if (client.accountId) return client.accountId;
  const doc: any = await client.accounts.list({ pageSize: 2, format: 'raw' });
  const accounts = Array.isArray(doc?.data) ? doc.data : [];
  if (accounts.length === 1 && accounts[0]?.id) return String(accounts[0].id);
  throw new ValidationError(
    'Custom field filters need the account: sign in to a single Terminal49 account.',
    400,
    { filter: 'custom_fields' },
  );
}

async function loadDefinitions(
  client: Terminal49Client,
): Promise<Definition[]> {
  const doc: any = await client.customFieldDefinitions.listForAccount(
    await accountId(client),
    { include: 'options', pageSize: 100, format: 'raw' },
  );
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
        invalid(
          definition,
          `"${term}" is not an option. Options: ${definition.options.join(', ')}.`,
        );
      return option;
    })
    .join(',');
}

function filterValue(definition: Definition, raw: string): string {
  const value = raw.trim();
  if (PRESENCE.has(value)) return value;
  const type = definition.dataType;
  if (type === 'short_text') return value;
  if (TEXT_TYPES.has(type)) return enumValue(definition, value);
  if (type === 'boolean') {
    const flag = value.toLowerCase();
    if (['true', 'yes'].includes(flag)) return 'true';
    if (['false', 'no'].includes(flag)) return 'false';
    invalid(definition, 'expected true, false, @exists, or @not_exists.');
  }
  if (DATE_TYPES.has(type)) {
    if (!DATE_EXPRESSION.test(value))
      invalid(
        definition,
        'expected a date such as 2026-10-01, optionally prefixed with >=, <=, >, <, or =, or @exists / @not_exists.',
      );
    return value;
  }
  if (type === 'number' || type === 'decimal') {
    const match = NUMBER_EXPRESSION.exec(value);
    if (!match)
      invalid(
        definition,
        'number fields filter by an exact number or @exists / @not_exists; comparisons are not supported by the API.',
      );
    return match[1];
  }
  invalid(definition, `${type} custom fields cannot be filtered.`);
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
  const customFields: Record<string, string> = {};
  const resolved: ResolvedCustomFieldFilter[] = [];
  for (const [field, raw] of Object.entries(requested)) {
    const definition = findDefinition(definitions, field);
    if (!definition)
      invalid(
        field,
        `this account has no custom field with that name. Its fields: ${definitions.map((d) => d.name).join(', ') || 'none'}.`,
      );
    const value = filterValue(definition, raw);
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
