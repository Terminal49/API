import type { paths } from '../../generated/terminal49.js';
import { UpstreamError } from '../errors.js';
import type { ContainerListFilters } from '../../generated/list-filters.js';
import { serializeListQuery } from '../filter-validation.js';
import type { Container } from '../../types/models.js';
import type {
  CallOptions,
  ContainerInclude,
  ContainerSummaryGroupBy,
  IncludeParam,
  ListOptions,
} from '../../types/options.js';
import {
  mapContainerList,
  mapCustomFields,
  mapRoute,
  mapTransportEvents,
} from '../mappers.js';
import {
  applyTypedPagination,
  buildContainerListQuery,
  MAX_CONTAINER_PAGE_SIZE,
  normalizeInclude,
} from '../query.js';
import { BaseManager } from './base.js';

const DEFAULT_CONTAINER_INCLUDES = [
  'shipment',
  'pod_terminal',
  'pickup_facility',
] as const satisfies readonly ContainerInclude[];

type SummaryResponse =
  paths['/containers/summary']['get']['responses'][200]['content']['application/json'];

function parseSummaryResponse(
  value: unknown,
  groupBy: ContainerSummaryGroupBy,
): SummaryResponse {
  const invalid = () =>
    new UpstreamError('Invalid container summary response', 502);
  if (!value || typeof value !== 'object') throw invalid();
  // SAFETY: treat the response as a partial shape only; every required field is checked below.
  const doc = value as Partial<SummaryResponse>;
  if (
    !Array.isArray(doc.data) ||
    !doc.meta ||
    !Number.isSafeInteger(doc.meta.total) ||
    doc.meta.total < 0 ||
    doc.meta.group_by !== groupBy ||
    typeof doc.meta.truncated !== 'boolean'
  )
    throw invalid();
  const keys = new Set<string | null>();
  let counted = 0;
  for (const group of doc.data) {
    if (
      !group ||
      typeof group !== 'object' ||
      !(group.key === null || typeof group.key === 'string') ||
      !(group.label === null || typeof group.label === 'string') ||
      !Number.isSafeInteger(group.count) ||
      group.count < 0 ||
      keys.has(group.key)
    )
      throw invalid();
    keys.add(group.key);
    counted += group.count;
  }
  if (
    !Number.isSafeInteger(counted) ||
    counted > doc.meta.total ||
    (!doc.meta.truncated && counted !== doc.meta.total)
  )
    throw invalid();
  // SAFETY: the checks above establish all required response fields and their count invariants.
  return doc as SummaryResponse;
}

export class ContainerManager extends BaseManager {
  async get(
    id: string,
    include: IncludeParam<ContainerInclude> = [
      'shipment',
      'pod_terminal',
      'pickup_facility',
    ],
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

  async customFields(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.executeManual(
      `${this.transport.baseUrl}/containers/${encodeURIComponent(id)}/custom_fields?include=definition`,
    );
    return this.formatResult(raw, options?.format, mapCustomFields);
  }

  async list(
    filters: ContainerListFilters = {},
    options?: ListOptions,
  ): Promise<any> {
    const { query, unsupportedFilters } = buildContainerListQuery(
      filters,
      DEFAULT_CONTAINER_INCLUDES,
    );
    applyTypedPagination(query, options, MAX_CONTAINER_PAGE_SIZE);

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers', {
        params: { query },
        querySerializer: serializeListQuery,
      }),
    );
    return this.formatResult(raw, options?.format, (doc) => ({
      ...this.mapListResult(doc, mapContainerList),
      unsupportedFilters,
    }));
  }

  /**
   * Count the containers `list` would return for the same filters, grouped by
   * one dimension, in one request (`GET /containers/summary`).
   */
  async summary(
    groupBy: ContainerSummaryGroupBy,
    filters: ContainerListFilters = {},
    options?: CallOptions,
  ): Promise<any> {
    const { query } = buildContainerListQuery(filters);
    delete (query as Record<string, unknown>).include;
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/summary', {
        params: { query: { ...query, group_by: groupBy } },
        querySerializer: serializeListQuery,
      }),
    );
    const summary = parseSummaryResponse(raw, groupBy);
    return this.formatResult(summary, options?.format, (doc) => ({
      groups: doc.data,
      total: doc.meta.total,
      groupBy: doc.meta.group_by,
      truncated: doc.meta.truncated,
    }));
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
    // The route path is absent from current OpenAPI, although this SDK already
    // supports it. Keep the existing client/middleware path while regenerating
    // types from the actual source, rather than hand-editing generated types.
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/{id}/route' as any, {
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
        attributes: {
          api_slug: fieldId,
          value,
        },
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
    const data = await this.get(id, ['pod_terminal'], { format: 'raw' });
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
