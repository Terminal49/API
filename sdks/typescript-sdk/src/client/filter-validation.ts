import {
  CONTAINER_FILTER_KINDS,
  CONTAINER_STATUSES,
  PARTY_ROLES,
  SHIPMENT_FILTER_KINDS,
} from '../generated/list-filters.js';
import { ValidationError } from './errors.js';

const STRING_EXPRESSION = /^(?:=|@)?[a-zA-Z0-9_\-.\s&]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_DAY = /^(?:today|\d+\.days?\.(?:ago|from_now))$/;
const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const PRESENCE = new Set(['@exists', '@not_exists']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHIPMENT_OR_ARRAYS = new Set([
  'number',
  'pol_code',
  'pod_code',
  'owner_id',
  'pod_terminal_id',
]);
const SHIPMENT_VALUE_SCOPES = new Set(['pol_code', 'pod_code', 'owner_id']);
const SHIPMENT_SORTS = new Set([
  'created_at',
  '-created_at',
  'pod_arrival',
  '-pod_arrival',
  'tracking_stopped_at',
  '-tracking_stopped_at',
]);
const CONTAINER_SORTS = new Set([
  'arrival',
  'created_at',
  'updated_at',
  'shipment_number',
  'destination_ata_at',
  'destination_eta_at',
  'empty_terminated_at',
  'final_destination_full_out_at',
  'last_status_refresh_at',
  'picked_up_at',
  'delivered_at',
  'delivery_appointment_at',
  'pickup_lfd',
  'pickup_lfd_line_on',
  'pickup_lfd_line_effective_on',
  'pickup_lfd_line_ind_effective_on',
  'pickup_lfd_line_ind_on',
  'ind_lfd',
  'pickup_lfd_rail_on',
  'pickup_lfd_rail_effective_on',
  'pickup_lfd_terminal_on',
  'pickup_lfd_terminal_effective_on',
  'pod_arrived_at',
  'pod_discharged_at',
  'pod_eta_at',
  'pod_ata_at',
  'inland_destination_rail_unloaded_at',
  'inland_destination_eta_at',
  'inland_destination_ata_at',
  'pod_rail_loaded_at',
  'pol_full_in_at',
  'empty_out_at',
  'pol_vessel_loaded_at',
  'pol_vessel_departed_at',
]);

function invalid(key: string, reason: string): never {
  throw new ValidationError(`Invalid list filter "${key}": ${reason}`, 400, {
    filter: key,
  });
}

function values(key: string, input: unknown): string[] {
  const result = Array.isArray(input) ? [...input] : [input];
  if (
    result.length === 0 ||
    result.some((v) => typeof v !== 'string' || !v.trim())
  ) {
    invalid(key, 'expected a nonempty string or nonempty array of strings');
  }
  return result as string[];
}

function validateIds(
  key: string,
  input: unknown,
  allowPresence: boolean,
  allowEquality = true,
): void {
  for (const raw of values(key, input).flatMap((v) => v.split(','))) {
    if (allowPresence && PRESENCE.has(raw)) continue;
    const value = allowEquality ? raw.replace(/^=/, '') : raw;
    if (!UUID.test(value))
      invalid(
        key,
        'expected UUID identifiers from authorized API results; no automatic lookup is performed',
      );
  }
}

function validDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function dateExpression(
  key: string,
  expression: string,
  datetime: boolean,
): { operator: string; time?: number } {
  if (PRESENCE.has(expression)) return { operator: expression };
  const match = /^(>=|<=|>|<|=)?(.+)$/.exec(expression)!;
  const operator = match[1] || '=';
  const literals = datetime ? [match[2]] : match[2].split(',');
  if (literals.length > 1 && match[1])
    invalid(
      key,
      'do not combine comma-separated dates with a comparison operator; use an array of bounds',
    );
  for (const value of literals) {
    if (datetime) {
      if (
        !INSTANT.test(value) ||
        !validDay(value.slice(0, 10)) ||
        !Number.isFinite(Date.parse(value)) ||
        Number(value.slice(11, 13)) > 23 ||
        Number(value.slice(14, 16)) > 59 ||
        Number(value.slice(17, 19)) > 59
      ) {
        invalid(
          key,
          'expected an ISO 8601 timestamp including Z or a timezone offset',
        );
      }
    } else if (!validDay(value) && !RELATIVE_DAY.test(value)) {
      invalid(
        key,
        'expected YYYY-MM-DD, today, N.days.ago, N.days.from_now, or a supported presence expression',
      );
    }
  }
  const time =
    literals.length === 1 && !RELATIVE_DAY.test(literals[0])
      ? Date.parse(datetime ? literals[0] : `${literals[0]}T00:00:00Z`)
      : undefined;
  return { operator, time };
}

function validateDates(key: string, input: unknown, datetime: boolean): void {
  const expressions = values(key, input);
  if (expressions.includes('@not_exists') && expressions.length > 1)
    invalid(key, '@not_exists cannot be combined with another bound');
  const bounds = expressions.map((v) => dateExpression(key, v, datetime));
  const lower = bounds.filter(
    (b) => ['=', '>', '>='].includes(b.operator) && b.time !== undefined,
  );
  const upper = bounds.filter(
    (b) => ['=', '<', '<='].includes(b.operator) && b.time !== undefined,
  );
  if (key === 'pod_eta_changed_at' && lower.length === 0)
    invalid(key, 'requires a lower timestamp bound (=, >, or >=)');
  for (const l of lower)
    for (const u of upper) {
      const strict =
        key === 'pod_eta_changed_at'
          ? l !== u
          : l.operator === '>' || u.operator === '<';
      if (l.time! > u.time! || (strict && l.time === u.time))
        invalid(
          key,
          'upper bound must be after the lower bound (equal inclusive dates are allowed)',
        );
    }
}

function validateString(
  key: string,
  input: unknown,
  allowsDistinctArrayValues = false,
): void {
  const terms = values(key, input);
  if (
    !allowsDistinctArrayValues &&
    terms.includes('@not_exists') &&
    terms.some((v) => v !== '@not_exists')
  )
    invalid(key, '@not_exists conflicts with another AND term');
  for (const expression of terms) {
    if (PRESENCE.has(expression)) continue;
    if (expression.includes(',')) {
      if (
        /^[=<>]/.test(expression) ||
        expression.includes('~') ||
        expression.split(',').some((v) => v.startsWith('@') && !PRESENCE.has(v))
      )
        invalid(
          key,
          'use comma-separated literals or supported presence markers without a comparison operator for OR',
        );
      if (expression.split(',').some((v) => !v.trim()))
        invalid(key, 'empty alternatives are not allowed');
      continue;
    }
    if (!STRING_EXPRESSION.test(expression) || expression.startsWith('@'))
      invalid(
        key,
        'use exact text, =text, @exists, or @not_exists; use a search_by_* filter for text search',
      );
  }
  if (
    !allowsDistinctArrayValues &&
    terms.length > 1 &&
    terms.every((v) => !v.includes(',') && !v.startsWith('@'))
  ) {
    const exact = new Set(terms.map((v) => v.replace(/^=/, '')));
    if (exact.size > 1)
      invalid(
        key,
        'arrays combine exact values with AND; use a comma-separated string for OR',
      );
  }
}

function validateSort(
  entity: 'shipment' | 'container',
  input: unknown,
): string {
  if (typeof input !== 'string' || !input.trim())
    invalid('sort', 'expected a supported sort token');
  const tokens = input.split(',').map((v) => v.trim());
  if (entity === 'shipment') {
    if (tokens.length !== 1 || !SHIPMENT_SORTS.has(tokens[0]))
      invalid(
        'sort',
        `supported shipment values: ${[...SHIPMENT_SORTS].join(', ')}`,
      );
  } else if (
    input !== 'attention_priority' &&
    (tokens.length > 3 ||
      tokens.some((v) => !CONTAINER_SORTS.has(v.replace(/^-/, ''))))
  ) {
    invalid(
      'sort',
      'use up to three documented container sort fields or standalone attention_priority',
    );
  }
  return tokens.join(',');
}

/** Validate canonical fields and produce API query keys. Invalid inputs never reach the network. */
export function buildFilterQuery(
  entity: 'shipment' | 'container',
  input: unknown,
): Record<string, unknown> {
  if (!input || Array.isArray(input) || typeof input !== 'object')
    invalid('filters', 'expected an object');
  const fields: Record<string, unknown> = { ...input };
  const query: Record<string, unknown> = {};
  const aliases: Record<string, string> =
    entity === 'container'
      ? {
          port: 'pod_code',
          status: 'current_status',
          carrier: 'shipping_line_scac',
        }
      : { port: 'pod_code', trackingStopped: 'tracking_stopped' };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (fields[alias] === undefined) continue;
    if (
      fields[canonical] !== undefined &&
      JSON.stringify(fields[canonical]) !== JSON.stringify(fields[alias])
    )
      invalid(alias, `conflicts with ${canonical}; supply only one`);
    fields[canonical] = fields[alias];
    delete fields[alias];
  }
  const kinds: Record<string, string> =
    entity === 'shipment' ? SHIPMENT_FILTER_KINDS : CONTAINER_FILTER_KINDS;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (key === 'include') continue;
    if (key === 'includeContainers' && entity === 'shipment') {
      if (typeof value !== 'boolean') invalid(key, 'expected true or false');
      continue;
    }
    if (key === 'sort') {
      query.sort = validateSort(entity, value);
      continue;
    }
    if (key === 'updatedAfter')
      invalid(
        key,
        'timestamp semantics are unsupported; containers.updated_at compares dates; shipments has no updated_at filter',
      );
    if (entity === 'shipment' && key === 'status')
      invalid(
        key,
        'there is no general shipment status filter; use voyage_status only for voyage arrival state',
      );
    if (entity === 'shipment' && key === 'carrier')
      invalid(
        key,
        'there is no shipment carrier filter; query containers using shipping_line_scac when that answers the question',
      );
    if (entity === 'container' && ['pod_eta_at', 'pod_ata_at'].includes(key))
      invalid(
        key,
        'currently returns HTTP 500 on the deployed API; use shipment POD-date filters or container arrival',
      );
    if (entity === 'container' && key === 'custom_fields')
      invalid(
        key,
        'known custom-field slugs are currently ignored by the deployed API; support is pending API verification',
      );
    if (!Object.hasOwn(kinds, key))
      invalid(
        key,
        `unsupported ${entity} filter; use a documented canonical name`,
      );
    const kind = kinds[key];
    switch (kind) {
      case 'boolean':
        if (typeof value !== 'boolean') invalid(key, 'expected true or false');
        break;
      case 'selector':
        if (value !== true)
          invalid(
            key,
            'only true narrows results reliably; omit this filter to disable the selector',
          );
        break;
      case 'voyage':
        if (value !== 'arrived' && value !== 'on_ship')
          invalid(key, 'expected arrived or on_ship');
        break;
      case 'status':
        for (const term of values(key, value).flatMap((v) =>
          v.replace(/^=/, '').split(','),
        )) {
          if (
            !PRESENCE.has(term) &&
            !(CONTAINER_STATUSES as readonly string[]).includes(term)
          )
            invalid(key, `expected one of: ${CONTAINER_STATUSES.join(', ')}`);
        }
        validateString(key, value);
        break;
      case 'search':
        if (typeof value !== 'string' || !value.trim())
          invalid(key, 'expected nonempty search text');
        if (
          entity === 'container' &&
          !value.includes(',') &&
          !/^(?:~|=)?[a-zA-Z0-9_\-.\s&]+$/.test(value)
        )
          invalid(
            key,
            'expected supported prefix-search text; comparison operators and unsupported punctuation are not accepted',
          );
        break;
      case 'exact':
      case 'tags':
        values(key, value);
        break;
      case 'date':
        validateDates(key, value, false);
        break;
      case 'datetime':
        validateDates(key, value, true);
        break;
      case 'range':
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          !value.every(
            (v) =>
              typeof v === 'string' && (validDay(v) || RELATIVE_DAY.test(v)),
          )
        )
          invalid(
            key,
            'expected exactly [FROM, TO] as dates without operators',
          );
        if (value.every((v) => validDay(v)) && value[0] > value[1])
          invalid(key, 'FROM must be on or before TO');
        break;
      case 'party':
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          const p = value as Record<string, unknown>;
          if (
            Object.keys(p).some((k) => !['value', 'operator'].includes(k)) ||
            (p.operator !== undefined &&
              p.operator !== 'any' &&
              p.operator !== 'all')
          )
            invalid(key, 'expected { value: IDs, operator: any | all }');
          validateString(key, p.value, true);
          validateIds(key, p.value, false, false);
        } else {
          validateString(key, value, true);
          validateIds(key, value, false, false);
        }
        break;
      case 'parties':
        if (
          !value ||
          Array.isArray(value) ||
          typeof value !== 'object' ||
          Object.keys(value).length === 0
        )
          invalid(
            key,
            'expected a nonempty object mapping a documented role to party IDs or presence',
          );
        for (const [role, ids] of Object.entries(value)) {
          if (!(PARTY_ROLES as readonly string[]).includes(role))
            invalid(`${key}.${role}`, `valid roles: ${PARTY_ROLES.join(', ')}`);
          validateString(`${key}.${role}`, ids, true);
          validateIds(`${key}.${role}`, ids, true);
        }
        break;
      default:
        if (
          entity === 'shipment' &&
          SHIPMENT_VALUE_SCOPES.has(key) &&
          values(key, value).some((v) => v.startsWith('@'))
        )
          invalid(
            key,
            'presence checks are not supported by this identifier scope',
          );
        if (key === 'search_by_owner_id' && Array.isArray(value))
          invalid(key, 'use comma-separated user IDs, not an array');
        validateString(
          key,
          value,
          (entity === 'shipment' && SHIPMENT_OR_ARRAYS.has(key)) ||
            key === 'customer_id',
        );
        if (
          [
            'owner_id',
            'creator_id',
            'customer_id',
            'pod_terminal_id',
            'search_by_owner_id',
          ].includes(key)
        )
          validateIds(
            key,
            value,
            !SHIPMENT_VALUE_SCOPES.has(key) && key !== 'search_by_owner_id',
          );
    }
    if (
      key === 'party_id' &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      for (const [part, item] of Object.entries(value)) {
        query[`filter[party_id][${part}]${Array.isArray(item) ? '[]' : ''}`] =
          item;
      }
    } else if (key === 'parties') {
      const scalarRoles: Record<string, unknown> = {};
      for (const [role, ids] of Object.entries(value as object)) {
        if (Array.isArray(ids)) query[`filter[parties][${role}][]`] = ids;
        else scalarRoles[role] = ids;
      }
      if (Object.keys(scalarRoles).length > 0)
        query['filter[parties]'] = scalarRoles;
    } else {
      query[`filter[${key}]${Array.isArray(value) ? '[]' : ''}`] = value;
    }
  }
  if (
    fields.tags_and !== undefined &&
    fields.tags === undefined &&
    fields.tag === undefined
  )
    invalid('tags_and', 'requires tags or tag');
  if (entity === 'shipment') {
    if (
      typeof fields.actively_tracked === 'boolean' &&
      fields.actively_tracked === fields.tracking_stopped
    )
      invalid('tracking_stopped', 'contradicts actively_tracked');
    if (
      fields.pod_eta_changed_at !== undefined &&
      (fields.tracking_stopped === true ||
        fields.actively_tracked === false ||
        fields.voyage_status === 'arrived')
    )
      invalid('pod_eta_changed_at', 'selects only active, unarrived shipments');
    if (
      (fields.voyage_status === 'arrived' &&
        fields.pod_ata_at === '@not_exists') ||
      (fields.voyage_status === 'on_ship' && fields.pod_ata_at === '@exists')
    )
      invalid('pod_ata_at', 'contradicts voyage_status');
  }
  return query;
}

/** Encode Rails bracketed arrays and nested objects rather than repeated scalar keys. */
export function serializeListQuery(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  function append(key: string, value: unknown): void {
    if (value === undefined) return;
    if (Array.isArray(value)) {
      for (const item of value)
        append(key.endsWith('[]') ? key : `${key}[]`, item);
    } else if (value !== null && typeof value === 'object') {
      for (const [child, item] of Object.entries(value))
        append(`${key}[${child}]`, item);
    } else params.append(key, String(value));
  }
  for (const [key, value] of Object.entries(query)) append(key, value);
  return params.toString();
}
