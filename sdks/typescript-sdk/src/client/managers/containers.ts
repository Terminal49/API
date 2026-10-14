import type { ContainerListFilters } from '../../generated/list-filters.js';
import { serializeListQuery } from '../filter-validation.js';
import type { components, paths } from '../../generated/terminal49.js';
import type { Container } from '../../types/models.js';
import type {
  CallOptions,
  ContainerInclude,
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
import { callerPayload, type JsonBody } from '../spec.js';
import { BaseManager } from './base.js';

type ContainerUpdateAttributes = NonNullable<
  JsonBody<paths['/containers/{id}']['patch']>['data']
>['attributes'];
type CustomFieldValue = components['schemas']['custom_field_value'];
type PartyRoleData = JsonBody<
  paths['/containers/{container_id}/party_roles']['post']
>['data'];

/** Parameters for `addPartyRole`; `role` is limited to what the spec accepts on this route. */
interface AddPartyRoleParams {
  role: PartyRoleData['attributes']['role'];
  partyId: PartyRoleData['relationships']['party']['data']['id'];
}

const DEFAULT_CONTAINER_INCLUDES = [
  'shipment',
  'pod_terminal',
  'pickup_facility',
] as const satisfies readonly ContainerInclude[];

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

  /** Update container attributes such as `ref_numbers`. */
  async update(
    id: string,
    attrs: ContainerUpdateAttributes,
    options?: CallOptions,
  ): Promise<any> {
    const payload = {
      data: { type: 'container' as const, id, attributes: attrs },
    };
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/containers/{id}', {
        params: { path: { id } },
        body: payload,
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
   * @deprecated `GET /containers/{id}/route` is no longer part of the public
   * Terminal49 API and is expected to return `NotFoundError`. Use
   * {@link ContainerManager.map} for routing geometry instead.
   */
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
    { role, partyId }: AddPartyRoleParams,
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
