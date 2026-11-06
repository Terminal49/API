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
