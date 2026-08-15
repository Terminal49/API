import type { PaginatedResult } from '../../types/models.js';
import type { ListOptions, ResponseFormat } from '../../types/options.js';
import { applyPagination } from '../query.js';
import type { Transport } from '../transport.js';

/**
 * Hard safety caps for {@link BaseManager.createIterator}. They exist so a no-op
 * or mistakenly broad filter cannot silently walk the entire dataset (and make
 * thousands of requests). They are deliberately large enough not to interfere
 * with realistic pagination, and can be raised per call via
 * `maxPages` / `maxRows` when a caller genuinely needs more.
 */
export const DEFAULT_ITERATE_MAX_PAGES = 1000;
export const DEFAULT_ITERATE_MAX_ROWS = 100_000;

/** Options accepted by {@link BaseManager.createIterator}. */
export interface IterateOptions {
  /** Records per page passed to the underlying list call. */
  pageSize?: number;
  /** Maximum number of pages to fetch. Defaults to {@link DEFAULT_ITERATE_MAX_PAGES}. */
  maxPages?: number;
  /** Maximum number of rows to yield. Defaults to {@link DEFAULT_ITERATE_MAX_ROWS}. */
  maxRows?: number;
}

export abstract class BaseManager {
  constructor(
    protected transport: Transport,
    protected defaultFormat: ResponseFormat = 'raw',
  ) {}

  protected formatResult<TDoc, TMap>(
    raw: TDoc,
    format: ResponseFormat | undefined,
    mapper?: (doc: TDoc) => TMap,
  ): TDoc | TMap | { raw: TDoc; mapped: TMap } {
    const effective = format || this.defaultFormat || 'raw';
    if (effective === 'raw') return raw;
    if (effective === 'mapped') return mapper ? mapper(raw) : (raw as any);
    if (effective === 'both')
      return mapper
        ? { raw, mapped: mapper(raw) }
        : { raw, mapped: raw as any };
    return raw;
  }

  protected mapListResult<T>(
    doc: any,
    mapper: (doc: any) => T[],
  ): PaginatedResult<T> {
    return {
      items: mapper(doc),
      links: doc?.links,
      meta: doc?.meta,
    };
  }

  protected applyPagination(
    params: Record<string, string>,
    options?: Pick<ListOptions, 'page' | 'pageSize'>,
  ) {
    applyPagination(params, options);
  }

  /**
   * Helper to create an async iterator from a list method that returns
   * `PaginatedResult`.
   *
   * The iterator is bounded by `maxPages` and `maxRows` (see
   * {@link DEFAULT_ITERATE_MAX_PAGES} / {@link DEFAULT_ITERATE_MAX_ROWS}). Once
   * either cap is reached iteration stops even if the API keeps advertising a
   * `next` link, so an empty or overly broad filter cannot walk the whole
   * dataset unbounded. Callers that genuinely need more can raise the caps.
   */
  protected async *createIterator<T>(
    listMethod: (options: {
      page?: number;
      pageSize?: number;
    }) => Promise<PaginatedResult<T> | any>,
    options?: IterateOptions,
  ): AsyncGenerator<T, void, unknown> {
    const maxPages = options?.maxPages ?? DEFAULT_ITERATE_MAX_PAGES;
    const maxRows = options?.maxRows ?? DEFAULT_ITERATE_MAX_ROWS;

    let currentPage = 1;
    let pagesFetched = 0;
    let rowsYielded = 0;

    while (pagesFetched < maxPages) {
      const result = await listMethod({
        page: currentPage,
        pageSize: options?.pageSize,
      });
      pagesFetched++;
      // If the user requested raw or both format, we might need to extract mapped.
      // Iterate is meant for mapped items.
      const paginatedResult = result.mapped ? result.mapped : result;

      if (
        !paginatedResult ||
        !Array.isArray(paginatedResult.items) ||
        paginatedResult.items.length === 0
      ) {
        break;
      }

      for (const item of paginatedResult.items) {
        if (rowsYielded >= maxRows) {
          return;
        }
        yield item;
        rowsYielded++;
      }

      if (!paginatedResult.links?.next) {
        break;
      }
      currentPage++;
    }
  }
}
