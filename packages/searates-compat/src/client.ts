import type {
  JsonApiDocument,
  JsonApiResource,
  Terminal49TrackingType,
  TrackingType,
} from './types.js';

export class Terminal49ApiError extends Error {
  readonly status: number;
  readonly document: JsonApiDocument | null;

  constructor(status: number, document: JsonApiDocument | null) {
    const detail = document?.errors?.[0]?.detail;
    super(detail || `Terminal49 API returned HTTP ${status}`);
    this.name = 'Terminal49ApiError';
    this.status = status;
    this.document = document;
  }
}

export interface Terminal49ClientConfig {
  apiToken: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  requestTimeoutMs?: number;
}

function normalizeToken(token: string): string {
  return token.trim().replace(/^(Bearer|Token)\s+/i, '');
}

function resourceArray(document: JsonApiDocument): JsonApiResource[] {
  return Array.isArray(document.data) ? document.data : [];
}

function trackedObjectId(resource: JsonApiResource): string | null {
  const tracked = resource.relationships?.tracked_object?.data;
  return tracked && !Array.isArray(tracked) && tracked.type === 'shipment'
    ? tracked.id
    : null;
}

function resourceTimestamp(resource: JsonApiResource): number {
  const value =
    resource.attributes?.updated_at || resource.attributes?.created_at;
  return typeof value === 'string' ? Date.parse(value) || 0 : 0;
}

function selectTrackingRequest(
  resources: JsonApiResource[],
  requestType: Terminal49TrackingType,
): JsonApiResource | undefined {
  return resources
    .filter(
      (resource) =>
        resource.attributes?.request_type === requestType &&
        resource.attributes?.status !== 'failed',
    )
    .sort((left, right) => {
      const leftTracked = trackedObjectId(left) ? 1 : 0;
      const rightTracked = trackedObjectId(right) ? 1 : 0;
      return (
        rightTracked - leftTracked ||
        resourceTimestamp(right) - resourceTimestamp(left)
      );
    })[0];
}

function freshnessSignature(document: JsonApiDocument): string {
  const resources = [
    ...(Array.isArray(document.data)
      ? document.data
      : document.data
        ? [document.data]
        : []),
    ...(document.included || []),
  ];
  return resources
    .filter((resource) => ['container', 'shipment'].includes(resource.type))
    .map((resource) => {
      const attributes = resource.attributes || {};
      return [
        resource.id,
        attributes.line_tracking_last_succeeded_at,
        attributes.pod_last_tracking_request_at,
        attributes.shipment_last_tracking_request_at,
        attributes.terminal_checked_at,
      ].join(':');
    })
    .sort()
    .join('|');
}

function trackingType(type: TrackingType): Terminal49TrackingType {
  switch (type) {
    case 'CT':
      return 'container';
    case 'BL':
      return 'bill_of_lading';
    case 'BK':
      return 'booking_number';
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

export class Terminal49PublicClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly token: string;

  constructor(config: Terminal49ClientConfig) {
    this.token = normalizeToken(config.apiToken);
    this.baseUrl = (config.baseUrl || 'https://api.terminal49.com/v2').replace(
      /\/+$/,
      '',
    );
    this.fetchImpl = config.fetchImpl || fetch;
    this.pollIntervalMs = config.pollIntervalMs ?? 500;
    this.pollTimeoutMs = config.pollTimeoutMs ?? 4_000;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 10_000;
  }

  async shippingLines(): Promise<JsonApiDocument> {
    return this.request('/shipping_lines');
  }

  async findShipment(
    number: string,
    type?: TrackingType,
  ): Promise<JsonApiDocument | null> {
    if (type === 'CT' || (!type && /^[A-Z]{4}\d{7}$/.test(number))) {
      const containers = await this.request(
        `/containers?filter[number]=${encodeURIComponent(number)}&include=shipment&page[size]=1`,
      );
      const container = resourceArray(containers)[0];
      const shipmentReference = container?.relationships?.shipment?.data;
      if (
        shipmentReference &&
        !Array.isArray(shipmentReference) &&
        shipmentReference.type === 'shipment'
      ) {
        return this.shipment(shipmentReference.id);
      }
      if (type === 'CT') return null;
    }

    const shipments = await this.request(
      `/shipments?number=${encodeURIComponent(number)}&include=containers,port_of_lading,port_of_discharge,pod_terminal,destination,destination_terminal&page[size]=1`,
    );
    const shipment = resourceArray(shipments)[0];
    return shipment ? this.shipment(shipment.id) : null;
  }

  async shipment(id: string, timeoutMs?: number): Promise<JsonApiDocument> {
    return this.request(
      `/shipments/${encodeURIComponent(id)}?include=containers,port_of_lading,port_of_discharge,pod_terminal,destination,destination_terminal`,
      {},
      timeoutMs,
    );
  }

  async transportEvents(containerId: string): Promise<JsonApiDocument> {
    return this.request(
      `/containers/${encodeURIComponent(containerId)}/transport_events?include=location,terminal,vessel`,
    );
  }

  async refreshContainer(containerId: string): Promise<void> {
    await this.request(
      `/containers/${encodeURIComponent(containerId)}/refresh`,
      {
        method: 'PATCH',
      },
    );
  }

  async waitForShipmentUpdate(
    shipmentId: string,
    previous: JsonApiDocument,
  ): Promise<JsonApiDocument | null> {
    const baseline = freshnessSignature(previous);
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      const current = await this.shipment(
        shipmentId,
        Math.min(this.requestTimeoutMs, Math.max(1, deadline - Date.now())),
      );
      if (freshnessSignature(current) !== baseline) return current;
    }
    return null;
  }

  async resolveTrackingRequest(input: {
    number: string;
    scac?: string;
    type: TrackingType;
  }): Promise<
    | { failedReason: string; state: 'failed' }
    | { state: 'pending' }
    | { shipmentId: string; state: 'created' }
  > {
    const existing = await this.trackingRequests(input.number, input.scac);
    let requestResource = selectTrackingRequest(
      resourceArray(existing),
      trackingType(input.type),
    );

    if (!requestResource) {
      const attributes: Record<string, string | boolean> = {
        request_number: input.number,
        request_type: trackingType(input.type),
      };
      if (input.scac) {
        attributes.scac = input.scac;
      } else {
        attributes.auto_detect_vocc_scac = true;
      }
      const created = await this.request('/tracking_requests', {
        body: JSON.stringify({
          data: { type: 'tracking_request', attributes },
        }),
        headers: { 'Content-Type': 'application/vnd.api+json' },
        method: 'POST',
      });
      requestResource = Array.isArray(created.data)
        ? created.data[0]
        : (created.data ?? undefined);
    }

    if (!requestResource) return { state: 'pending' };

    const deadline = Date.now() + this.pollTimeoutMs;
    while (true) {
      const status = String(requestResource.attributes?.status || 'pending');
      const shipmentId = trackedObjectId(requestResource);
      if (shipmentId) return { shipmentId, state: 'created' };
      if (status === 'failed') {
        return {
          failedReason: String(
            requestResource.attributes?.failed_reason || 'not_found',
          ),
          state: 'failed',
        };
      }
      if (Date.now() >= deadline) return { state: 'pending' };
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      const remainingMs = Math.max(1, deadline - Date.now());
      const next = await this.request(
        `/tracking_requests/${encodeURIComponent(requestResource.id)}?include=tracked_object`,
        {},
        Math.min(this.requestTimeoutMs, remainingMs),
      );
      requestResource = Array.isArray(next.data)
        ? next.data[0]
        : (next.data ?? requestResource);
    }
  }

  private async trackingRequests(
    number: string,
    scac?: string,
  ): Promise<JsonApiDocument> {
    const params = new URLSearchParams({
      'filter[request_number]': number,
      include: 'tracked_object',
      'page[size]': '30',
    });
    if (scac) params.set('filter[scac]', scac);
    return this.request(`/tracking_requests?${params.toString()}`);
  }

  private async request(
    path: string,
    init: RequestInit = {},
    timeoutMs = this.requestTimeoutMs,
  ): Promise<JsonApiDocument> {
    const timeoutSignal = AbortSignal.timeout(Math.max(1, timeoutMs));
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal,
      headers: {
        Accept: 'application/vnd.api+json',
        Authorization: `Token ${this.token}`,
        ...init.headers,
      },
    });
    let document: JsonApiDocument | null = null;
    try {
      document = (await response.json()) as JsonApiDocument;
    } catch {
      document = null;
    }
    if (!response.ok) {
      throw new Terminal49ApiError(response.status, document);
    }
    if (!document) {
      throw new Terminal49ApiError(response.status, null);
    }
    return document;
  }
}
