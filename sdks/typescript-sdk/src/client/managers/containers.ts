import type { Container } from '../../types/models.js';
import type {
  CallOptions,
  ContainerInclude,
  ListOptions,
} from '../../types/options.js';
import { mapContainerList, mapRoute, mapTransportEvents } from '../mappers.js';
import { BaseManager } from './base.js';

export class ContainerManager extends BaseManager {
  async get(
    id: string,
    include: ContainerInclude[] = ['shipment', 'pod_terminal'],
    options?: CallOptions,
  ): Promise<any> {
    const includeParam = include.length > 0 ? include.join(',') : undefined;
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
      include?: ContainerInclude[];
    } = {},
    options?: ListOptions,
  ): Promise<any> {
    const params: Record<string, string> = {
      include: filters.include
        ? filters.include.join(',')
        : 'shipment,pod_terminal',
    };
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
}
