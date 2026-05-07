import type { PaginatedResult, Shipment } from '../../types/models.js';
import type { CallOptions, ListOptions } from '../../types/options.js';
import { mapShipment, mapShipmentList } from '../mappers.js';
import { BaseManager } from './base.js';

export class ShipmentManager extends BaseManager {
  async get(
    id: string,
    includeContainers = true,
    options?: CallOptions,
  ): Promise<any> {
    const includes = includeContainers
      ? 'containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal'
      : 'pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal';

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/shipments/{id}', {
        params: {
          path: { id },
          query: { include: includes } as any,
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
    } = {},
    options?: ListOptions,
  ): Promise<any> {
    const params: Record<string, string> = {
      include:
        'containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal',
    };

    if (filters.status) params['filter[status]'] = filters.status;
    if (filters.port) params['filter[pod_locode]'] = filters.port;
    if (filters.carrier) params['filter[line_scac]'] = filters.carrier;
    if (filters.updatedAfter)
      params['filter[updated_at]'] = filters.updatedAfter;

    if (filters.includeContainers === false) {
      params.include =
        'pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal';
    }

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
