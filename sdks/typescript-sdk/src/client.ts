import type {
  ShipmentListFilters,
  ContainerListFilters,
} from './generated/list-filters.js';
import { Jsona } from 'jsona';
import {
  AuthenticationError,
  AuthorizationError,
  FeatureNotEnabledError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  Terminal49Error,
  TimeoutError,
  UpstreamError,
  ValidationError,
} from './client/errors.js';
import {
  ContainerManager,
  DocumentManager,
  DocumentSchemaManager,
  EmailSubmissionManager,
  ShipmentManager,
  ShippingLineManager,
  TrackingRequestManager,
} from './client/managers/index.js';
import type {
  CreateTrackingRequestFromInferOptions,
  TrackingRequestListFilters,
  TrackingRequestType,
} from './client/managers/tracking-requests.js';
import { applyTypedPagination } from './client/query.js';
import { callerPayload, type JsonBody } from './client/spec.js';
import { Transport } from './client/transport.js';
import type { paths } from './generated/terminal49.js';
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
  NetworkError,
  NotFoundError,
  RateLimitError,
  Terminal49Error,
  TimeoutError,
  UpstreamError,
  ValidationError,
};

type WebhookEvent = NonNullable<
  paths['/webhook_notifications/examples']['get']['parameters']['query']
>['event'];
type CustomFieldDefinitionListQuery = NonNullable<
  paths['/custom_field_definitions']['get']['parameters']['query']
>;
type CustomFieldListQuery = NonNullable<
  paths['/custom_fields']['get']['parameters']['query']
>;
type TriggerWebhookBody = JsonBody<paths['/webhooks/trigger']['post']>;
type CreatePartyBody = JsonBody<paths['/parties']['post']>;
type UpdatePartyBody = JsonBody<paths['/parties/{id}']['patch']>;
type CustomFieldDefinitionAttributes = NonNullable<
  JsonBody<paths['/custom_field_definitions']['post']>['data']
>['attributes'];

/** Parameters for {@link Terminal49Client.triggerWebhook}. */
export interface TriggerWebhookParams {
  /** HTTPS destination URL for the test delivery. */
  url: TriggerWebhookBody['url'];
  /** Webhook event name used to generate the example payload, e.g. `tracking_request.succeeded`. */
  event: TriggerWebhookBody['event'];
  /** Optional secret used to sign the request in `X-T49-Webhook-Signature`. */
  secret?: TriggerWebhookBody['secret'];
  /** Document type for `document_representation.*` example payloads. */
  documentType?: NonNullable<TriggerWebhookBody['sample']>['document_type'];
}

/** Filters accepted by `customFields.list`. */
export interface CustomFieldListFilters {
  entityType?: CustomFieldDefinitionAttributes['entity_type'];
  entityId?: string;
  definitionId?: string;
}

/** Filters accepted by `customFieldDefinitions.list`. */
export interface CustomFieldDefinitionListFilters {
  entityType?: CustomFieldDefinitionAttributes['entity_type'];
  dataType?: CustomFieldDefinitionAttributes['data_type'];
  displayName?: string;
}

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
  /**
   * Per-request timeout in milliseconds. A hung request is aborted once it
   * elapses and rejected with a `TimeoutError`. Defaults to `30000`. Set to `0`
   * to disable the timeout.
   */
  timeoutMs?: number;
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
  private defaultFormat: ResponseFormat;

  public shipments: ShipmentManager;
  public containers: ContainerManager;
  public trackingRequests: TrackingRequestManager;
  public shippingLines: ShippingLineManager;
  public documents: DocumentManager;
  public emailSubmissions: EmailSubmissionManager;
  public documentSchemas: DocumentSchemaManager;

  public webhooks = {
    list: (options?: ListOptions) => this.listWebhooks(options),
    get: (id: string, options?: CallOptions) => this.getWebhook(id, options),
    create: (payload: Record<string, unknown>, options?: CallOptions) =>
      this.createWebhook(payload, options),
    update: (
      id: string,
      payload: Record<string, unknown>,
      options?: CallOptions,
    ) => this.updateWebhook(id, payload, options),
    delete: (id: string, options?: CallOptions) =>
      this.deleteWebhook(id, options),
    ips: (options?: CallOptions) => this.getWebhookIps(options),
    events: (options?: CallOptions) => this.listWebhookEvents(options),
    trigger: (params: TriggerWebhookParams, options?: CallOptions) =>
      this.triggerWebhook(params, options),
  };

  public webhookNotifications = {
    list: (options?: ListOptions) => this.listWebhookNotifications(options),
    get: (id: string, options?: CallOptions) =>
      this.getWebhookNotification(id, options),
    examples: (event?: string, options?: CallOptions) =>
      this.getWebhookNotificationExamples(event, options),
  };

  public vessels = {
    get: (id: string, options?: CallOptions) => this.getVessel(id, options),
    getByImo: (imo: string, options?: CallOptions) =>
      this.getVesselByImo(imo, options),
    futurePositions: (id: string, options?: CallOptions) =>
      this.getVesselFuturePositions(id, options),
    futurePositionsWithCoords: (id: string, options?: CallOptions) =>
      this.getVesselFuturePositionsWithCoords(id, options),
  };

  public ports = {
    get: (id: string, options?: CallOptions) => this.getPort(id, options),
  };

  public terminals = {
    get: (id: string, options?: CallOptions) => this.getTerminal(id, options),
  };

  public parties = {
    list: (options?: ListOptions) => this.listParties(options),
    get: (id: string, options?: CallOptions) => this.getParty(id, options),
    create: (payload: CreatePartyBody, options?: CallOptions) =>
      this.createParty(payload, options),
    update: (id: string, payload: UpdatePartyBody, options?: CallOptions) =>
      this.updateParty(id, payload, options),
  };

  public metroAreas = {
    get: (id: string, options?: CallOptions) => this.getMetroArea(id, options),
  };

  public customFieldDefinitions = {
    list: (
      options?: ListOptions & { filters?: CustomFieldDefinitionListFilters },
    ) => this.listCustomFieldDefinitions(options),
    get: (id: string, options?: CallOptions) =>
      this.getCustomFieldDefinition(id, options),
    create: (payload: Record<string, unknown>, options?: CallOptions) =>
      this.createCustomFieldDefinition(payload, options),
    update: (
      id: string,
      payload: Record<string, unknown>,
      options?: CallOptions,
    ) => this.updateCustomFieldDefinition(id, payload, options),
    delete: (id: string, options?: CallOptions) =>
      this.deleteCustomFieldDefinition(id, options),
  };

  public customFieldOptions = {
    list: (definitionId: string, options?: ListOptions) =>
      this.listCustomFieldOptions(definitionId, options),
    get: (definitionId: string, optionId: string, options?: CallOptions) =>
      this.getCustomFieldOption(definitionId, optionId, options),
    create: (
      definitionId: string,
      payload: Record<string, unknown>,
      options?: CallOptions,
    ) => this.createCustomFieldOption(definitionId, payload, options),
    update: (
      definitionId: string,
      optionId: string,
      payload: Record<string, unknown>,
      options?: CallOptions,
    ) => this.updateCustomFieldOption(definitionId, optionId, payload, options),
    delete: (definitionId: string, optionId: string, options?: CallOptions) =>
      this.deleteCustomFieldOption(definitionId, optionId, options),
  };

  public customFields = {
    list: (options?: ListOptions & { filters?: CustomFieldListFilters }) =>
      this.listCustomFields(options),
    get: (id: string, options?: CallOptions) =>
      this.getCustomField(id, options),
    create: (payload: Record<string, unknown>, options?: CallOptions) =>
      this.createCustomField(payload, options),
    update: (
      id: string,
      payload: Record<string, unknown>,
      options?: CallOptions,
    ) => this.updateCustomField(id, payload, options),
    delete: (id: string, options?: CallOptions) =>
      this.deleteCustomField(id, options),
  };

  constructor(config: Terminal49ClientConfig) {
    if (!config.apiToken) {
      throw new AuthenticationError('API token is required');
    }

    const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
    const defaultFormat = config.defaultFormat ?? 'raw';
    this.defaultFormat = defaultFormat;

    this.transport = new Transport({
      apiToken: config.apiToken,
      accountId: config.accountId,
      baseUrl,
      maxRetries: config.maxRetries,
      timeoutMs: config.timeoutMs,
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
    this.documents = new DocumentManager(this.transport, defaultFormat);
    this.emailSubmissions = new EmailSubmissionManager(
      this.transport,
      defaultFormat,
    );
    this.documentSchemas = new DocumentSchemaManager(
      this.transport,
      defaultFormat,
    );
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
    if (!query || query.trim() === '') {
      throw new ValidationError('query is required (/query)');
    }

    return this.transport.execute(() =>
      this.transport.client.GET('/search', { params: { query: { query } } }),
    );
  }

  /** Fetch a container by ID with optional included relationships. */
  async getContainer(
    id: string,
    include: IncludeParam<ContainerInclude> = [
      'shipment',
      'pod_terminal',
      'pickup_facility',
    ],
    options?: CallOptions,
  ): Promise<any> {
    return this.containers.get(id, include, options);
  }

  /** Convenience helper for creating a tracking request from a container or booking number. */
  async trackContainer(params: {
    containerNumber?: string;
    bookingNumber?: string;
    scac?: string;
    autoDetectVoccScac?: boolean;
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
      autoDetectVoccScac: params.autoDetectVoccScac,
      refNumbers: params.refNumbers,
    });
  }

  /** Create a tracking request with an explicit number type and carrier SCAC, or ask the API to auto-detect the carrier SCAC. */
  async createTrackingRequest(params: {
    requestType: TrackingRequestType;
    requestNumber: string;
    scac?: string;
    autoDetectVoccScac?: boolean;
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
    filters: ShipmentListFilters = {},
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
    filters: ContainerListFilters = {},
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

  /** List webhooks. */
  async listWebhooks(options?: ListOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/webhooks', {
        params: { query: applyTypedPagination({}, options) },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a webhook by ID. */
  async getWebhook(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/webhooks/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Create a webhook. */
  async createWebhook(
    payload: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/webhooks', {
        body: callerPayload<JsonBody<paths['/webhooks']['post']>>(payload),
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Update a webhook. */
  async updateWebhook(
    id: string,
    payload: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/webhooks/{id}', {
        params: { path: { id } },
        body: callerPayload<JsonBody<paths['/webhooks/{id}']['patch']>>(
          payload,
        ),
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Delete a webhook. */
  async deleteWebhook(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.DELETE('/webhooks/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List webhook source IP ranges. */
  async getWebhookIps(options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/webhooks/ips'),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List the event names a webhook can subscribe to. */
  async listWebhookEvents(options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/webhooks/events'),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Send a test webhook delivery with an example payload to a URL. */
  async triggerWebhook(
    params: TriggerWebhookParams,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/webhooks/trigger', {
        body: {
          url: params.url,
          event: params.event,
          secret: params.secret,
          sample: params.documentType
            ? { document_type: params.documentType }
            : undefined,
        },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List webhook notifications. */
  async listWebhookNotifications(options?: ListOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/webhook_notifications', {
        params: { query: applyTypedPagination({}, options) },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a webhook notification by ID. */
  async getWebhookNotification(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/webhook_notifications/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch example webhook notification payloads. */
  async getWebhookNotificationExamples(
    event?: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/webhook_notifications/examples', {
        params: { query: { event: callerPayload<WebhookEvent>(event) } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a vessel by ID. */
  async getVessel(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/vessels/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a vessel by IMO number. */
  async getVesselByImo(imo: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/vessels/{imo}', {
        params: { path: { imo } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch future vessel positions. */
  async getVesselFuturePositions(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    // The spec marks port_id and previous_port_id required; this signature never accepted them.
    const raw = await this.transport.executeManual(
      `${this.transport.baseUrl}/vessels/${encodeURIComponent(id)}/future_positions`,
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch future vessel positions with coordinates. */
  async getVesselFuturePositionsWithCoords(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    // The spec marks port and coordinate params required; this signature never accepted them.
    const raw = await this.transport.executeManual(
      `${this.transport.baseUrl}/vessels/${encodeURIComponent(id)}/future_positions_with_coordinates`,
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a port by ID. */
  async getPort(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/ports/{id}', { params: { path: { id } } }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a terminal by ID. */
  async getTerminal(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/terminals/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List parties. */
  async listParties(options?: ListOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/parties', {
        params: { query: applyTypedPagination({}, options) },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a party by ID. */
  async getParty(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/parties/{id}', { params: { path: { id } } }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Create a party. */
  async createParty(
    payload: CreatePartyBody,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/parties', { body: payload }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Update a party. */
  async updateParty(
    id: string,
    payload: UpdatePartyBody,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/parties/{id}', {
        params: { path: { id } },
        body: payload,
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a metro area by ID. */
  async getMetroArea(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/metro_areas/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List custom field definitions. */
  async listCustomFieldDefinitions(
    options?: ListOptions & { filters?: CustomFieldDefinitionListFilters },
  ): Promise<any> {
    const filters = options?.filters;
    const query = applyTypedPagination<CustomFieldDefinitionListQuery>(
      {
        'filter[entity_type]': filters?.entityType,
        'filter[data_type]': filters?.dataType,
        'filter[display_name]': filters?.displayName,
      },
      options,
    );
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/custom_field_definitions', {
        params: { query },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a custom field definition by ID. */
  async getCustomFieldDefinition(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/custom_field_definitions/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Create a custom field definition. */
  async createCustomFieldDefinition(
    payload: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/custom_field_definitions', {
        body: callerPayload<
          JsonBody<paths['/custom_field_definitions']['post']>
        >(payload),
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Update a custom field definition. */
  async updateCustomFieldDefinition(
    id: string,
    payload: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/custom_field_definitions/{id}', {
        params: { path: { id } },
        body: callerPayload<
          JsonBody<paths['/custom_field_definitions/{id}']['patch']>
        >(payload),
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Delete a custom field definition. */
  async deleteCustomFieldDefinition(
    id: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.DELETE('/custom_field_definitions/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List options for a custom field definition. */
  async listCustomFieldOptions(
    definitionId: string,
    options?: ListOptions,
  ): Promise<any> {
    // The spec omits page[*] on this route, but the response is paginated and the CLI forwards --page.
    const query = new URLSearchParams(
      Object.entries(applyTypedPagination({}, options)).map(
        ([key, value]): [string, string] => [key, String(value)],
      ),
    );
    const suffix = query.size > 0 ? `?${query}` : '';
    const raw = await this.transport.executeManual(
      `${this.transport.baseUrl}/custom_field_definitions/${encodeURIComponent(definitionId)}/options${suffix}`,
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a custom field option. */
  async getCustomFieldOption(
    definitionId: string,
    optionId: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET(
        '/custom_field_definitions/{definition_id}/options/{option_id}',
        {
          params: {
            path: { definition_id: definitionId, option_id: optionId },
          },
        },
      ),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Create a custom field option. */
  async createCustomFieldOption(
    definitionId: string,
    payload: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST(
        '/custom_field_definitions/{definition_id}/options',
        {
          params: { path: { definition_id: definitionId } },
          body: callerPayload<
            JsonBody<
              paths['/custom_field_definitions/{definition_id}/options']['post']
            >
          >(payload),
        },
      ),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Update a custom field option. */
  async updateCustomFieldOption(
    definitionId: string,
    optionId: string,
    payload: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH(
        '/custom_field_definitions/{definition_id}/options/{option_id}',
        {
          params: {
            path: { definition_id: definitionId, option_id: optionId },
          },
          body: callerPayload<
            JsonBody<
              paths['/custom_field_definitions/{definition_id}/options/{option_id}']['patch']
            >
          >(payload),
        },
      ),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Delete a custom field option. */
  async deleteCustomFieldOption(
    definitionId: string,
    optionId: string,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.DELETE(
        '/custom_field_definitions/{definition_id}/options/{option_id}',
        {
          params: {
            path: { definition_id: definitionId, option_id: optionId },
          },
        },
      ),
    );
    return this.formatResult(raw, options?.format);
  }

  /** List custom field assignments. */
  async listCustomFields(
    options?: ListOptions & { filters?: CustomFieldListFilters },
  ): Promise<any> {
    const filters = options?.filters;
    const query = applyTypedPagination<CustomFieldListQuery>(
      {
        'filter[entity_type]': filters?.entityType,
        'filter[entity_id]': filters?.entityId,
        'filter[definition_id]': filters?.definitionId,
      },
      options,
    );
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/custom_fields', { params: { query } }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Fetch a custom field assignment by ID. */
  async getCustomField(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.GET('/custom_fields/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Create a custom field assignment. */
  async createCustomField(
    payload: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.POST('/custom_fields', {
        body: callerPayload<JsonBody<paths['/custom_fields']['post']>>(payload),
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Update a custom field assignment. */
  async updateCustomField(
    id: string,
    payload: Record<string, unknown>,
    options?: CallOptions,
  ): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.PATCH('/custom_fields/{id}', {
        params: { path: { id } },
        body: callerPayload<JsonBody<paths['/custom_fields/{id}']['patch']>>(
          payload,
        ),
      }),
    );
    return this.formatResult(raw, options?.format);
  }

  /** Delete a custom field assignment. */
  async deleteCustomField(id: string, options?: CallOptions): Promise<any> {
    const raw = await this.transport.execute(() =>
      this.transport.client.DELETE('/custom_fields/{id}', {
        params: { path: { id } },
      }),
    );
    return this.formatResult(raw, options?.format);
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

  private formatResult<TDoc, TMap>(
    raw: TDoc,
    format: ResponseFormat | undefined,
    mapper?: (doc: TDoc) => TMap,
  ): TDoc | TMap | { raw: TDoc; mapped: TMap } {
    const effective = format || this.defaultFormat || 'raw';
    if (effective === 'raw') return raw;
    if (effective === 'mapped') return mapper ? mapper(raw) : (raw as any);
    if (effective === 'both') {
      return mapper
        ? { raw, mapped: mapper(raw) }
        : { raw, mapped: raw as any };
    }
    return raw;
  }
}
