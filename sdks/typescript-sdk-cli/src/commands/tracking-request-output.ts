import {
  mapTrackingRequest,
  type ResponseFormat,
  type Terminal49Client,
} from '@terminal49/sdk';

type Mapper = (raw: unknown) => unknown;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeMap(raw: unknown, mapper: Mapper): unknown {
  try {
    const mapped = mapper(raw);
    return mapped === undefined ? raw : mapped;
  } catch {
    return raw;
  }
}

function formatMappedPayload(
  raw: unknown,
  format: ResponseFormat | undefined,
  mapper: Mapper,
): unknown {
  if (!format || format === 'raw') return raw;

  const mapped = safeMap(raw, mapper);
  if (format === 'both') return { raw, mapped };
  return mapped;
}

export function formatInferResult(
  client: Terminal49Client,
  raw: unknown,
  format: ResponseFormat | undefined,
): unknown {
  return formatMappedPayload(raw, format, (payload) =>
    client.deserialize(payload),
  );
}

export function formatTrackingRequestResult(
  raw: unknown,
  format: ResponseFormat | undefined,
): unknown {
  return formatMappedPayload(raw, format, mapTrackingRequest);
}

export function formatCreateFromInferResult(
  client: Terminal49Client,
  raw: unknown,
  format: ResponseFormat | undefined,
): unknown {
  if (!format || format === 'raw') return raw;

  const record = asRecord(raw);
  if (!record || !('trackingRequest' in record)) return raw;

  const mapped = {
    infer: safeMap(record.infer, (payload) => client.deserialize(payload)),
    trackingRequest: safeMap(record.trackingRequest, mapTrackingRequest),
  };

  if (format === 'both') return { raw, mapped };
  return mapped;
}
