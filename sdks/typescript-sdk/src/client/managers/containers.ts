import { UpstreamError } from '../errors.js';
import type { ContainerListFilters } from '../../generated/list-filters.js';
import { serializeListQuery } from '../filter-validation.js';
import type { paths } from '../../generated/terminal49.js';
import type { Container, CustomFieldValue } from '../../types/models.js';
import type {
  CallOptions,
  ContainerInclude,
  ContainerSummaryGroupBy,
  IncludeParam,
  ListOptions,
} from '../../types/options.js';
import {
  mapContainerList,
  mapContainerRoute,
  mapCustomFields,
  mapTransportEvents,
} from '../mappers.js';
import {
  applyTypedPagination,
  buildContainerListQuery,
  MAX_CONTAINER_PAGE_SIZE,
  normalizeInclude,
} from '../query.js';
import { callerPayload, type JsonBody } from '../spec.js';
import { BaseManager } from './base.js';

/** Writable container attributes for `update`. */
export type ContainerUpdateAttributes = NonNullable<
  JsonBody<paths['/containers/{id}']['patch']>['data']
>['attributes'];
type PartyRoleData = JsonBody<
  paths['/containers/{container_id}/party_roles']['post']
>['data'];

/** Parameters for `addPartyRole`; `role` is limited to what the spec accepts on this route. */
export interface ContainerAddPartyRoleParams {
  role: PartyRoleData['attributes']['role'];
  partyId: PartyRoleData['relationships']['party']['data']['id'];
}

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
  // hold_type counts each hold, so a container with two holds counts twice and
  // the groups can add up to more than the total.
  const perContainer = groupBy !== 'hold_type';
  if (
    !Number.isSafeInteger(counted) ||
    (perContainer && counted > doc.meta.total) ||
    (!doc.meta.truncated &&
      (perContainer ? counted !== doc.meta.total : counted < doc.meta.total))
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

  /** Update a container's `ref_numbers`, `seal_number`, equipment type, length, and height, or `weight_in_lbs`. */
  async update(
    id: string,
    attrs: ContainerUpdateAttributes,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/containers/{id}', {
        params: { path: { id } },
        body: { data: { type: 'container', id, attributes: attrs } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  async customFields(id: string, options?: CallOptions): Promise<any> {
    // The spec omits include=definition, but mapCustomFields reads the included definitions.
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

  /**
   * Fetch the container's route: ports, the current vessel, and vessel tracks.
   * The raw format is the GeoJSON FeatureCollection; the mapped format is a
   * `ContainerRoute`. Requires the Routing Data feature, otherwise the API
   * returns 403.
   */
  async route(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/{id}/map_geojson', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format, mapContainerRoute);
  }

  /**
   * @deprecated Use {@link ContainerManager.route}. Returns the GeoJSON
   * FeatureCollection unmapped: `raw` and `mapped` return it as is, and
   * `both` returns `{ raw, mapped }` with the FeatureCollection in each half.
   */
  async map(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.route(id, { format: 'raw' });
    return this.formatResult(raw, options?.format);
  }

  /** Create a custom field value on a container. */
  async setCustomField(
    id: string,
    apiSlug: string,
    value: unknown,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/containers/{container_id}/custom_fields', {
        params: { path: { container_id: id } },
        body: {
          data: {
            type: 'custom_field',
            attributes: {
              api_slug: apiSlug,
              value: callerPayload<CustomFieldValue>(value),
            },
          },
        },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Update an existing custom field value on a container. */
  async updateCustomField(
    id: string,
    apiSlug: string,
    value: CustomFieldValue,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH(
        '/containers/{container_id}/custom_fields/{api_slug}',
        {
          params: { path: { container_id: id, api_slug: apiSlug } },
          body: { data: { type: 'custom_field', attributes: { value } } },
        },
      ),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Remove a custom field value from a container. */
  async deleteCustomField(
    id: string,
    apiSlug: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.DELETE(
        '/containers/{container_id}/custom_fields/{api_slug}',
        {
          params: { path: { container_id: id, api_slug: apiSlug } },
        },
      ),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List the party roles assigned to a container. */
  async partyRoles(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/containers/{container_id}/party_roles', {
        params: { path: { container_id: id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Assign a party to a container in the given role. */
  async addPartyRole(
    id: string,
    { role, partyId }: ContainerAddPartyRoleParams,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/containers/{container_id}/party_roles', {
        params: { path: { container_id: id } },
        body: {
          data: {
            type: 'party_role',
            attributes: { role },
            relationships: { party: { data: { type: 'party', id: partyId } } },
          },
        },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Remove a party role assignment from a container. */
  async removePartyRole(
    id: string,
    partyRoleId: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.DELETE(
        '/containers/{container_id}/party_roles/{id}',
        {
          params: { path: { container_id: id, id: partyRoleId } },
        },
      ),
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
