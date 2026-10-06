import { buildFilterQuery } from './filter-validation.js';
import type {
  ContainerListFilters,
  ShipmentListFilters,
} from '../generated/list-filters.js';
export type {
  ContainerListFilters,
  ShipmentListFilters,
} from '../generated/list-filters.js';
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
 * Conservative SDK page-size cap for shipment lists and legacy generic managers.
 * Container lists use the separately verified maximum of 50.
 */
export const MAX_PAGE_SIZE = 100;
/** Maximum enforced by GET /containers. */
export const MAX_CONTAINER_PAGE_SIZE = 50;

/** Typed query objects for the JSON:API list endpoints, sourced from the generated OpenAPI spec. */
type ContainerListQuery = NonNullable<
  paths['/containers']['get']['parameters']['query']
>;
type ShipmentListQuery = NonNullable<
  paths['/shipments']['get']['parameters']['query']
>;

/** The validated API query and an empty compatibility diagnostic. Invalid filters throw before I/O. */
export interface ListQueryResult<TQuery> {
  query: TQuery;
  unsupportedFilters: string[];
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
  maxPageSize = MAX_PAGE_SIZE,
): TQuery {
  if (!options) return query;
  if (options.page !== undefined) {
    query['page[number]'] = options.page;
  }
  const pageSize = clampPageSize(options.pageSize);
  if (pageSize !== undefined) {
    query['page[size]'] = Math.min(pageSize, maxPageSize);
  }
  return query;
}

/** Build validated container filter parameters. */
export function buildContainerListQuery(
  filters: ContainerListFilters,
  defaultInclude?: IncludeParamOption<ContainerInclude>,
): ListQueryResult<ContainerListQuery> {
  const query = buildFilterQuery('container', filters);
  const include = normalizeIncludeWithDefault(
    filters.include,
    defaultInclude ?? [],
  );
  if (include) query.include = include;
  return { query: query as ContainerListQuery, unsupportedFilters: [] };
}

/** Build validated shipment filter parameters. */
export function buildShipmentListQuery(
  filters: ShipmentListFilters,
  defaultInclude?: IncludeParamOption<ShipmentInclude>,
): ListQueryResult<ShipmentListQuery> {
  const query = buildFilterQuery('shipment', filters);
  const include = normalizeIncludeWithDefault(
    filters.include,
    defaultInclude ?? [],
  );
  if (include) query.include = include;
  return { query: query as ShipmentListQuery, unsupportedFilters: [] };
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
