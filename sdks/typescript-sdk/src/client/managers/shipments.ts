import type { ShipmentListFilters } from '../../generated/list-filters.js';
import { serializeListQuery } from '../filter-validation.js';
import type { Shipment } from '../../types/models.js';
import type {
  CallOptions,
  IncludeParam,
  ListOptions,
  ShipmentInclude,
} from '../../types/options.js';
import { mapCustomFields, mapShipment, mapShipmentList } from '../mappers.js';
import {
  applyTypedPagination,
  buildShipmentListQuery,
  normalizeIncludeWithDefault,
} from '../query.js';
import { BaseManager } from './base.js';
import {
  addPartyRole,
  clearCustomField,
  listPartyRoles,
  mapPartyRoles,
  removePartyRole,
} from './record-writes.js';

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

  async customFields(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.executeManual(
      `${this.transport.baseUrl}/shipments/${encodeURIComponent(id)}/custom_fields?include=definition`,
    );
    return this.formatResult(raw, options?.format, mapCustomFields);
  }

  async list(
    filters: ShipmentListFilters = {},
    options?: ListOptions,
  ): Promise<any> {
    const defaultInclude =
      filters?.includeContainers === false
        ? SHIPMENT_INCLUDES_WITHOUT_CONTAINERS
        : DEFAULT_SHIPMENT_INCLUDES;
    const { query, unsupportedFilters } = buildShipmentListQuery(
      filters,
      defaultInclude,
    );
    applyTypedPagination(query, options);

    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/shipments', {
        params: { query },
        querySerializer: serializeListQuery,
      }),
    );
    return this.formatResult(raw, options?.format, (doc) => ({
      ...this.mapListResult(doc, mapShipmentList),
      unsupportedFilters,
    }));
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
      `${this.transport.baseUrl}/shipments/${encodedId}/custom_fields`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      },
    );
    return this.formatResult(raw, options?.format);
  }

  /** Lists the parties attached to the shipment by role. */
  async partyRoles(id: string, options?: CallOptions): Promise<any> {
    const raw = await listPartyRoles(this.transport, 'shipments', id);
    return this.formatResult(raw, options?.format, mapPartyRoles);
  }

  /** Attaches a party to the shipment in a role. */
  async addPartyRole(
    id: string,
    role: string,
    partyId: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await addPartyRole(
      this.transport,
      'shipments',
      id,
      role,
      partyId,
    );
    return this.formatResult(raw, options?.format, mapPartyRoles);
  }

  /** Detaches a party role from the shipment; the party itself is kept. */
  async removePartyRole(
    id: string,
    partyRoleId: string,
    options?: CallOptions,
  ): Promise<any> {
    return this.formatResult(
      await removePartyRole(this.transport, 'shipments', id, partyRoleId),
      options?.format,
    );
  }

  /** Removes a custom field value from the shipment. */
  async clearCustomField(
    id: string,
    apiSlug: string,
    options?: CallOptions,
  ): Promise<any> {
    return this.formatResult(
      await clearCustomField(this.transport, 'shipments', id, apiSlug),
      options?.format,
    );
  }
}
