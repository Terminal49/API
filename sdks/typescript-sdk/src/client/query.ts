import type { ListOptions } from '../types/options.js';

export type IncludeParam<TInclude extends string> =
  | readonly TInclude[]
  | string;

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

export function applyPagination(
  params: Record<string, string>,
  options?: Pick<ListOptions, 'page' | 'pageSize'>,
) {
  if (!options) return;
  if (options.page !== undefined) {
    params['page[number]'] = String(options.page);
  }
  if (options.pageSize !== undefined) {
    params['page[size]'] = String(options.pageSize);
  }
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
