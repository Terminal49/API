/**
 * Read a successful response body without silently discarding it.
 *
 * The previous behavior parsed JSON and, on any failure, returned `undefined` —
 * which meant a 200 with a non-JSON or unexpected body looked identical to an
 * empty body to the caller. This instead:
 *
 *  - returns `undefined` only for a genuinely empty body (204 / empty text);
 *  - returns parsed JSON when the body is JSON;
 *  - returns the raw text when the body is present but not JSON, so a non-JSON
 *    success body is surfaced rather than swallowed.
 */
export async function readSuccessBody<T = unknown>(
  response: Response,
): Promise<T | string | undefined> {
  if (response.status === 204) return undefined;

  const text = await response.clone().text();
  if (text === '') return undefined;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text;
  }
}
