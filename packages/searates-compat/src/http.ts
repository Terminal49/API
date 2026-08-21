import type { IncomingMessage, ServerResponse } from 'node:http';
import { toContainerEnvelope } from './mapping.js';
import { SeaRatesCompatibilityGateway, type GatewayConfig } from './service.js';
import type { TrackingQuery, TrackingType } from './types.js';

type RequestLike = {
  method?: string;
  url?: string;
} & IncomingMessage;

type ResponseLike = {
  status(code: number): ResponseLike;
  json(payload: unknown): void;
  setHeader(name: string, value: string): void;
} & ServerResponse;

function first(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

function booleanParam(params: URLSearchParams, key: string): boolean {
  return ['1', 'true', 'yes'].includes(
    (params.get(key) || '').trim().toLowerCase(),
  );
}

function trackingType(value: string | undefined): TrackingType | undefined {
  const normalized = value?.toUpperCase();
  return normalized === 'CT' || normalized === 'BL' || normalized === 'BK'
    ? normalized
    : undefined;
}

function gatewayConfig(): GatewayConfig {
  const pollTimeout = Number(process.env.T49_SEARATES_POLL_TIMEOUT_MS);
  const pollInterval = Number(process.env.T49_SEARATES_POLL_INTERVAL_MS);
  const requestTimeout = Number(process.env.T49_SEARATES_REQUEST_TIMEOUT_MS);
  return {
    apiBaseUrl: process.env.T49_API_BASE_URL,
    clientSecret: process.env.T49_SEARATES_CLIENT_SECRET,
    pollIntervalMs:
      Number.isFinite(pollInterval) && pollInterval >= 0
        ? pollInterval
        : undefined,
    pollTimeoutMs:
      Number.isFinite(pollTimeout) && pollTimeout >= 0
        ? pollTimeout
        : undefined,
    requestTimeoutMs:
      Number.isFinite(requestTimeout) && requestTimeout > 0
        ? requestTimeout
        : undefined,
    serviceApiToken: process.env.T49_SEARATES_API_TOKEN,
  };
}

function setHeaders(response: ResponseLike): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');
}

function requestParams(request: RequestLike): URLSearchParams {
  return new URL(request.url || '/', 'https://compat.invalid').searchParams;
}

export function createTrackingHandler(
  gateway = new SeaRatesCompatibilityGateway(gatewayConfig()),
  options: {
    allowedTypes?: readonly TrackingType[];
    defaultType?: TrackingType;
    forcedType?: TrackingType;
    singularContainer?: boolean;
  } = {},
) {
  return async (
    request: RequestLike,
    response: ResponseLike,
  ): Promise<void> => {
    setHeaders(response);
    if (request.method === 'OPTIONS') {
      response.status(204).json(null);
      return;
    }
    if (request.method !== 'GET') {
      response.status(405).json({
        status: 'error',
        message: 'METHOD_NOT_ALLOWED',
        data: {},
      });
      return;
    }

    const params = requestParams(request);
    const number = (first(params, 'number') || '')
      .replace(/\s+/g, '')
      .toUpperCase();
    const sealine = first(params, 'sealine')?.toUpperCase();
    const rawType = first(params, 'type');
    const requestedType = trackingType(rawType);
    const parsedType =
      options.forcedType || requestedType || options.defaultType;
    if (
      (!options.forcedType && rawType && !requestedType) ||
      (parsedType &&
        options.allowedTypes &&
        !options.allowedTypes.includes(parsedType))
    ) {
      response.status(200).json({
        status: 'error',
        message: 'WRONG_TYPE',
        data: {},
      });
      return;
    }
    const query: TrackingQuery = {
      ais: booleanParam(params, 'ais'),
      forceUpdate: booleanParam(params, 'force_update'),
      number,
      route: booleanParam(params, 'route'),
      sealine,
      type: parsedType,
    };
    const envelope = await gateway.tracking(first(params, 'api_key'), query);
    response
      .status(200)
      .json(
        options.singularContainer ? toContainerEnvelope(envelope) : envelope,
      );
  };
}

export function createContainerHandler(
  gateway = new SeaRatesCompatibilityGateway(gatewayConfig()),
) {
  return createTrackingHandler(gateway, {
    forcedType: 'CT',
    singularContainer: true,
  });
}

export function createReferenceHandler(
  gateway = new SeaRatesCompatibilityGateway(gatewayConfig()),
) {
  return createTrackingHandler(gateway, {
    allowedTypes: ['BL', 'BK'],
    defaultType: 'BL',
  });
}

export function createShippingLinesHandler(
  gateway = new SeaRatesCompatibilityGateway(gatewayConfig()),
) {
  return async (
    request: RequestLike,
    response: ResponseLike,
  ): Promise<void> => {
    setHeaders(response);
    if (request.method === 'OPTIONS') {
      response.status(204).json(null);
      return;
    }
    if (request.method !== 'GET') {
      response.status(405).json({
        status: 'error',
        message: 'METHOD_NOT_ALLOWED',
        data: {},
      });
      return;
    }
    response
      .status(200)
      .json(
        await gateway.shippingLines(first(requestParams(request), 'api_key')),
      );
  };
}
