import type { components } from '../../generated/terminal49.js';
import type { CallOptions } from '../../types/options.js';
import { mapShippingLines } from '../mappers.js';
import { BaseManager } from './base.js';

type ShippingLineResource = components['schemas']['shipping_line'];

function matchesSearch(line: ShippingLineResource, needle: string): boolean {
  const { scac, name, short_name, alternative_scacs } = line.attributes;
  // The backing columns for name, short_name, and alternative_scacs are nullable.
  const values: Array<string | null> = [
    scac,
    name,
    short_name,
    ...(alternative_scacs ?? []),
  ];
  return values.some((value) => value?.toLowerCase().includes(needle));
}

export class ShippingLineManager extends BaseManager {
  /**
   * List the shipping lines the account can track. The API has no search
   * parameter, so `search` filters the full list here: a case-insensitive
   * substring match on SCAC, alternative SCACs, name, and short name.
   */
  async list(search?: string, options?: CallOptions): Promise<any> {
    const doc = await this.transport.execute(() =>
      this.transport.client.GET('/shipping_lines'),
    );
    const needle = search?.trim().toLowerCase();
    const raw = needle
      ? {
          ...doc,
          data: doc.data?.filter((line: ShippingLineResource) =>
            matchesSearch(line, needle),
          ),
        }
      : doc;
    return this.formatResult(raw, options?.format, mapShippingLines);
  }

  /** Fetch a shipping line by ID. */
  async get(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/shipping_lines/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }
}
