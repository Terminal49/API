import type {
  PaginatedResult,
  ResponseFormat,
} from '../../types/options.js';
import type { Transport } from '../transport.js';

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
    options?: { page?: number; pageSize?: number },
  ) {
    if (!options) return;
    if (options.page !== undefined)
      params['page[number]'] = String(options.page);
    if (options.pageSize !== undefined)
      params['page[size]'] = String(options.pageSize);
  }
}
