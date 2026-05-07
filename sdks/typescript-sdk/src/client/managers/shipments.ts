import type { Shipment } from '../../types/models.js';
import type {
  CallOptions,
  IncludeParam,
  ListOptions,
  ShipmentInclude,
} from '../../types/options.js';
import { mapShipment, mapShipmentList } from '../mappers.js';
import { normalizeInclude, normalizeIncludeWithDefault } from '../query.js';
import { BaseManager } from './base.js';

const DEFAULT_SHIPMENT_INCLUDES = [
  'containers',
  'pod_terminal',
  'port_of_lading',
  'port_of_discharge',
  'destination',
  'destination_terminal',
] as const satisfies readonly ShipmentInclude[];

const SHIPMENT_INCLUDES_WITHOUT_CONTAINERS = [
  'pod_terminal',
  'port_of_lading',
  'port_of_discharge',
  'destination',
  'destination_terminal',
] as const satisfies readonly ShipmentInclude[];

export class ShipmentManager extends BaseManager {
  async get(
    id: string,
    includeContainers = true,
    options?: CallOptions & { include?: IncludeParam<ShipmentInclude> },
  ): Promise<any> {
    const includesStr = normalizeIncludeWithDefault(
      options?.include,
      includeContainers
        ? DEFAULT_SHIPMENT_INCLUDES
        : SHIPMENT_INCLUDES_WITHOUT_CONTAINERS,
    );

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/shipments/{id}', {
        params: {
          path: { id },
          query: includesStr ? ({ include: includesStr } as any) : undefined,
        },
      }),
    );
    return this.formatResult(raw, options?.format, mapShipment);
  }

  async list(
    filters: {
      status?: string;
      port?: string;
      carrier?: string;
      updatedAfter?: string;
      includeContainers?: boolean;
      include?: IncludeParam<ShipmentInclude>;
    } = {},
    options?: ListOptions,
  ): Promise<any> {
    const params: Record<string, string> = {};
    const includesStr = normalizeInclude(
      filters.include ??
        (filters.includeContainers === false
          ? SHIPMENT_INCLUDES_WITHOUT_CONTAINERS
          : DEFAULT_SHIPMENT_INCLUDES),
    );
    if (includesStr) params.include = includesStr;

    if (filters.status) params['filter[status]'] = filters.status;
    if (filters.port) params['filter[pod_locode]'] = filters.port;
    if (filters.carrier) params['filter[line_scac]'] = filters.carrier;
    if (filters.updatedAfter)
      params['filter[updated_at]'] = filters.updatedAfter;

    this.applyPagination(params, options);

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/shipments', {
        params: { query: params as any },
      }),
    );
    return this.formatResult(raw, options?.format, (doc) =>
      this.mapListResult(doc, mapShipmentList),
    );
  }

  iterate(
    filters: Parameters<ShipmentManager['list']>[0] = {},
    options?: Omit<ListOptions, 'page'>,
  ): AsyncGenerator<Shipment, void, unknown> {
    return this.createIterator<Shipment>(
      (pageOpts) =>
        this.list(filters, { ...options, ...pageOpts, format: 'mapped' }),
      options,
    );
  }

  async update(
    id: string,
    attrs: Record<string, any>,
    options?: CallOptions,
  ): Promise<any> {
    const payload = {
      data: {
        type: 'shipment' as const,
        id,
        attributes: attrs,
      },
    };

    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/shipments/{id}', {
        params: { path: { id } },
        body: payload as any,
      }),
    );

    return this.formatResult(raw, options?.format, mapShipment);
  }

  async stopTracking(id: string, options?: CallOptions): Promise<any> {
    const payload = { data: { type: 'shipment' as const, id } };
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/shipments/{id}/stop_tracking', {
        params: { path: { id } },
        body: payload as any,
      }),
    );
    return this.formatResult(raw, options?.format, mapShipment);
  }

  async resumeTracking(id: string, options?: CallOptions): Promise<any> {
    const payload = { data: { type: 'shipment' as const, id } };
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/shipments/{id}/resume_tracking', {
        params: { path: { id } },
        body: payload as any,
      }),
    );
    return this.formatResult(raw, options?.format, mapShipment);
  }
}
