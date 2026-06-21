import { Jsona } from 'jsona';
import {
  AuthenticationError,
  AuthorizationError,
  FeatureNotEnabledError,
  NotFoundError,
  RateLimitError,
  Terminal49Error,
  UpstreamError,
  ValidationError,
} from './client/errors.js';
import {
  ContainerManager,
  ShipmentManager,
  ShippingLineManager,
  TrackingRequestManager,
} from './client/managers/index.js';
import type {
  CreateTrackingRequestFromInferOptions,
  TrackingRequestListFilters,
  TrackingRequestType,
} from './client/managers/tracking-requests.js';
import { Transport } from './client/transport.js';
import type {
  CallOptions,
  ContainerInclude,
  IncludeParam,
  ListOptions,
  ResponseFormat,
  ShipmentInclude,
  TrackingRequestInclude,
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

/** Configuration for {@link Terminal49Client}. */
export interface Terminal49ClientConfig {
  /** Terminal49 API token. Pass either the raw token or a value prefixed with `Token ` or `Bearer `. */
  apiToken: string;
  /** Account id to send as `x-account-id` for user-scoped bearer tokens. */
  accountId?: string;
  /** API base URL. Defaults to `https://api.terminal49.com/v2`. */
  apiBaseUrl?: string;
  /** Number of retry attempts for rate-limit and server errors. Defaults to `2`. */
  maxRetries?: number;
  /** Optional fetch implementation, useful for tests or custom runtimes. */
  fetchImpl?: typeof fetch;
  /** Default response format for methods that support mapped responses. Defaults to `raw`. */
  defaultFormat?: ResponseFormat;
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

/**
 * Server-side TypeScript client for the Terminal49 JSON:API.
 *
 * Use this client to create tracking requests, list and fetch shipments and
 * containers, retrieve transport events, and work with core Terminal49 tracking
 * data from Node.js applications.
 */
export class Terminal49Client {
  private transport: Transport;
  private jsona: Jsona;

  public shipments: ShipmentManager;
  public containers: ContainerManager;
  public trackingRequests: TrackingRequestManager;
  public shippingLines: ShippingLineManager;

  constructor(config: Terminal49ClientConfig) {
    if (!config.apiToken) {
      throw new AuthenticationError('API token is required');
    }

    const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
    const defaultFormat = config.defaultFormat ?? 'raw';

    this.transport = new Transport({
      apiToken: config.apiToken,
      accountId: config.accountId,
      baseUrl,
      maxRetries: config.maxRetries,
      fetchImpl: config.fetchImpl,
    });

    this.jsona = new Jsona();

    this.shipments = new ShipmentManager(this.transport, defaultFormat);
    this.containers = new ContainerManager(this.transport, defaultFormat);
    this.trackingRequests = new TrackingRequestManager(
      this.transport,
      defaultFormat,
    );
    this.shippingLines = new ShippingLineManager(this.transport, defaultFormat);
  }

  /**
   * Deserialize a JSON:API document into plain objects.
   * Useful when you want a simplified shape instead of JSON:API.
   *
   * @remarks The cast is unchecked at runtime — the caller is responsible
   * for verifying the returned shape matches `T`.
   */
  deserialize<T>(document: unknown): T {
    return this.jsona.deserialize(document as any) as T;
  }

  // ========= API methods (Backward Compatibility) =========

  /** Search across shipments and containers by number, reference, or keyword. */
  async search(query: string): Promise<any> {
    const params = new URLSearchParams({ query });
    return this.transport.executeManual(
      `${this.transport.baseUrl}/search?${params.toString()}`,
    );
  }

  /** Fetch a container by ID with optional included relationships. */
  async getContainer(
    id: string,
    include: IncludeParam<ContainerInclude> = ['shipment', 'pod_terminal'],
    options?: CallOptions,
  ): Promise<any> {
    return this.containers.get(id, include, options);
  }

  /** Convenience helper for creating a tracking request from a container or booking number. */
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

    if (!requestNumber) {
      throw new ValidationError(
        'request_number is required (/data/attributes/request_number)',
      );
    }

    return this.trackingRequests.create({
      requestType,
      requestNumber,
      scac: params.scac,
      refNumbers: params.refNumbers,
    });
  }

  /** Create a tracking request with an explicit number type and carrier SCAC. */
  async createTrackingRequest(params: {
    requestType: TrackingRequestType;
    requestNumber: string;
    scac?: string;
    refNumbers?: string[];
    shipmentTags?: string[];
  }): Promise<any> {
    return this.trackingRequests.create(params);
  }

  /** Infer a tracking number's type and likely carrier candidates. */
  async inferTrackingNumber(number: string): Promise<any> {
    return this.trackingRequests.inferNumber(number);
  }

  /** Infer carrier/number type, then create a tracking request from the result. */
  async createTrackingRequestFromInfer(
    number: string,
    options: CreateTrackingRequestFromInferOptions = {},
  ): Promise<{ infer: any; trackingRequest: any }> {
    return this.trackingRequests.createFromInfer(number, options);
  }

  /** Fetch a shipment by ID, optionally including related containers. */
  async getShipment(
    id: string,
    includeContainers = true,
    options?: CallOptions & { include?: IncludeParam<ShipmentInclude> },
  ): Promise<any> {
    return this.shipments.get(id, includeContainers, options);
  }

  /** List shipments with optional filters and pagination. */
  async listShipments(
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
    return this.shipments.list(filters, options);
  }

  /** Update shipment attributes such as reference numbers or tags. */
  async updateShipment(
    id: string,
    attrs: Record<string, any>,
    options?: CallOptions,
  ): Promise<any> {
    return this.shipments.update(id, attrs, options);
  }

  /** Stop tracking a shipment and its containers. */
  async stopTrackingShipment(id: string, options?: CallOptions): Promise<any> {
    return this.shipments.stopTracking(id, options);
  }

  /** Resume tracking a previously stopped shipment. */
  async resumeTrackingShipment(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    return this.shipments.resumeTracking(id, options);
  }

  /** Return a demurrage-focused subset of container fields. */
  async getDemurrage(containerId: string): Promise<any> {
    const data = await this.containers.get(containerId, ['pod_terminal']);
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

  /** Fetch normalized transport events for a container. */
  async getContainerTransportEvents(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    return this.containers.events(id, options);
  }

  /** Fetch routing details for a container. This may require a paid Terminal49 feature. */
  async getContainerRoute(id: string, options?: CallOptions): Promise<any> {
    return this.containers.route(id, options);
  }

  /** List supported shipping lines, optionally filtered by search text. */
  async listShippingLines(
    search?: string,
    options?: CallOptions,
  ): Promise<any> {
    return this.shippingLines.list(search, options);
  }

  /** Return rail milestone fields and rail transport events for a container. */
  async getRailMilestones(containerId: string): Promise<any> {
    const data = await this.containers.get(containerId, ['transport_events']);
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

  /** List containers with optional filters and pagination. */
  async listContainers(
    filters: {
      status?: string;
      port?: string;
      carrier?: string;
      updatedAfter?: string;
      include?: IncludeParam<ContainerInclude>;
    } = {},
    options?: ListOptions,
  ): Promise<any> {
    return this.containers.list(filters, options);
  }

  /** Fetch raw carrier/terminal events for a container. */
  async getContainerRawEvents(id: string, options?: CallOptions): Promise<any> {
    return this.containers.rawEvents(id, options);
  }

  /** Request an immediate refresh for a container. This may require a paid Terminal49 feature. */
  async refreshContainer(id: string, options?: CallOptions): Promise<any> {
    return this.containers.refresh(id, options);
  }

  /** List tracking requests with optional filters and pagination. */
  async listTrackingRequests(
    filters: TrackingRequestListFilters = {},
    options?: ListOptions,
  ): Promise<any> {
    return this.trackingRequests.list(filters, options);
  }

  /** Alias for {@link listTrackingRequests}. */
  async listTrackRequests(
    filters: TrackingRequestListFilters = {},
    options?: ListOptions,
  ): Promise<any> {
    return this.listTrackingRequests(filters, options);
  }

  /** Fetch a tracking request by ID. */
  async getTrackingRequest(
    id: string,
    options?: CallOptions & { include?: IncludeParam<TrackingRequestInclude> },
  ): Promise<any> {
    return this.trackingRequests.get(id, options);
  }

  /** Update tracking request attributes. */
  async updateTrackingRequest(
    id: string,
    attrs: Record<string, any>,
    options?: CallOptions,
  ): Promise<any> {
    return this.trackingRequests.update(id, attrs, options);
  }
}
