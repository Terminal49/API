/**
 * PostHog MCP Analytics for the Terminal49 MCP server.
 *
 * Mirrors the shape of `./sentry.ts`: an env-driven initializer, a server
 * wrapper, and a flush helper. Everything here is a hard no-op unless
 * `POSTHOG_PROJECT_API_KEY` is set — no client is constructed, no handlers are
 * patched, and no network calls are made. That matters because the stdio entry
 * point (`./index.ts`) runs on end users' laptops.
 *
 * Privacy posture (see `redactSensitiveProperties` below): we deliberately do
 * NOT send tool arguments or tool responses to PostHog. Terminal49 tool
 * arguments and results carry customer container, booking, and bill-of-lading
 * numbers. `@posthog/mcp` has no `recordInputs`/`recordOutputs`-style toggle
 * (unlike `Sentry.wrapMcpServerWithSentry`), so `beforeSend` is the only
 * supported redaction hook and we use it to strip those properties.
 *
 * @see https://posthog.com/docs/mcp-analytics/installation
 */
import type { McpServer } from '@modelcontextprotocol/server';
import type { BeforeSendFn, UserIdentity } from '@posthog/mcp';
// `PostHog` is imported from `@posthog/mcp`'s re-export rather than from
// `posthog-node` directly, and deliberately so. `posthog-node` is a *peer*
// dependency of `@posthog/mcp`, and this monorepo also carries a transitive
// copy via `@mintlify/cli` (pinned to an exact version). Taking the class from
// the same module that declares `instrument()`'s parameter type means the two
// can never drift into "PostHog is not assignable to PostHog" even if npm ever
// nests a second copy. `posthog-node` stays a declared dependency of this
// package because that is the peer contract.
import {
  instrument,
  PostHog,
  PostHogMCPAnalyticsEvent,
  PostHogMCPAnalyticsProperty,
} from '@posthog/mcp';

type Environment = NodeJS.ProcessEnv;

/**
 * Default ingestion host. This is the first-party reverse proxy the Terminal49
 * docs site already sends PostHog traffic through (`docs/docs.json` →
 * `integrations.posthog.apiHost`). Defaulting to it keeps MCP analytics on the
 * same origin as the rest of our PostHog usage, so there is a single hostname
 * to allowlist and no direct egress to `*.i.posthog.com`.
 *
 * Override with `POSTHOG_HOST` (e.g. `https://us.i.posthog.com`).
 */
const DEFAULT_POSTHOG_HOST = 'https://f.terminal49.com';

/**
 * Event properties stripped from every outgoing event.
 *
 * - `$mcp_parameters` — verbatim tool call arguments (container numbers, BOLs,
 *   booking numbers, customer reference numbers).
 * - `$mcp_response` — verbatim tool results (full shipment/container payloads).
 * - `$mcp_error_message` — upstream error text, which routinely echoes back the
 *   identifier that was looked up.
 *
 * Everything genuinely useful for product analytics survives: `$mcp_tool_name`,
 * `$mcp_duration_ms`, `$mcp_is_error`, `$mcp_error_type`, `$mcp_client_name`,
 * `$mcp_client_version`, `$mcp_listed_tool_names`, `$session_id`.
 */
const REDACTED_EVENT_PROPERTIES: readonly string[] = [
  PostHogMCPAnalyticsProperty.Parameters,
  PostHogMCPAnalyticsProperty.Response,
  PostHogMCPAnalyticsProperty.ErrorMessage,
];

/**
 * Process-wide client. Constructed at most once, and only when configured.
 * `undefined` is the "PostHog is off" signal throughout this module.
 */
let client: PostHog | undefined;

let exitHookRegistered = false;

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

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** True once a PostHog client exists. Used to keep call sites free of nulls. */
export function isPostHogInitialized(): boolean {
  return client !== undefined;
}

/**
 * Construct the PostHog client from the environment.
 *
 * Returns `false` — having done nothing at all — when `POSTHOG_ENABLED` is
 * falsy or `POSTHOG_PROJECT_API_KEY` is unset. Never throws.
 */
export function initializePostHogFromEnv(
  env: Environment = process.env,
): boolean {
  if (client) {
    return true;
  }

  if (!parseBoolean(env.POSTHOG_ENABLED, true)) {
    return false;
  }

  const projectApiKey = optionalValue(env.POSTHOG_PROJECT_API_KEY);
  if (!projectApiKey) {
    return false;
  }

  try {
    client = new PostHog(projectApiKey, {
      host: optionalValue(env.POSTHOG_HOST) ?? DEFAULT_POSTHOG_HOST,
      // Sentry owns error tracking for this server. Do not let posthog-node
      // install global uncaughtException/unhandledRejection handlers — on the
      // stdio path that would change an end-user CLI's crash semantics.
      enableExceptionAutocapture: false,
      // No secret/personal key is supplied, so flags are never evaluated
      // locally. Stated explicitly so nobody adds polling by accident: the only
      // network traffic this client makes is batched event ingestion.
      enableLocalEvaluation: false,
    });
  } catch {
    // A malformed key or host must not stop the MCP server from booting.
    client = undefined;
    return false;
  }

  return true;
}

/**
 * `beforeSend` hook. Drops `$exception` events wholesale and strips
 * customer-identifying properties from everything else.
 */
const redactSensitiveProperties: BeforeSendFn = (event) => {
  // `enableExceptionAutocapture: false` below should mean these never appear.
  // Dropping them here too is deliberate belt-and-braces: exception payloads
  // embed tool arguments in their message and stack, and Sentry already owns
  // error tracking, so PostHog never needs them.
  if (event.event === PostHogMCPAnalyticsEvent.Exception) {
    return null;
  }

  for (const property of REDACTED_EVENT_PROPERTIES) {
    if (property in event.properties) {
      delete event.properties[property];
    }
  }

  return event;
};

export interface PostHogInstrumentationOptions {
  /**
   * Distinct id for the caller, so events from the stateless HTTP path group
   * into one person instead of one anonymous person per request. We pass the
   * resolved Terminal49 account id — an internal account identifier, never
   * container or shipment data.
   */
  distinctId?: string;
}

/**
 * Instrument an `McpServer` with PostHog MCP analytics.
 *
 * `instrument()` patches the server's request handlers in place and returns an
 * analytics handle rather than the server, so we return the original server to
 * stay composable with `instrumentMcpServer()` from `./sentry.ts`.
 *
 * Returns the server untouched when PostHog is not configured.
 */
export function instrumentMcpServerWithPostHog<TServer extends McpServer>(
  server: TServer,
  options: PostHogInstrumentationOptions = {},
  env: Environment = process.env,
): TServer {
  if (!client) {
    return server;
  }

  const identify: UserIdentity | undefined = options.distinctId
    ? { distinctId: options.distinctId }
    : undefined;

  try {
    instrument(server, client, {
      // Do NOT inject PostHog's `context` argument. It is a *required* addition
      // to every tool's advertised inputSchema, which would change this
      // server's public MCP contract for all 10 tools. Tool telemetry must not
      // add conversation-adjacent arguments to Terminal49 tool schemas.
      context: false,
      // Sentry is the error tracker. Suppress the `$exception` sibling event so
      // failures are not double-reported (and so error text never leaves).
      enableExceptionAutocapture: false,
      identify,
      // Default is a no-op because MCP stdio transports must not write to
      // stdout. stderr is safe, but a laptop CLI should stay quiet unless asked.
      logger: parseBoolean(env.POSTHOG_DEBUG, false)
        ? (message: string) => console.error(`[posthog-mcp] ${message}`)
        : undefined,
      beforeSend: redactSensitiveProperties,
    });
  } catch {
    // Analytics instrumentation must never take the MCP server down.
  }

  return server;
}

/** Bound a promise so a slow/unreachable PostHog host cannot stall a request. */
async function withTimeout(
  work: Promise<void>,
  timeoutMs: number,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;

  try {
    await Promise.race([
      work,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Drain queued events. Call this per request on serverless, where the function
 * is frozen the moment the response is sent and any still-queued batch would
 * be lost. Never throws.
 */
export async function flushPostHogEvents(timeoutMs = 2000): Promise<void> {
  if (!client) {
    return;
  }

  await withTimeout(
    client.flush().catch(() => undefined),
    timeoutMs,
  ).catch(() => undefined);
}

/**
 * Flush and stop the client. For long-lived processes (the stdio server) only —
 * use {@link flushPostHogEvents} for per-request cleanup.
 */
export async function shutdownPostHog(timeoutMs = 2000): Promise<void> {
  if (!client) {
    return;
  }

  const stopping = client;
  client = undefined;

  await withTimeout(
    stopping.shutdown(timeoutMs).catch(() => undefined),
    timeoutMs,
  ).catch(() => undefined);
}

/**
 * Flush on natural process exit, for the long-lived stdio server.
 *
 * Only `beforeExit` is hooked, on purpose. Installing `SIGINT`/`SIGTERM`
 * listeners would override Node's default signal handling and make this
 * end-user CLI responsible for its own exit — a behavior change we do not want
 * analytics to be the cause of. Registers nothing when PostHog is unconfigured.
 */
export function registerPostHogExitHook(): void {
  if (!client || exitHookRegistered) {
    return;
  }

  exitHookRegistered = true;
  process.once('beforeExit', () => {
    void shutdownPostHog();
  });
}
