import type { CallOptions } from '../../types/options.js';
import { mapShippingLines } from '../mappers.js';
import { BaseManager } from './base.js';

export class ShippingLineManager extends BaseManager {
  async list(search?: string, options?: CallOptions): Promise<any> {
    const query = search ? { search } : undefined;
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/shipping_lines', {
        params: { query: query as any },
      }),
    );
    return this.formatResult(raw, options?.format, mapShippingLines);
  }
}
