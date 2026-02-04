import createClient, { type FetchResponse } from 'openapi-fetch';
import { Jsona } from 'jsona';
import type { paths } from './generated/terminal49.js';
import type { ResponseFormat, CallOptions, ListOptions } from './types/options.js';
import type { Container, Shipment, ShippingLine, Route, TrackingRequest, PaginatedResult } from './types/models.js';

/**
 * Terminal49 API Client
 * Typed wrapper around Terminal49's JSON:API using openapi-fetch + openapi-typescript.
 * Can be used standalone or plugged into the MCP tools.
 */

export class Terminal49Error extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'Terminal49Error';
    this.status = status;
    this.details = details;
  }
}

export class AuthenticationError extends Terminal49Error {
  constructor(message: string, status: number = 401, details?: unknown) {
    super(message, status, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Terminal49Error {
  constructor(message: string, status: number = 403, details?: unknown) {
    super(message, status, details);
    this.name = 'AuthorizationError';
  }
}

export class FeatureNotEnabledError extends AuthorizationError {
  constructor(message: string, status: number = 403, details?: unknown) {
    super(message, status, details);
    this.name = 'FeatureNotEnabledError';
  }
}

export class NotFoundError extends Terminal49Error {
  constructor(message: string, status: number = 404, details?: unknown) {
    super(message, status, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Terminal49Error {
  constructor(message: string, status: number = 400, details?: unknown) {
    super(message, status, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Terminal49Error {
  constructor(message: string, status: number = 429, details?: unknown) {
    super(message, status, details);
    this.name = 'RateLimitError';
  }
}

export class UpstreamError extends Terminal49Error {
  constructor(message: string, status: number = 500, details?: unknown) {
    super(message, status, details);
    this.name = 'UpstreamError';
  }
}

export interface Terminal49ClientConfig {
  apiToken: string;
  apiBaseUrl?: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  defaultFormat?: ResponseFormat;
}

export type TrackingRequestType = 'container' | 'bill_of_lading' | 'booking_number';

type Client = ReturnType<typeof createClient<paths>>;

type FormattedResult<TDoc, TMapped> = TDoc | TMapped | { raw: TDoc; mapped: TMapped };

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
      options?: ListOptions
    ) => this.listShipments(filters, options),
    update: (id: string, attrs: Record<string, any>, options?: CallOptions) =>
      this.updateShipment(id, attrs, options),
    stopTracking: (id: string, options?: CallOptions) => this.stopTrackingShipment(id, options),
    resumeTracking: (id: string, options?: CallOptions) => this.resumeTrackingShipment(id, options),
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
      options?: ListOptions
    ) => this.listContainers(filters, options),
    events: (id: string, options?: CallOptions) => this.getContainerTransportEvents(id, options),
    route: (id: string, options?: CallOptions) => this.getContainerRoute(id, options),
    rawEvents: (id: string, options?: CallOptions) => this.getContainerRawEvents(id, options),
    refresh: (id: string, options?: CallOptions) => this.refreshContainer(id, options),
  };

  public shippingLines = {
    list: (search?: string, options?: CallOptions) => this.listShippingLines(search, options),
  };

  public trackingRequests = {
    list: (filters: Record<string, string> = {}, options?: ListOptions) =>
      this.listTrackingRequests(filters, options),
    get: (id: string, options?: CallOptions) => this.getTrackingRequest(id, options),
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
    createFromInfer: (number: string, options?: CreateTrackingRequestFromInferOptions) =>
      this.createTrackingRequestFromInfer(number, options),
  };

  // ========= API methods =========

  async search(query: string): Promise<any> {
    const params = new URLSearchParams({ query });
    return this.executeManual(`${this.apiBaseUrl}/search?${params.toString()}`);
  }

  async getContainer(
    id: string,
    include: string[] = ['shipment', 'pod_terminal'],
    options?: CallOptions
  ): Promise<any> {
    const includeParam = include.length > 0 ? include.join(',') : undefined;
    const raw = await this.execute(() =>
      this.client.GET('/containers/{id}', {
        params: {
          path: { id },
          query: includeParam ? ({ include: includeParam } as any) : undefined,
        },
      })
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

    const missingRequestMessage = 'request_number is required (/data/attributes/request_number)';
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
      throw new ValidationError('request_number is required (/data/attributes/request_number)');
    }
    if (!params.requestType) {
      throw new ValidationError('request_type is required (/data/attributes/request_type)');
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
      })
    );
  }

  async inferTrackingNumber(number: string): Promise<any> {
    if (!number || number.trim() === '') {
      throw new ValidationError('number is required (/data/attributes/number)');
    }

    return this.execute(() =>
      this.client.POST('/tracking_requests/infer_number', {
        body: { number } as any,
      })
    );
  }

  async createTrackingRequestFromInfer(
    number: string,
    options: CreateTrackingRequestFromInferOptions = {}
  ): Promise<{ infer: any; trackingRequest: any }> {
    const infer = await this.inferTrackingNumber(number);
    const attrs = infer?.data?.attributes || {};
    const numberType = this.normalizeInferNumberType(attrs.number_type || options.numberType);
    const shippingLine = attrs.shipping_line || {};
    const selected = shippingLine.selected || null;
    const candidates = Array.isArray(shippingLine.candidates) ? shippingLine.candidates : [];

    let scac = options.scac || selected?.scac || (candidates.length === 1 ? candidates[0]?.scac : undefined);

    if (!numberType) {
      throw new ValidationError('Unable to infer tracking number type. Provide numberType to override.');
    }

    if (!scac) {
      throw new ValidationError(
        'Unable to infer carrier SCAC. Provide scac or use infer candidates to select a carrier.'
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

  async getShipment(id: string, includeContainers: boolean = true, options?: CallOptions): Promise<any> {
    const includes = includeContainers
      ? 'containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal'
      : 'pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal';

    const raw = await this.execute(() =>
      this.client.GET('/shipments/{id}', {
        params: {
          path: { id },
          query: { include: includes } as any,
        },
      })
    );
    return this.formatResult(raw, options?.format, this.mapShipment);
  }

  async listShipments(
    filters: {
      status?: string;
      port?: string;
      carrier?: string;
      updatedAfter?: string;
      includeContainers?: boolean;
    } = {},
    options?: ListOptions
  ): Promise<FormattedResult<any, PaginatedResult<Shipment>>> {
    const params: Record<string, string> = {
      include: 'containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal',
    };

    if (filters.status) params['filter[status]'] = filters.status;
    if (filters.port) params['filter[pod_locode]'] = filters.port;
    if (filters.carrier) params['filter[line_scac]'] = filters.carrier;
    if (filters.updatedAfter) params['filter[updated_at]'] = filters.updatedAfter;

    if (filters.includeContainers === false) {
      params['include'] = 'pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal';
    }

    this.applyPagination(params, options);

    const raw = await this.execute(() =>
      this.client.GET('/shipments', {
        params: { query: params as any },
      })
    );
    return this.formatResult(raw, options?.format, (doc) => this.mapListResult(doc, this.mapShipmentList));
  }

  async updateShipment(id: string, attrs: Record<string, any>, options?: CallOptions): Promise<any> {
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
      })
    );

    return this.formatResult(raw, options?.format, this.mapShipment);
  }

  async stopTrackingShipment(id: string, options?: CallOptions): Promise<any> {
    const payload = { data: { type: 'shipment' as const, id } };
    const raw = await this.execute(() =>
      this.client.PATCH('/shipments/{id}/stop_tracking', {
        params: { path: { id } },
        body: payload as any,
      })
    );
    return this.formatResult(raw, options?.format, this.mapShipment);
  }

  async resumeTrackingShipment(id: string, options?: CallOptions): Promise<any> {
    const payload = { data: { type: 'shipment' as const, id } };
    const raw = await this.execute(() =>
      this.client.PATCH('/shipments/{id}/resume_tracking', {
        params: { path: { id } },
        body: payload as any,
      })
    );
    return this.formatResult(raw, options?.format, this.mapShipment);
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

  async getContainerTransportEvents(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.GET('/containers/{id}/transport_events', {
        params: {
          path: { id },
          query: { include: 'location,terminal' },
        },
      })
    );
    return this.formatResult(raw, options?.format, this.mapTransportEvents);
  }

  private mapTransportEvents = (doc: any) => {
    const events = doc?.data || [];
    const included = doc?.included || [];
    const findIncluded = (id: string, type: string) => included.find((i: any) => i.id === id && i.type === type);

    return events.map((item: any) => {
      const evAttrs = item.attributes || {};
      const locRef = item.relationships?.location?.data;
      const termRef = item.relationships?.terminal?.data;
      const location = locRef ? findIncluded(locRef.id, 'location') : null;
      const terminal = termRef ? findIncluded(termRef.id, 'terminal') : null;
      return {
        id: item.id,
        ...this.toCamelCase(evAttrs),
        location: location
          ? {
              id: location.id,
              name: location.attributes?.name,
              locode: location.attributes?.locode,
            }
          : undefined,
        terminal: terminal
          ? {
              id: terminal.id,
              name: terminal.attributes?.name,
              nickname: terminal.attributes?.nickname,
              firmsCode: terminal.attributes?.firms_code,
            }
          : undefined,
      };
    });
  };

  async getContainerRoute(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.GET('/containers/{id}/route', {
        params: {
          path: { id },
          query: { include: 'port,vessel,route_location' } as any,
        },
      })
    );
    return this.formatResult(raw, options?.format, this.mapRoute);
  }

  async listShippingLines(search?: string, options?: CallOptions): Promise<any> {
    const query = search ? { search } : undefined;
    const raw = await this.execute(() =>
      this.client.GET('/shipping_lines', {
        params: { query: query as any },
      })
    );
    return this.formatResult(raw, options?.format, this.mapShippingLines);
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
    options?: ListOptions
  ): Promise<FormattedResult<any, PaginatedResult<Container>>> {
    const params: Record<string, string> = {
      include: filters.include || 'shipment,pod_terminal',
    };
    if (filters.status) params['filter[status]'] = filters.status;
    if (filters.port) params['filter[pod_locode]'] = filters.port;
    if (filters.carrier) params['filter[line_scac]'] = filters.carrier;
    if (filters.updatedAfter) params['filter[updated_at]'] = filters.updatedAfter;

    this.applyPagination(params, options);

    const raw = await this.execute(() =>
      this.client.GET('/containers', {
        params: { query: params as any },
      })
    );
    return this.formatResult(raw, options?.format, (doc) => this.mapListResult(doc, this.mapContainerList));
  }

  async getContainerRawEvents(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.GET('/containers/{id}/raw_events', {
        params: { path: { id } },
      })
    );
    return this.formatResult(raw, options?.format);
  }

  async refreshContainer(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.PATCH('/containers/{id}/refresh', {
        params: { path: { id } },
      })
    );
    return this.formatResult(raw, options?.format);
  }

  async listTrackingRequests(
    filters: Record<string, string> = {},
    options?: ListOptions
  ): Promise<FormattedResult<any, PaginatedResult<TrackingRequest>>> {
    const params: Record<string, string> = { ...filters };
    this.applyPagination(params, options);

    const raw = await this.execute(() =>
      this.client.GET('/tracking_requests', {
        params: { query: params as any },
      })
    );
    return this.formatResult(raw, options?.format, (doc) => this.mapListResult(doc, this.mapTrackingRequestList));
  }

  async listTrackRequests(
    filters: Record<string, string> = {},
    options?: ListOptions
  ): Promise<FormattedResult<any, PaginatedResult<TrackingRequest>>> {
    return this.listTrackingRequests(filters, options);
  }

  async getTrackingRequest(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.execute(() =>
      this.client.GET('/tracking_requests/{id}', {
        params: { path: { id } },
      })
    );
    return this.formatResult(raw, options?.format, this.mapTrackingRequest);
  }

  async updateTrackingRequest(id: string, attrs: Record<string, any>, options?: CallOptions): Promise<any> {
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
      })
    );

    return this.formatResult(raw, options?.format, this.mapTrackingRequest);
  }

  // ========= internal helpers =========

  private buildFetch(fetchImpl: typeof fetch) {
    return async (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Token token=${this.apiToken}`);
      headers.set('Accept', 'application/json');
      if (init?.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      return fetchImpl(input, { ...init, headers });
    };
  }

  private async execute<T = any>(fn: () => Promise<FetchResponse<any, any, any>>): Promise<T> {
    return this.executeWithRetry(fn, 0);
  }

  private async executeWithRetry<T = any>(
    fn: () => Promise<FetchResponse<any, any, any>>,
    attempt: number
  ): Promise<T> {
    const { data, error, response } = await fn();

    if (data !== undefined && response?.ok !== false) {
      return data as T;
    }

    const status = response?.status ?? 500;

    if ((status === 429 || status >= 500) && attempt < this.maxRetries) {
      const delay = Math.pow(2, attempt) * 500;
      await this.sleep(delay);
      return this.executeWithRetry(fn, attempt + 1);
    }

    const errorBody = error ?? (await this.safeParse(response));
    throw this.toError(status, this.extractErrorMessage(errorBody), errorBody);
  }

  private async executeManual<T = any>(input: Request | URL | string, init?: RequestInit): Promise<T> {
    return this.executeWithRetry(async (): Promise<FetchResponse<any, any, any>> => {
      const response = await this.authedFetch(input, init);
      let body: any = undefined;
      try {
        body = await response.clone().json();
      } catch {
        body = undefined;
      }
      return {
        data: response.ok ? (body as T) : undefined,
        error: response.ok ? undefined : body,
        response,
      };
    }, 0);
  }

  private async safeParse(response?: Response | null): Promise<any> {
    if (!response) return null;
    try {
      return await response.clone().json();
    } catch {
      return null;
    }
  }

  private extractErrorMessage(body: any): string {
    if (typeof body === 'string') {
      return body;
    }

    if (body?.error && typeof body.error === 'string') {
      return body.error;
    }

    if (typeof body?.errors === 'string') {
      return body.errors;
    }

    if (body?.errors && Array.isArray(body.errors) && body.errors.length > 0) {
      return body.errors
        .map((error: any) => {
          const detail = error.detail;
          const title = error.title;
          const code = error.code;
          const pointer = error.source?.pointer;
          let msg = detail || title || code || 'Unknown error';
          if (pointer) msg += ` (${pointer})`;
          return msg;
        })
        .join('; ');
    }

    if (body?.message) {
      return body.message;
    }

    if (body?.detail && typeof body.detail === 'string') {
      return body.detail;
    }

    return 'Unknown error';
  }

  private toError(status: number, message: string, details?: unknown): Terminal49Error {
    switch (status) {
      case 400:
        return new ValidationError(message, status, details);
      case 401:
        return new AuthenticationError('Invalid or missing API token', status, details);
      case 403: {
        const normalized = message || 'Access forbidden';
        const featureNotEnabled = /not enabled|feature/i.test(normalized);
        return featureNotEnabled
          ? new FeatureNotEnabledError(normalized, status, details)
          : new AuthorizationError(normalized, status, details);
      }
      case 404:
        return new NotFoundError(message || 'Resource not found', status, details);
      case 422:
        return new ValidationError(message, status, details);
      case 429:
        return new RateLimitError(message || 'Rate limit exceeded', status, details);
      case 500:
      case 502:
      case 503:
      case 504:
        return new UpstreamError(message || `Upstream server error (${status})`, status, details);
      default:
        return new Terminal49Error(
          `Unexpected response status: ${status}${message ? ` - ${message}` : ''}`,
          status,
          details
        );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private applyPagination(params: Record<string, string>, options?: ListOptions) {
    if (!options) return;
    if (options.page !== undefined) params['page[number]'] = String(options.page);
    if (options.pageSize !== undefined) params['page[size]'] = String(options.pageSize);
  }

  private normalizeInferNumberType(numberType?: string): TrackingRequestType | null {
    if (!numberType) return null;
    if (numberType === 'booking') return 'booking_number';
    if (numberType === 'booking_number') return 'booking_number';
    if (numberType === 'bill_of_lading' || numberType === 'container') return numberType;
    return null;
  }

  // ========= mapping helpers =========

  private formatResult<TDoc, TMap>(
    raw: TDoc,
    format: ResponseFormat | undefined,
    mapper?: (doc: TDoc) => TMap
  ): TDoc | TMap | { raw: TDoc; mapped: TMap } {
    const effective = format || this.defaultFormat || 'raw';
    if (effective === 'raw') return raw;
    if (effective === 'mapped') return mapper ? mapper(raw) : (raw as any);
    if (effective === 'both') return mapper ? { raw, mapped: mapper(raw) } : { raw, mapped: raw as any };
    return raw;
  }

  private mapListResult<T>(doc: any, mapper: (doc: any) => T[]): PaginatedResult<T> {
    return {
      items: mapper(doc),
      links: doc?.links,
      meta: doc?.meta,
    };
  }

  private mapContainer = (doc: any): Container => {
    const attrs = doc?.data?.attributes || {};
    const attrCamel = this.toCamelCase(attrs);
    const relationships = doc?.data?.relationships || {};
    const included = doc?.included || [];

    const findIncluded = (id: string, type: string) => included.find((i: any) => i.id === id && i.type === type);

    const shipmentRef = relationships.shipment?.data;
    const shipmentIncluded = shipmentRef ? findIncluded(shipmentRef.id, 'shipment') : null;

    const podTerminalRef = relationships.pod_terminal?.data;
    const destinationTerminalRef = relationships.destination_terminal?.data;
    const podTerminal = podTerminalRef ? findIncluded(podTerminalRef.id, 'terminal') : null;
    const destTerminal = destinationTerminalRef ? findIncluded(destinationTerminalRef.id, 'terminal') : null;

    const transportEvents = included
      .filter((item: any) => item.type === 'transport_event')
      .map((item: any) => {
        const evAttrs = item.attributes || {};
        const locRef = item.relationships?.location?.data;
        const termRef = item.relationships?.terminal?.data;
        const location = locRef ? findIncluded(locRef.id, 'location') : null;
        const terminal = termRef ? findIncluded(termRef.id, 'terminal') : null;
        return {
          id: item.id,
          ...this.toCamelCase(evAttrs),
          location: location
            ? {
                id: location.id,
                name: location.attributes?.name,
                locode: location.attributes?.locode,
              }
            : undefined,
          terminal: terminal
            ? {
                id: terminal.id,
                name: terminal.attributes?.name,
                nickname: terminal.attributes?.nickname,
                firmsCode: terminal.attributes?.firms_code,
              }
            : undefined,
        };
      });

    return {
      id: doc?.data?.id,
      ...attrCamel,
      number: attrs.number || attrs.container_number,
      status: attrs.status,
      equipment: {
        type: attrs.equipment_type,
        length: attrs.equipment_length,
        height: attrs.equipment_height,
        weightLbs: attrs.weight_in_lbs,
      },
      location: {
        currentLocation: attrs.location_at_pod_terminal,
        availableForPickup: attrs.available_for_pickup,
        podArrivedAt: attrs.pod_arrived_at,
        podDischargedAt: attrs.pod_discharged_at,
      },
      demurrage: {
        pickupLfd: attrs.pickup_lfd,
        pickupAppointmentAt: attrs.pickup_appointment_at,
        fees: attrs.fees_at_pod_terminal,
        holds: attrs.holds_at_pod_terminal,
      },
      terminals: {
        podTerminal: podTerminal
          ? {
              id: podTerminal.id,
              name: podTerminal.attributes?.name,
              nickname: podTerminal.attributes?.nickname,
              firmsCode: podTerminal.attributes?.firms_code,
            }
          : null,
        destinationTerminal: destTerminal
          ? {
              id: destTerminal.id,
              name: destTerminal.attributes?.name,
              nickname: destTerminal.attributes?.nickname,
              firmsCode: destTerminal.attributes?.firms_code,
            }
          : null,
      },
      rail: {
        podRailCarrierScac: attrs.pod_rail_carrier_scac,
        indRailCarrierScac: attrs.ind_rail_carrier_scac,
        podRailLoadedAt: attrs.pod_rail_loaded_at,
        podRailDepartedAt: attrs.pod_rail_departed_at,
        indRailArrivedAt: attrs.ind_rail_arrived_at,
        indRailUnloadedAt: attrs.ind_rail_unloaded_at,
        indEtaAt: attrs.ind_eta_at,
        indAtaAt: attrs.ind_ata_at,
      },
      events: transportEvents,
      shipment: shipmentIncluded
        ? {
            id: shipmentIncluded.id,
            billOfLading:
              shipmentIncluded.attributes?.bill_of_lading_number ||
              shipmentIncluded.attributes?.bill_of_lading ||
              shipmentIncluded.attributes?.bl_number,
            shippingLineScac: shipmentIncluded.attributes?.shipping_line_scac,
          }
        : null,
    };
  };

  private mapContainerList = (doc: any): Container[] => {
    if (!Array.isArray(doc?.data)) return [];
    return doc.data.map((item: any) => this.mapContainer({ data: item, included: doc.included || [] }));
  };

  private mapShipment = (doc: any): Shipment => {
    const attrs = doc?.data?.attributes || {};
    const attrCamel = this.toCamelCase(attrs);
    const relationships = doc?.data?.relationships || {};
    const included = doc?.included || [];

    const findIncluded = (id: string, type: string) => included.find((i: any) => i.id === id && i.type === type);

    const shipment: Shipment = {
      id: doc?.data?.id,
      billOfLading:
        attrs.bill_of_lading_number || attrs.bill_of_lading || attrs.bl_number || attrs.bill_of_lading_number,
      shippingLineScac: attrs.shipping_line_scac,
      customerName: attrs.customer_name,
      containers: [],
      ...attrCamel,
    };

    // Containers from included
    const containerRefs = relationships.containers?.data || [];
    shipment.containers = containerRefs
      .map((ref: any) => {
        const c = findIncluded(ref.id, 'container');
        if (!c) return null;
        return { id: c.id, number: c.attributes?.number || c.attributes?.container_number };
      })
      .filter(Boolean) as Array<{ id: string; number?: string }>;

    // Tags/ref numbers/vessel
    shipment.refNumbers = attrs.ref_numbers;
    shipment.tags = attrs.tags;
    shipment.vesselAtPod = {
      name: attrs.pod_vessel_name,
      imo: attrs.pod_vessel_imo,
      voyageNumber: attrs.pod_voyage_number,
    };

    // Ports and terminals
    const portOfLadingRef = relationships.port_of_lading?.data;
    const portOfDischargeRef = relationships.port_of_discharge?.data;
    const destinationTerminalRef = relationships.destination_terminal?.data;
    const podTerminalRef = relationships.pod_terminal?.data;

    const pol = portOfLadingRef ? findIncluded(portOfLadingRef.id, 'port') : null;
    const pod = portOfDischargeRef ? findIncluded(portOfDischargeRef.id, 'port') : null;
    const destTerminal = destinationTerminalRef ? findIncluded(destinationTerminalRef.id, 'terminal') : null;
    const podTerminal = podTerminalRef ? findIncluded(podTerminalRef.id, 'terminal') : null;

    shipment.ports = {
      portOfLading: pol
        ? {
            locode: pol.attributes?.locode,
            name: pol.attributes?.name,
            code: pol.attributes?.code,
            countryCode: pol.attributes?.country_code,
            etd: attrs.pol_etd_at,
            atd: attrs.pol_atd_at,
            timezone: attrs.pol_timezone,
          }
        : null,
      portOfDischarge: pod
        ? {
            locode: pod.attributes?.locode,
            name: pod.attributes?.name,
            code: pod.attributes?.code,
            countryCode: pod.attributes?.country_code,
            eta: attrs.pod_eta_at,
            ata: attrs.pod_ata_at,
            originalEta: attrs.pod_original_eta_at,
            timezone: attrs.pod_timezone,
            terminal: podTerminal
              ? {
                  id: podTerminal.id,
                  name: podTerminal.attributes?.name,
                  nickname: podTerminal.attributes?.nickname,
                  firmsCode: podTerminal.attributes?.firms_code,
                }
              : null,
          }
        : null,
      destination: attrs.destination_locode
        ? {
            locode: attrs.destination_locode,
            name: attrs.destination_name,
            eta: attrs.destination_eta_at,
            ata: attrs.destination_ata_at,
            timezone: attrs.destination_timezone,
            terminal: destTerminal
              ? {
                  id: destTerminal.id,
                  name: destTerminal.attributes?.name,
                  nickname: destTerminal.attributes?.nickname,
                  firmsCode: destTerminal.attributes?.firms_code,
                }
              : null,
          }
        : null,
    };

    shipment.tracking = {
      lineTrackingLastAttemptedAt: attrs.line_tracking_last_attempted_at,
      lineTrackingLastSucceededAt: attrs.line_tracking_last_succeeded_at,
      lineTrackingStoppedAt: attrs.line_tracking_stopped_at,
      lineTrackingStoppedReason: attrs.line_tracking_stopped_reason,
    };

    return shipment;
  };

  private mapShipmentList = (doc: any): Shipment[] => {
    if (!Array.isArray(doc?.data)) return [];
    return doc.data.map((item: any) => this.mapShipment({ data: item, included: doc.included || [] }));
  };

  private mapShippingLines = (doc: any): ShippingLine[] => {
    const data = Array.isArray(doc?.data) ? doc.data : [];
    return data
      .map((item: any) => {
        const attrs = item?.attributes || {};
        const scac = attrs.scac || item?.scac;
        if (!scac) return null;
        return {
          scac,
          name: attrs.name || attrs.full_name || scac,
          shortName: attrs.short_name || attrs.nickname || undefined,
          bolPrefix: attrs.bol_prefix || undefined,
          notes: attrs.notes || undefined,
        } as ShippingLine;
      })
      .filter(Boolean) as ShippingLine[];
  };

  private mapRoute = (doc: any): Route => {
    const route = doc.data?.attributes || {};
    const relationships = doc.data?.relationships || {};
    const included = doc.included || [];

    const routeLocationRefs = relationships.route_locations?.data || [];
    const routeLocations = routeLocationRefs
      .map((ref: any) => {
        const location = included.find((item: any) => item.id === ref.id && item.type === 'route_location');
        if (!location) return null;

        const attrs = location.attributes || {};
        const rels = location.relationships || {};

        const portId = rels.port?.data?.id;
        const port = included.find((item: any) => item.id === portId && item.type === 'port');

        const inboundVesselId = rels.inbound_vessel?.data?.id;
        const outboundVesselId = rels.outbound_vessel?.data?.id;
        const inboundVessel = included.find((item: any) => item.id === inboundVesselId && item.type === 'vessel');
        const outboundVessel = included.find((item: any) => item.id === outboundVesselId && item.type === 'vessel');

        return {
          port: port
            ? {
                code: port.attributes?.code,
                name: port.attributes?.name,
                city: port.attributes?.city,
                countryCode: port.attributes?.country_code,
              }
            : null,
          inbound: {
            mode: attrs.inbound_mode,
            carrierScac: attrs.inbound_scac,
            eta: attrs.inbound_eta_at,
            ata: attrs.inbound_ata_at,
            vessel: inboundVessel
              ? {
                  name: inboundVessel.attributes?.name,
                  imo: inboundVessel.attributes?.imo,
                }
              : null,
          },
          outbound: {
            mode: attrs.outbound_mode,
            carrierScac: attrs.outbound_scac,
            etd: attrs.outbound_etd_at,
            atd: attrs.outbound_atd_at,
            vessel: outboundVessel
              ? {
                  name: outboundVessel.attributes?.name,
                  imo: outboundVessel.attributes?.imo,
                }
              : null,
          },
        };
      })
      .filter((loc: any) => loc !== null);

    return {
      id: doc.data?.id,
      totalLegs: routeLocations.length,
      locations: routeLocations,
      createdAt: route.created_at,
      updatedAt: route.updated_at,
    };
  };

  private mapTrackingRequestList = (doc: any): TrackingRequest[] => {
    if (!Array.isArray(doc?.data)) return [];
    return doc.data.map((item: any) => this.mapTrackingRequest({ data: item, included: doc.included || [] }));
  };

  private mapTrackingRequest = (doc: any): TrackingRequest => {
    const attrs = doc?.data?.attributes || {};
    const relationships = doc?.data?.relationships || {};
    const included = doc?.included || [];

    const findIncluded = (id: string, type: string) => included.find((i: any) => i.id === id && i.type === type);

    const shipmentRef = relationships.shipment?.data;
    const containerRef = relationships.container?.data;

    const shipmentIncluded = shipmentRef ? findIncluded(shipmentRef.id, 'shipment') : null;
    const containerIncluded = containerRef ? findIncluded(containerRef.id, 'container') : null;

    return {
      id: doc?.data?.id,
      requestType: attrs.request_type,
      requestNumber: attrs.request_number,
      status: attrs.status,
      scac: attrs.scac,
      refNumbers: attrs.ref_numbers,
      shipment: shipmentIncluded
        ? {
            id: shipmentIncluded.id,
            billOfLading:
              shipmentIncluded.attributes?.bill_of_lading_number ||
              shipmentIncluded.attributes?.bill_of_lading ||
              shipmentIncluded.attributes?.bl_number,
            shippingLineScac: shipmentIncluded.attributes?.shipping_line_scac,
          }
        : null,
      container: containerIncluded
        ? {
            id: containerIncluded.id,
            number: containerIncluded.attributes?.number || containerIncluded.attributes?.container_number,
            status: containerIncluded.attributes?.status,
          }
        : null,
      ...this.toCamelCase(attrs),
    };
  };

  private toCamelCase(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj || {})) {
      const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = value;
    }
    return result;
  }
}
