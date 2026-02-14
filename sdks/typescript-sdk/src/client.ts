import { Jsona } from 'jsona';
import createClient, { type FetchResponse } from 'openapi-fetch';
import {
  AuthenticationError,
  AuthorizationError,
  extractErrorMessage,
  FeatureNotEnabledError,
  NotFoundError,
  RateLimitError,
  Terminal49Error,
  toTerminal49Error,
  UpstreamError,
  ValidationError,
} from './client/errors.js';
import {
  mapContainerList,
  mapRoute,
  mapShipment,
  mapShipmentList,
  mapShippingLines,
  mapTrackingRequest,
  mapTrackingRequestList,
  mapTransportEvents,
} from './client/mappers.js';
import type { paths } from './generated/terminal49.js';
import type {
  Container,
  PaginatedResult,
  Shipment,
  TrackingRequest,
} from './types/models.js';
import type {
  CallOptions,
  ListOptions,
  ResponseFormat,
} from './types/options.js';

/**
 * Terminal49 API Client
 * Typed wrapper around Terminal49's JSON:API using openapi-fetch + openapi-typescript.
 * Can be used standalone or plugged into the MCP tools.
 */

export {
  AuthenticationError,
  AuthorizationError,
  FeatureNotEnabledError,
  NotFoundError,
  RateLimitError,
  Terminal49Error,
  UpstreamError,
  ValidationError,
};

export interface Terminal49ClientConfig {
  apiToken: string;
  apiBaseUrl?: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  defaultFormat?: ResponseFormat;
}

export type TrackingRequestType =
  | 'container'
  | 'bill_of_lading'
  | 'booking_number';

type Client = ReturnType<typeof createClient<paths>>;

type FormattedResult<TDoc, TMapped> =
  | TDoc
  | TMapped
  | { raw: TDoc; mapped: TMapped };

export interface CreateTrackingRequestFromInferOptions {
  scac?: string;
  numberType?: string;
  refNumbers?: string[];
  shipmentTags?: string[];
}

function normalizeBaseUrl(input?: string): string {
  const defaultBase = 'https://api.terminal49.com/v2';
  if (!input) return defaultBase;
  try {
    const url = new URL(input);
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '' || path === '/') {
      url.pathname = '/v2';
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return input;
  }
}

export class Terminal49Client {
  private apiToken: string;
  private apiBaseUrl: string;
  private maxRetries: number;
  private client: Client;
  private jsona: Jsona;
  private defaultFormat: ResponseFormat;
  private authedFetch: typeof fetch;

  constructor(config: Terminal49ClientConfig) {
    if (!config.apiToken) {
      throw new AuthenticationError('API token is required');
    }

    this.apiToken = config.apiToken;
    this.apiBaseUrl = normalizeBaseUrl(config.apiBaseUrl);
    this.maxRetries = config.maxRetries ?? 2;
    this.defaultFormat = config.defaultFormat ?? 'raw';
    this.authedFetch = this.buildFetch(config.fetchImpl ?? fetch);
    this.client = createClient<paths>({
      baseUrl: this.apiBaseUrl,
      fetch: this.authedFetch,
    });
    this.jsona = new Jsona();
  }

  /**
   * Deserialize a JSON:API document into plain objects.
   * Useful when you want a simplified shape instead of JSON:API.
   */
  deserialize<T>(document: unknown): T {
    return this.jsona.deserialize(document as any) as T;
  }

  // ========= Resource namespaces =========

  public shipments = {
    get: (id: string, includeContainers = true, options?: CallOptions) =>
      this.getShipment(id, includeContainers, options),
    list: (
      filters: {
        status?: string;
        port?: string;
        carrier?: string;
        updatedAfter?: string;
        includeContainers?: boolean;
      } = {},
      options?: ListOptions,
    ) => this.listShipments(filters, options),
    update: (id: string, attrs: Record<string, any>, options?: CallOptions) =>
      this.updateShipment(id, attrs, options),
    stopTracking: (id: string, options?: CallOptions) =>
      this.stopTrackingShipment(id, options),
    resumeTracking: (id: string, options?: CallOptions) =>
      this.resumeTrackingShipment(id, options),
  };

  public containers = {
    get: (id: string, include?: string[], options?: CallOptions) =>
      this.getContainer(id, include, options),
    list: (
      filters: {
        status?: string;
        port?: string;
        carrier?: string;
        updatedAfter?: string;
        include?: string;
      } = {},
      options?: ListOptions,
    ) => this.listContainers(filters, options),
    events: (id: string, options?: CallOptions) =>
      this.getContainerTransportEvents(id, options),
    route: (id: string, options?: CallOptions) =>
      this.getContainerRoute(id, options),
    rawEvents: (id: string, options?: CallOptions) =>
      this.getContainerRawEvents(id, options),
    refresh: (id: string, options?: CallOptions) =>
      this.refreshContainer(id, options),
  };

  public shippingLines = {
    list: (search?: string, options?: CallOptions) =>
      this.listShippingLines(search, options),
  };

  public trackingRequests = {
    list: (filters: Record<string, string> = {}, options?: ListOptions) =>
      this.listTrackingRequests(filters, options),
    get: (id: string, options?: CallOptions) =>
      this.getTrackingRequest(id, options),
    update: (id: string, attrs: Record<string, any>, options?: CallOptions) =>
      this.updateTrackingRequest(id, attrs, options),
    create: (params: {
      requestType: TrackingRequestType;
      requestNumber: string;
      scac?: string;
      refNumbers?: string[];
      shipmentTags?: string[];
    }) => this.createTrackingRequest(params),
    inferNumber: (number: string) => this.inferTrackingNumber(number),
    createFromInfer: (
      number: string,
      options?: CreateTrackingRequestFromInferOptions,
    ) => this.createTrackingRequestFromInfer(number, options),
  };

  // ========= API methods =========

  async search(query: string): Promise<any> {
    const params = new URLSearchParams({ query });
    return this.executeManual(`${this.apiBaseUrl}/search?${params.toString()}`);
  }

  async getContainer(
    id: string,
    include: string[] = ['shipment', 'pod_terminal'],
    options?: CallOptions,
  ): Promise<any> {
    const includeParam = include.length > 0 ? include.join(',') : undefined;
    const raw = await this.execute(() =>
      this.client.GET('/containers/{id}', {
        params: {
          path: { id },
          query: includeParam ? ({ include: includeParam } as any) : undefined,
        },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  async trackContainer(params: {
    containerNumber?: string;
    bookingNumber?: string;
    scac?: string;
    refNumbers?: string[];
  }): Promise<any> {
    const requestType: TrackingRequestType = params.containerNumber
      ? 'container'
      : 'bill_of_lading';
    const requestNumber = params.containerNumber || params.bookingNumber;

    const missingRequestMessage =
      'request_number is required (/data/attributes/request_number)';
    if (!requestNumber) {
      throw new ValidationError(missingRequestMessage);
    }

    return this.createTrackingRequest({
      requestType,
      requestNumber,
      scac: params.scac,
      refNumbers: params.refNumbers,
    });
  }

  async createTrackingRequest(params: {
    requestType: TrackingRequestType;
    requestNumber: string;
    scac?: string;
    refNumbers?: string[];
    shipmentTags?: string[];
  }): Promise<any> {
    if (!params.requestNumber) {
      throw new ValidationError(
        'request_number is required (/data/attributes/request_number)',
      );
    }
    if (!params.requestType) {
      throw new ValidationError(
        'request_type is required (/data/attributes/request_type)',
      );
    }

    const payload = {
      data: {
        type: 'tracking_request' as const,
        attributes: {
          request_type: params.requestType,
          request_number: params.requestNumber,
          scac: params.scac ?? '',
          ref_numbers: params.refNumbers,
          shipment_tags: params.shipmentTags,
        },
      },
    };

    return this.execute(() =>
      this.client.POST('/tracking_requests', {
        body: payload as any,
      }),
    );
  }

  async inferTrackingNumber(number: string): Promise<any> {
    if (!number || number.trim() === '') {
      throw new ValidationError('number is required (/data/attributes/number)');
    }

    return this.execute(() =>
      this.client.POST('/tracking_requests/infer_number', {
        body: { number } as any,
      }),
    );
  }

  async createTrackingRequestFromInfer(
    number: string,
    options: CreateTrackingRequestFromInferOptions = {},
  ): Promise<{ infer: any; trackingRequest: any }> {
    const infer = await this.inferTrackingNumber(number);
    const attrs = infer?.data?.attributes || {};
    const numberType = this.normalizeInferNumberType(
      attrs.number_type || options.numberType,
    );
    const shippingLine = attrs.shipping_line || {};
    const selected = shippingLine.selected || null;
    const candidates = Array.isArray(shippingLine.candidates)
      ? shippingLine.candidates
      : [];

    const scac =
      options.scac ||
      selected?.scac ||
      (candidates.length === 1 ? candidates[0]?.scac : undefined);

    if (!numberType) {
      throw new ValidationError(
        'Unable to infer tracking number type. Provide numberType to override.',
      );
    }

    if (!scac) {
      throw new ValidationError(
        'Unable to infer carrier SCAC. Provide scac or use infer candidates to select a carrier.',
      );
    }

    const trackingRequest = await this.createTrackingRequest({
      requestType: numberType,
      requestNumber: number,
      scac,
      refNumbers: options.refNumbers,
      shipmentTags: options.shipmentTags,
    });

    return { infer, trackingRequest };
  }

  async getShipment(
    id: string,
    includeContainers = true,
    options?: CallOptions,
  ): Promise<any> {
    const includes = includeContainers
      ? 'containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal'
      : 'pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal';

    const raw = await this.execute(() =>
      this.client.GET('/shipments/{id}', {
        params: {
          path: { id },
          query: { include: includes } as any,
        },
      }),
    );
    return this.formatResult(raw, options?.format, mapShipment);
  }

  async listShipments(
    filters: {
      status?: string;
      port?: string;
      carrier?: string;
      updatedAfter?: string;
      includeContainers?: boolean;
    } = {},
    options?: ListOptions,
  ): Promise<FormattedResult<any, PaginatedResult<Shipment>>> {
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

    const raw = await this.execute(() =>
      this.client.GET('/shipments', {
        params: { query: params as any },
      }),
    );
    return this.formatResult(raw, options?.format, (doc) =>
      this.mapListResult(doc, mapShipmentList),
    );
  }

  async updateShipment(
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

    const raw = await this.execute(() =>
      this.client.PATCH('/shipments/{id}', {
        params: { path: { id } },
        body: payload as any,
      }),
    );

    return this.formatResult(raw, options?.format, mapShipment);
  }

  async stopTrackingShipment(id: string, options?: CallOptions): Promise<any> {
    const payload = { data: { type: 'shipment' as const, id } };
    const raw = await this.execute(() =>
      this.client.PATCH('/shipments/{id}/stop_tracking', {
        params: { path: { id } },
        body: payload as any,
      }),
    );
    return this.formatResult(raw, options?.format, mapShipment);
  }

  async resumeTrackingShipment(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    const payload = { data: { type: 'shipment' as const, id } };
    const raw = await this.execute(() =>
      this.client.PATCH('/shipments/{id}/resume_tracking', {
        params: { path: { id } },
        body: payload as any,
      }),
    );
    return this.formatResult(raw, options?.format, mapShipment);
  }

  async getDemurrage(containerId: string): Promise<any> {
    const data = await this.getContainer(containerId, ['pod_terminal']);
    const container = data.data?.attributes || {};
    return {
      container_id: containerId,
      pickup_lfd: container.pickup_lfd,
      pickup_appointment_at: container.pickup_appointment_at,
      available_for_pickup: container.available_for_pickup,
      fees_at_pod_terminal: container.fees_at_pod_terminal,
      holds_at_pod_terminal: container.holds_at_pod_terminal,
      pod_arrived_at: container.pod_arrived_at,
      pod_discharged_at: container.pod_discharged_at,
    };
  }

  async getContainerTransportEvents(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.execute(() =>
      this.client.GET('/containers/{id}/transport_events', {
        params: {
          path: { id },
          query: { include: 'location,terminal' },
        },
      }),
    );
    return this.formatResult(raw, options?.format, mapTransportEvents);
  }

  async getContainerRoute(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.GET('/containers/{id}/route', {
        params: {
          path: { id },
          query: { include: 'port,vessel,route_location' } as any,
        },
      }),
    );
    return this.formatResult(raw, options?.format, mapRoute);
  }

  async listShippingLines(
    search?: string,
    options?: CallOptions,
  ): Promise<any> {
    const query = search ? { search } : undefined;
    const raw = await this.execute(() =>
      this.client.GET('/shipping_lines', {
        params: { query: query as any },
      }),
    );
    return this.formatResult(raw, options?.format, mapShippingLines);
  }

  async getRailMilestones(containerId: string): Promise<any> {
    const data = await this.getContainer(containerId, ['transport_events']);
    const container = data.data?.attributes || {};
    const included = data.included || [];

    const railEvents = included
      .filter((item: any) => item.type === 'transport_event')
      .filter((item: any) => item.attributes?.event?.startsWith('rail.'))
      .map((item: any) => item.attributes);

    return {
      container_id: containerId,
      pod_rail_carrier_scac: container.pod_rail_carrier_scac,
      ind_rail_carrier_scac: container.ind_rail_carrier_scac,
      pod_rail_loaded_at: container.pod_rail_loaded_at,
      pod_rail_departed_at: container.pod_rail_departed_at,
      ind_rail_arrived_at: container.ind_rail_arrived_at,
      ind_rail_unloaded_at: container.ind_rail_unloaded_at,
      ind_eta_at: container.ind_eta_at,
      ind_ata_at: container.ind_ata_at,
      rail_events: railEvents,
    };
  }

  async listContainers(
    filters: {
      status?: string;
      port?: string;
      carrier?: string;
      updatedAfter?: string;
      include?: string;
    } = {},
    options?: ListOptions,
  ): Promise<FormattedResult<any, PaginatedResult<Container>>> {
    const params: Record<string, string> = {
      include: filters.include || 'shipment,pod_terminal',
    };
    if (filters.status) params['filter[status]'] = filters.status;
    if (filters.port) params['filter[pod_locode]'] = filters.port;
    if (filters.carrier) params['filter[line_scac]'] = filters.carrier;
    if (filters.updatedAfter)
      params['filter[updated_at]'] = filters.updatedAfter;

    this.applyPagination(params, options);

    const raw = await this.execute(() =>
      this.client.GET('/containers', {
        params: { query: params as any },
      }),
    );
    return this.formatResult(raw, options?.format, (doc) =>
      this.mapListResult(doc, mapContainerList),
    );
  }

  async getContainerRawEvents(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.GET('/containers/{id}/raw_events', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  async refreshContainer(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.PATCH('/containers/{id}/refresh', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  async listTrackingRequests(
    filters: Record<string, string> = {},
    options?: ListOptions,
  ): Promise<FormattedResult<any, PaginatedResult<TrackingRequest>>> {
    const params: Record<string, string> = { ...filters };
    this.applyPagination(params, options);

    const raw = await this.execute(() =>
      this.client.GET('/tracking_requests', {
        params: { query: params as any },
      }),
    );
    return this.formatResult(raw, options?.format, (doc) =>
      this.mapListResult(doc, mapTrackingRequestList),
    );
  }

  async listTrackRequests(
    filters: Record<string, string> = {},
    options?: ListOptions,
  ): Promise<FormattedResult<any, PaginatedResult<TrackingRequest>>> {
    return this.listTrackingRequests(filters, options);
  }

  async getTrackingRequest(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.GET('/tracking_requests/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format, mapTrackingRequest);
  }

  async updateTrackingRequest(
    id: string,
    attrs: Record<string, any>,
    options?: CallOptions,
  ): Promise<any> {
    const payload = {
      data: {
        type: 'tracking_request' as const,
        id,
        attributes: attrs,
      },
    };

    const raw = await this.execute(() =>
      this.client.PATCH('/tracking_requests/{id}', {
        params: { path: { id } },
        body: payload as any,
      }),
    );

    return this.formatResult(raw, options?.format, mapTrackingRequest);
  }

  // ========= internal helpers =========

  private buildFetch(fetchImpl: typeof fetch) {
    return async (
      input: Request | URL | string,
      init?: RequestInit,
    ): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const authHeader = this.apiToken.startsWith('Token ')
        ? this.apiToken
        : `Token ${this.apiToken}`;
      headers.set('Authorization', authHeader);
      headers.set('Accept', 'application/json');
      if (init?.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      return fetchImpl(input, { ...init, headers });
    };
  }

  private async execute<T = any>(
    fn: () => Promise<FetchResponse<any, any, any>>,
  ): Promise<T> {
    return this.executeWithRetry(fn, 0);
  }

  private async executeWithRetry<T = any>(
    fn: () => Promise<FetchResponse<any, any, any>>,
    attempt: number,
  ): Promise<T> {
    const { data, error, response } = await fn();

    if (data !== undefined && response?.ok !== false) {
      return data as T;
    }

    const status = response?.status ?? 500;

    if ((status === 429 || status >= 500) && attempt < this.maxRetries) {
      const delay = 2 ** attempt * 500;
      await this.sleep(delay);
      return this.executeWithRetry(fn, attempt + 1);
    }

    const errorBody = error ?? (await this.safeParse(response));
    throw toTerminal49Error(status, extractErrorMessage(errorBody), errorBody);
  }

  private async executeManual<T = any>(
    input: Request | URL | string,
    init?: RequestInit,
  ): Promise<T> {
    return this.executeWithRetry(
      async (): Promise<FetchResponse<any, any, any>> => {
        const response = await this.authedFetch(input, init);
        let body: any;
        try {
          body = await response.clone().json();
        } catch {}
        return {
          data: response.ok ? (body as T) : undefined,
          error: response.ok ? undefined : body,
          response,
        };
      },
      0,
    );
  }

  private async safeParse(response?: Response | null): Promise<any> {
    if (!response) return null;
    try {
      return await response.clone().json();
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private applyPagination(
    params: Record<string, string>,
    options?: ListOptions,
  ) {
    if (!options) return;
    if (options.page !== undefined)
      params['page[number]'] = String(options.page);
    if (options.pageSize !== undefined)
      params['page[size]'] = String(options.pageSize);
  }

  private normalizeInferNumberType(
    numberType?: string,
  ): TrackingRequestType | null {
    if (!numberType) return null;
    if (numberType === 'booking') return 'booking_number';
    if (numberType === 'booking_number') return 'booking_number';
    if (numberType === 'bill_of_lading' || numberType === 'container')
      return numberType;
    return null;
  }

  // ========= mapping helpers =========

  private formatResult<TDoc, TMap>(
    raw: TDoc,
    format: ResponseFormat | undefined,
    mapper?: (doc: TDoc) => TMap,
  ): TDoc | TMap | { raw: TDoc; mapped: TMap } {
    const effective = format || this.defaultFormat || 'raw';
    if (effective === 'raw') return raw;
    if (effective === 'mapped') return mapper ? mapper(raw) : (raw as any);
    if (effective === 'both')
      return mapper
        ? { raw, mapped: mapper(raw) }
        : { raw, mapped: raw as any };
    return raw;
  }

  private mapListResult<T>(
    doc: any,
    mapper: (doc: any) => T[],
  ): PaginatedResult<T> {
    return {
      items: mapper(doc),
      links: doc?.links,
      meta: doc?.meta,
    };
  }
}
