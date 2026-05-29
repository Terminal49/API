import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as Sentry from '@sentry/node';

type Environment = NodeJS.ProcessEnv;

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
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

function parseSampleRate(value: string | undefined, defaultValue: number): number {
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

export function initializeSentryFromEnv(env: Environment = process.env): boolean {
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

  Sentry.init({
    dsn,
    environment: optionalValue(env.SENTRY_ENVIRONMENT) ?? optionalValue(env.NODE_ENV),
    release: optionalValue(env.SENTRY_RELEASE) ?? optionalValue(env.VERCEL_GIT_COMMIT_SHA),
    sendDefaultPii: parseBoolean(env.SENTRY_SEND_DEFAULT_PII, false),
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE, 1),
  });

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
    Sentry.captureException(error);
  }
}

export async function flushMcpEvents(timeoutMs = 2000): Promise<void> {
  if (!Sentry.isInitialized()) {
    return;
  }

  await Sentry.flush(timeoutMs).catch(() => undefined);
}
