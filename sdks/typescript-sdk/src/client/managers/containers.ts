import type { Container } from '../../types/models.js';
import type {
  CallOptions,
  ContainerInclude,
  IncludeParam,
  ListOptions,
} from '../../types/options.js';
import { mapContainerList, mapRoute, mapTransportEvents } from '../mappers.js';
import { normalizeInclude, normalizeIncludeWithDefault } from '../query.js';
import { BaseManager } from './base.js';

export class ContainerManager extends BaseManager {
  async get(
    id: string,
    include: IncludeParam<ContainerInclude> = ['shipment', 'pod_terminal'],
    options?: CallOptions,
  ): Promise<any> {
    const includeParam = normalizeInclude(include);
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/{id}', {
        params: {
          path: { id },
          query: includeParam ? ({ include: includeParam } as any) : undefined,
        },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  async list(
    filters: {
      status?: string;
      port?: string;
      carrier?: string;
      updatedAfter?: string;
      include?: IncludeParam<ContainerInclude>;
    } = {},
    options?: ListOptions,
  ): Promise<any> {
    const includeParam = normalizeIncludeWithDefault(filters.include, [
      'shipment',
      'pod_terminal',
    ]);
    const params: Record<string, string> = {};
    if (includeParam) params.include = includeParam;
    if (filters.status) params['filter[status]'] = filters.status;
    if (filters.port) params['filter[pod_locode]'] = filters.port;
    if (filters.carrier) params['filter[line_scac]'] = filters.carrier;
    if (filters.updatedAfter)
      params['filter[updated_at]'] = filters.updatedAfter;

    this.applyPagination(params, options);

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers', {
        params: { query: params as any },
      }),
    );
    return this.formatResult(raw, options?.format, (doc) =>
      this.mapListResult(doc, mapContainerList),
    );
  }

  iterate(
    filters: Parameters<ContainerManager['list']>[0] = {},
    options?: Omit<ListOptions, 'page'>,
  ): AsyncGenerator<Container, void, unknown> {
    return this.createIterator<Container>(
      (pageOpts) =>
        this.list(filters, { ...options, ...pageOpts, format: 'mapped' }),
      options,
    );
  }

  async events(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/{id}/transport_events', {
        params: {
          path: { id },
          query: { include: 'location,terminal' },
        },
      }),
    );
    return this.formatResult(raw, options?.format, mapTransportEvents);
  }

  async route(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/{id}/route', {
        params: {
          path: { id },
          query: { include: 'port,vessel,route_location' } as any,
        },
      }),
    );
    return this.formatResult(raw, options?.format, mapRoute);
  }

  async map(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/{id}/map_geojson', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  async customFields(id: string, options?: CallOptions): Promise<any> {
    const encodedId = encodeURIComponent(id);
    const raw = await this.transport.executeManual(
      `${this.transport.baseUrl}/containers/${encodedId}/custom_fields`,
    );
    return this.formatResult(raw, options?.format);
  }

  async setCustomField(
    id: string,
    fieldId: string,
    value: unknown,
    options?: CallOptions,
  ): Promise<any> {
    const encodedId = encodeURIComponent(id);
    const payload = {
      data: {
        type: 'custom_field',
        id: fieldId,
        value,
      },
    };
    const raw = await this.transport.executeManual(
      `${this.transport.baseUrl}/containers/${encodedId}/custom_fields`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return this.formatResult(raw, options?.format);
  }

  async rawEvents(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/{id}/raw_events', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  async refresh(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/containers/{id}/refresh', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  async demurrage(id: string): Promise<any> {
    const data = await this.get(id, ['pod_terminal']);
    const container = data.data?.attributes || {};
    return {
      container_id: id,
      pickup_lfd: container.pickup_lfd,
      pickup_appointment_at: container.pickup_appointment_at,
      available_for_pickup: container.available_for_pickup,
      fees_at_pod_terminal: container.fees_at_pod_terminal,
      holds_at_pod_terminal: container.holds_at_pod_terminal,
      pod_arrived_at: container.pod_arrived_at,
      pod_discharged_at: container.pod_discharged_at,
    };
  }
}
