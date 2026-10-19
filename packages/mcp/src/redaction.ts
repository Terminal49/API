/**
 * Removes secrets that can appear inside tool payloads, such as presigned
 * download URLs and write confirmation tokens, before text reaches logs,
 * Sentry or PostHog.
 */
import { redactSignedUrls } from './signed-urls.js';

/** Starts every confirmation token, so telemetry can find and drop them. */
export const CONFIRMATION_TOKEN_PREFIX = 't49ct1';

export const REDACTED_CONFIRMATION_TOKEN = '[REDACTED_CONFIRMATION_TOKEN]';

const CONFIRMATION_TOKEN_PATTERN = new RegExp(
  `\\b${CONFIRMATION_TOKEN_PREFIX}\\.[0-9a-z]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+`,
  'g',
);

/** Replaces signed URLs and confirmation tokens in `text`. */
export function redactSecrets(text: string): string {
  return redactSignedUrls(text).replace(
    CONFIRMATION_TOKEN_PATTERN,
    REDACTED_CONFIRMATION_TOKEN,
  );
}

/**
 * A copy of `value` with {@link redactSecrets} applied to every string in it.
 * Only arrays and plain objects are walked; other objects are returned as
 * they are.
 */
export function redactSecretsDeep<T>(value: T): T {
  if (typeof value === 'string') {
    // SAFETY: a string input yields a string output.
    return redactSecrets(value) as T;
  }
  if (Array.isArray(value)) {
    // SAFETY: mapping an array element-wise keeps its type.
    return value.map((item) => redactSecretsDeep(item)) as T;
  }
  const prototype =
    value !== null && typeof value === 'object'
      ? Object.getPrototypeOf(value)
      : undefined;
  if (prototype === Object.prototype || prototype === null) {
    // SAFETY: the copy has the same keys, with each value redacted in place.
    return Object.fromEntries(
      Object.entries(value as object).map(([key, nested]) => [
        key,
        redactSecretsDeep(nested),
      ]),
    ) as T;
  }
  return value;
}
