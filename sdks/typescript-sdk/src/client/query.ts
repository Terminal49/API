import type { paths } from '../generated/terminal49.js';
import type {
  ContainerInclude,
  IncludeParam as IncludeParamOption,
  ListOptions,
  ShipmentInclude,
} from '../types/options.js';

export type IncludeParam<TInclude extends string> =
  | readonly TInclude[]
  | string;

/**
 * Maximum `page[size]` accepted by the Terminal49 v2 list endpoints. Values
 * above this are silently truncated by the API, so the SDK clamps them to keep
 * pagination cursors honest.
 */
export const MAX_PAGE_SIZE = 100;

/** Typed query objects for the JSON:API list endpoints, sourced from the generated OpenAPI spec. */
type ContainerListQuery = NonNullable<
  paths['/containers']['get']['parameters']['query']
>;
type ShipmentListQuery = NonNullable<
  paths['/shipments']['get']['parameters']['query']
>;

/** Filters accepted by {@link buildContainerListQuery}. Mirrors the public `containers.list` signature. */
export interface ContainerListFilters {
  status?: string;
  port?: string;
  carrier?: string;
  updatedAfter?: string;
  include?: IncludeParamOption<ContainerInclude>;
}

/** Filters accepted by {@link buildShipmentListQuery}. Mirrors the public `shipments.list` signature. */
export interface ShipmentListFilters {
  status?: string;
  port?: string;
  carrier?: string;
  updatedAfter?: string;
  trackingStopped?: boolean;
  number?: string;
  includeContainers?: boolean;
  include?: IncludeParamOption<ShipmentInclude>;
}

/** Result of building a list query: the typed query plus any filters the API does not support. */
export interface ListQueryResult<TQuery> {
  query: TQuery;
  unsupportedFilters: string[];
}

/**
 * Filter keys the SDK historically forwarded as `filter[*]` query params but
 * which the Terminal49 v2 API does NOT support on `/containers` or `/shipments`
 * (verified against docs/openapi.json + the generated OpenAPI types). The API
 * silently drops them, so we report them back instead of pretending they worked.
 */
const UNSUPPORTED_FILTER_KEYS = [
  'status',
  'port',
  'carrier',
  'updatedAfter',
] as const;

function collectUnsupportedFilters(
  filters: Partial<Record<(typeof UNSUPPORTED_FILTER_KEYS)[number], unknown>>,
): string[] {
  return UNSUPPORTED_FILTER_KEYS.filter(
    (key) => filters[key] !== undefined && filters[key] !== '',
  );
}

export function normalizeInclude<TInclude extends string>(
  include?: IncludeParam<TInclude>,
): string | undefined {
  if (include === undefined) {
    return undefined;
  }

  if (typeof include === 'string') {
    return include.length > 0 ? include : undefined;
  }

  return include.length > 0 ? include.join(',') : undefined;
}

export function normalizeIncludeWithDefault<TInclude extends string>(
  include: IncludeParam<TInclude> | undefined,
  defaultInclude: IncludeParam<TInclude>,
): string | undefined {
  return normalizeInclude(include ?? defaultInclude);
}

/**
 * Clamp a requested page size into the range the API actually honors: at least
 * 1, at most {@link MAX_PAGE_SIZE}. Returns `undefined` when no size was given
 * so the API's own default (30) applies.
 */
export function clampPageSize(pageSize?: number): number | undefined {
  if (pageSize === undefined) return undefined;
  if (!Number.isFinite(pageSize)) return undefined;
  const floored = Math.floor(pageSize);
  if (floored < 1) return 1;
  if (floored > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return floored;
}

export function applyPagination(
  params: Record<string, string>,
  options?: Pick<ListOptions, 'page' | 'pageSize'>,
) {
  if (!options) return;
  if (options.page !== undefined) {
    params['page[number]'] = String(options.page);
  }
  const pageSize = clampPageSize(options.pageSize);
  if (pageSize !== undefined) {
    params['page[size]'] = String(pageSize);
  }
}

/** Query objects that carry numeric JSON:API pagination keys. */
type PaginatedQuery = {
  'page[number]'?: number;
  'page[size]'?: number;
};

/**
 * Apply pagination to a typed list query as numbers (matching the generated
 * OpenAPI types), clamping `page[size]` to {@link MAX_PAGE_SIZE}.
 */
export function applyTypedPagination<TQuery extends PaginatedQuery>(
  query: TQuery,
  options?: Pick<ListOptions, 'page' | 'pageSize'>,
): TQuery {
  if (!options) return query;
  if (options.page !== undefined) {
    query['page[number]'] = options.page;
  }
  const pageSize = clampPageSize(options.pageSize);
  if (pageSize !== undefined) {
    query['page[size]'] = pageSize;
  }
  return query;
}

/**
 * Build the typed `/containers` list query, mapping only filters the v2 API
 * supports (`include`) and reporting the rest via `unsupportedFilters`.
 */
export function buildContainerListQuery(
  filters: ContainerListFilters,
  defaultInclude?: IncludeParamOption<ContainerInclude>,
): ListQueryResult<ContainerListQuery> {
  const query: ContainerListQuery = {};

  const includeStr = normalizeIncludeWithDefault(
    filters.include,
    defaultInclude ?? [],
  );
  if (includeStr) query.include = includeStr;

  return { query, unsupportedFilters: collectUnsupportedFilters(filters) };
}

/**
 * Build the typed `/shipments` list query. Maps the supported filters
 * (`include`, `number`, `filter[tracking_stopped]`) and reports unsupported
 * ones via `unsupportedFilters`.
 */
export function buildShipmentListQuery(
  filters: ShipmentListFilters,
  defaultInclude?: IncludeParamOption<ShipmentInclude>,
): ListQueryResult<ShipmentListQuery> {
  const query: ShipmentListQuery = {};

  const includeStr = normalizeIncludeWithDefault(
    filters.include,
    defaultInclude ?? [],
  );
  if (includeStr) query.include = includeStr;

  if (filters.number !== undefined && filters.number !== '') {
    query.number = filters.number;
  }
  if (filters.trackingStopped !== undefined) {
    query['filter[tracking_stopped]'] = filters.trackingStopped;
  }

  return { query, unsupportedFilters: collectUnsupportedFilters(filters) };
}

export function copyStringParams(
  params: Record<string, string>,
  values: Record<string, unknown>,
  ignoredKeys: readonly string[] = [],
) {
  const ignored = new Set(ignoredKeys);
  for (const [key, value] of Object.entries(values)) {
    if (ignored.has(key) || value === undefined) continue;
    if (typeof value === 'string') params[key] = value;
  }
}
