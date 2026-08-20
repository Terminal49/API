import { timingSafeEqual } from 'node:crypto';
import {
  Terminal49ApiError,
  Terminal49PublicClient,
  type Terminal49ClientConfig,
} from './client.js';
import {
  mapShippingLines,
  mapTrackingPayload,
  pendingEnvelope,
} from './mapping.js';
import type {
  JsonApiDocument,
  JsonApiResource,
  SeaRatesEnvelope,
  TrackingPayload,
  TrackingQuery,
  TrackingType,
} from './types.js';

export interface GatewayConfig {
  apiBaseUrl?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  serviceApiToken?: string;
}

function errorEnvelope(message: string): SeaRatesEnvelope {
  return { status: 'error', message, data: null };
}

function secureEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function inferType(number: string, explicit?: TrackingType): TrackingType {
  return explicit || (/^[A-Z]{4}\d{7}$/.test(number) ? 'CT' : 'BL');
}

function shipmentFrom(document: JsonApiDocument): JsonApiResource | null {
  if (!document.data || Array.isArray(document.data)) return null;
  return document.data.type === 'shipment' ? document.data : null;
}

function containerResources(document: JsonApiDocument): JsonApiResource[] {
  return (document.included || []).filter(
    (resource) => resource.type === 'container',
  );
}

function upstreamErrorMessage(error: Terminal49ApiError): string {
  if (error.status === 401) return 'API_KEY_WRONG';
  if (error.status === 403) return 'API_KEY_ACCESS_DENIED';
  if (error.status === 429) return 'API_KEY_RATE_LIMIT';
  if (error.status === 422) {
    const detail = error.document?.errors?.[0]?.detail || '';
    if (/scac|shipping line/i.test(detail)) return 'WRONG_SEALINE';
    return 'WRONG_NUMBER';
  }
  return error.status >= 500 ? 'SEALINE_NO_RESPONSE' : 'WRONG_PARAMETERS';
}

export class SeaRatesCompatibilityGateway {
  private readonly config: GatewayConfig;

  constructor(config: GatewayConfig = {}) {
    this.config = config;
  }

  async tracking(
    apiKey: string | undefined,
    query: TrackingQuery,
  ): Promise<SeaRatesEnvelope> {
    if (!apiKey) return errorEnvelope('API_KEY_REQUIRED');
    if (!query.number) return errorEnvelope('WRONG_NUMBER');

    let client: Terminal49PublicClient;
    try {
      client = this.client(apiKey, false);
    } catch {
      return errorEnvelope('API_KEY_WRONG');
    }

    const type = inferType(query.number, query.type);
    try {
      let shipmentDocument = await client.findShipment(query.number, type);
      if (!shipmentDocument) {
        const resolution = await client.resolveTrackingRequest({
          number: query.number,
          scac:
            query.sealine && query.sealine !== 'AUTO'
              ? query.sealine
              : undefined,
          type,
        });
        if (resolution.state === 'failed') {
          const message =
            resolution.failedReason === 'scac_auto_detect_failed'
              ? 'AUTO_CANT_DETECT_SEALINE'
              : resolution.failedReason === 'invalid_number'
                ? 'WRONG_NUMBER'
                : 'SEALINE_HASNT_PROVIDE_INFO';
          return errorEnvelope(message);
        }
        if (resolution.state === 'pending') {
          return pendingEnvelope(query.number, type, query.sealine);
        }
        shipmentDocument = await client.shipment(resolution.shipmentId);
      }

      const shipment = shipmentFrom(shipmentDocument);
      if (!shipment) return pendingEnvelope(query.number, type, query.sealine);
      let containers = containerResources(shipmentDocument);

      if (query.forceUpdate && containers.length > 0) {
        await Promise.all(
          containers.map((container) => client.refreshContainer(container.id)),
        );
        shipmentDocument = await client.shipment(shipment.id);
        containers = containerResources(shipmentDocument);
      }

      const eventsByContainerId = new Map<string, JsonApiDocument>();
      await Promise.all(
        containers.map(async (container) => {
          eventsByContainerId.set(
            container.id,
            await client.transportEvents(container.id),
          );
        }),
      );
      const payload: TrackingPayload = {
        eventsByContainerId,
        included: shipmentDocument.included || [],
        requestedNumber: query.number,
        requestedType: type,
        shipment,
      };
      return mapTrackingPayload(payload);
    } catch (error) {
      return errorEnvelope(
        error instanceof Terminal49ApiError
          ? upstreamErrorMessage(error)
          : 'SEALINE_NO_RESPONSE',
      );
    }
  }

  async shippingLines(apiKey?: string): Promise<SeaRatesEnvelope> {
    let client: Terminal49PublicClient;
    try {
      client = this.client(apiKey, true);
    } catch {
      return errorEnvelope(apiKey ? 'API_KEY_WRONG' : 'API_KEY_REQUIRED');
    }
    try {
      return mapShippingLines(await client.shippingLines());
    } catch (error) {
      return errorEnvelope(
        error instanceof Terminal49ApiError
          ? upstreamErrorMessage(error)
          : 'SEALINE_NO_RESPONSE',
      );
    }
  }

  private client(
    apiKey: string | undefined,
    allowServiceTokenWithoutKey: boolean,
  ): Terminal49PublicClient {
    const serviceToken = this.config.serviceApiToken?.trim();
    let token: string;
    if (serviceToken) {
      if (
        !allowServiceTokenWithoutKey &&
        (!apiKey ||
          !this.config.clientSecret ||
          !secureEqual(apiKey, this.config.clientSecret))
      ) {
        throw new Error('Invalid compatibility gateway key');
      }
      if (
        apiKey &&
        this.config.clientSecret &&
        !secureEqual(apiKey, this.config.clientSecret)
      ) {
        throw new Error('Invalid compatibility gateway key');
      }
      token = serviceToken;
    } else {
      if (!apiKey) throw new Error('API key is required');
      token = apiKey;
    }

    const clientConfig: Terminal49ClientConfig = {
      apiToken: token,
      baseUrl: this.config.apiBaseUrl,
      fetchImpl: this.config.fetchImpl,
      pollIntervalMs: this.config.pollIntervalMs,
      pollTimeoutMs: this.config.pollTimeoutMs,
    };
    return new Terminal49PublicClient(clientConfig);
  }
}
