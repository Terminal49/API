/**
 * Pure, side-effect-free helpers that decide whether and when a request may be
 * retried. Kept separate from the interceptor so the policy can be unit-tested
 * in isolation and reasoned about without a live transport.
 */

/** HTTP methods that are safe to retry automatically (no observable side effect). */
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Node/undici/browser error codes that indicate a transient connection failure. */
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

/** Whether the HTTP method can be retried without risking a duplicate write. */
export function isIdempotentMethod(method: string): boolean {
  return IDEMPOTENT_METHODS.has(method.toUpperCase());
}

/** Whether the response status is one the SDK retries (429 + 5xx). */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Whether a thrown `fetch` error is a transient network failure that should be
 * retried (DNS, connection reset, socket hang-up, "fetch failed", ...).
 *
 * An `AbortError` is explicitly NOT retryable: it means our own request-timeout
 * fired, so replaying it would just hang again.
 */
export function isRetryableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const err = error as { name?: string; code?: string; message?: string };
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return false;

  if (typeof err.code === 'string' && RETRYABLE_NETWORK_CODES.has(err.code)) {
    return true;
  }

  // undici/whatwg surface generic connection failures as a TypeError whose
  // message is "fetch failed" (often with a `cause`).
  if (error instanceof TypeError) return true;

  const message = typeof err.message === 'string' ? err.message : '';
  return /fetch failed|network|socket hang up|terminated/i.test(message);
}

/** Inputs to {@link shouldRetryRequest}. */
export interface RetryRequestContext {
  method: string;
  /** Set when the caller supplied an `Idempotency-Key`, making a write safe to replay. */
  hasIdempotencyKey?: boolean;
}

/**
 * Whether a request may be retried at all. Idempotent methods are always
 * eligible; non-idempotent writes are only eligible when the caller opted in
 * with an `Idempotency-Key` header.
 */
export function shouldRetryRequest(ctx: RetryRequestContext): boolean {
  if (isIdempotentMethod(ctx.method)) return true;
  return ctx.hasIdempotencyKey === true;
}

/**
 * Parse a `Retry-After` header into milliseconds. Supports both delta-seconds
 * (`"120"`) and an HTTP-date. Returns `undefined` when absent/unparseable, and
 * never returns a negative delay.
 *
 * @param now - Reference time (ms since epoch) used for HTTP-date math; defaults
 *   to `Date.now()` and is injectable for deterministic tests.
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;

  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  return Math.max(0, dateMs - now);
}

/** Base unit (ms) for exponential backoff: attempt 0 -> 500ms, 1 -> 1000ms, ... */
const BACKOFF_BASE_MS = 500;

/**
 * Delay (ms) before the next retry attempt. When the server provided a
 * `Retry-After` value (`retryAfterMs`), that is honored; otherwise the SDK uses
 * exponential backoff `2 ** attempt * 500`.
 */
export function computeBackoffDelay(
  attempt: number,
  retryAfterMs?: number,
): number {
  if (typeof retryAfterMs === 'number' && retryAfterMs >= 0) {
    return retryAfterMs;
  }
  return 2 ** attempt * BACKOFF_BASE_MS;
}
