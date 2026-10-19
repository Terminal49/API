/**
 * Removes signed URLs, such as a document's presigned download URL, from text
 * and payloads before they reach logs, Sentry or PostHog. Anyone who holds a
 * signed URL can download the file until it expires.
 */

export const REDACTED_URL = '[REDACTED_URL]';

const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>\\]+/gi;

/** Query parameters that S3, Google Cloud Storage, Azure and CloudFront sign with. */
const SIGNED_QUERY_PARAMETER =
  /[?&](?:x-amz-[a-z-]+|x-goog-[a-z-]+|signature|sig|se|sp|sv|expires|key-pair-id|policy|googleaccessid|token)=/i;

export function isSignedUrl(url: string): boolean {
  return SIGNED_QUERY_PARAMETER.test(url);
}

/** Replaces every signed URL in `text` with {@link REDACTED_URL}. */
export function redactSignedUrls(text: string): string {
  return text.replace(URL_PATTERN, (url) =>
    isSignedUrl(url) ? REDACTED_URL : url,
  );
}

/**
 * A copy of `value` with signed URLs redacted from every string in it. Only
 * arrays and plain objects are walked; other objects are returned as they are.
 */
export function redactSignedUrlsDeep<T>(value: T): T {
  if (typeof value === 'string') {
    // SAFETY: a string input yields a string output.
    return redactSignedUrls(value) as T;
  }
  if (Array.isArray(value)) {
    // SAFETY: mapping an array element-wise keeps its type.
    return value.map((item) => redactSignedUrlsDeep(item)) as T;
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
        redactSignedUrlsDeep(nested),
      ]),
    ) as T;
  }
  return value;
}
