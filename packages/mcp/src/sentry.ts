import type { McpServer } from '@modelcontextprotocol/server';
import * as Sentry from '@sentry/node';

type Environment = NodeJS.ProcessEnv;

function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (!value) {
    return defaultValue;
  }

  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      return defaultValue;
  }
}

function parseSampleRate(
  value: string | undefined,
  defaultValue: number,
): number {
  if (!value) {
    return defaultValue;
  }

  const sampleRate = Number(value);
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    return defaultValue;
  }

  return sampleRate;
}

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Every gateway request carries the caller's credential (a customer's
// Terminal49 API key in pass-through mode). Sentry's RequestData integration
// copies all incoming headers into `event.request.headers` regardless of
// `sendDefaultPii`, and its span-attribute deny list misses names such as
// `x-vercel-protection-bypass`, `x-vercel-proxy-signature`, and arbitrary
// cookie names. Scrub both places with one policy.
const SENSITIVE_HEADER_PATTERN =
  /auth|token|secret|cookie|session|api[-_]?key|password|signature|bypass/i;
const HEADER_ATTRIBUTE_PREFIXES = [
  'http.request.header.',
  'http.response.header.',
];

function isSensitiveHeaderAttribute(key: string): boolean {
  const prefix = HEADER_ATTRIBUTE_PREFIXES.find((candidate) =>
    key.startsWith(candidate),
  );
  return (
    prefix !== undefined &&
    SENSITIVE_HEADER_PATTERN.test(key.slice(prefix.length))
  );
}

type TraceContextData = NonNullable<
  NonNullable<Sentry.Event['contexts']>['trace']
>['data'];
type SpanJsonData = NonNullable<Sentry.Event['spans']>[number]['data'];

function scrubSpanData(data: TraceContextData | SpanJsonData): void {
  if (!data) {
    return;
  }

  for (const key of Object.keys(data)) {
    if (isSensitiveHeaderAttribute(key)) {
      delete data[key];
    }
  }
}

export function scrubSensitiveRequestData<T extends Sentry.Event>(event: T): T {
  const request = event.request;
  if (request) {
    delete request.cookies;
    if (request.headers) {
      request.headers = Object.fromEntries(
        Object.entries(request.headers).filter(
          ([name]) => !SENSITIVE_HEADER_PATTERN.test(name),
        ),
      );
    }
  }

  scrubSpanData(event.contexts?.trace?.data);
  for (const span of event.spans ?? []) {
    scrubSpanData(span.data);
  }

  return event;
}

export function buildSentryOptions(
  dsn: string,
  env: Environment = process.env,
): Sentry.NodeOptions {
  return {
    dsn,
    environment:
      optionalValue(env.SENTRY_ENVIRONMENT) ?? optionalValue(env.NODE_ENV),
    release:
      optionalValue(env.SENTRY_RELEASE) ??
      optionalValue(env.VERCEL_GIT_COMMIT_SHA),
    sendDefaultPii: parseBoolean(env.SENTRY_SEND_DEFAULT_PII, false),
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, 1),
    beforeSend: scrubSensitiveRequestData,
    beforeSendTransaction: scrubSensitiveRequestData,
  };
}

export function initializeSentryFromEnv(
  env: Environment = process.env,
): boolean {
  if (Sentry.isInitialized()) {
    return true;
  }

  if (!parseBoolean(env.SENTRY_ENABLED, true)) {
    return false;
  }

  const dsn = optionalValue(env.SENTRY_DSN);
  if (!dsn) {
    return false;
  }

  Sentry.init(buildSentryOptions(dsn, env));

  return true;
}

export function instrumentMcpServer<TServer extends McpServer>(
  server: TServer,
  env: Environment = process.env,
): TServer {
  if (!Sentry.isInitialized()) {
    return server;
  }

  return Sentry.wrapMcpServerWithSentry(server, {
    recordInputs: parseBoolean(env.SENTRY_MCP_RECORD_INPUTS, false),
    recordOutputs: parseBoolean(env.SENTRY_MCP_RECORD_OUTPUTS, false),
  });
}

export function captureMcpException(error: unknown): void {
  if (Sentry.isInitialized()) {
    const safeError = new Error(
      'The Terminal49 upstream request could not be completed.',
    );
    const name = error instanceof Error ? error.name : 'Error';
    safeError.name = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(name)
      ? name
      : 'Error';
    Sentry.captureException(safeError);
  }
}

export async function flushMcpEvents(timeoutMs = 2000): Promise<void> {
  if (!Sentry.isInitialized()) {
    return;
  }

  await Sentry.flush(timeoutMs).catch(() => undefined);
}
