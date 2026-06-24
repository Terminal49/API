/** Base error for all Terminal49 API errors. Subclassed by status-specific errors. */
export class Terminal49Error extends Error {
  status?: number;
  details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'Terminal49Error';
    this.status = status;
    this.details = details;
  }
}

/** Thrown when the API token is invalid or missing (HTTP 401). */
export class AuthenticationError extends Terminal49Error {
  constructor(message: string, status = 401, details?: unknown) {
    super(message, status, details);
    this.name = 'AuthenticationError';
  }
}

/** Thrown when the API token is valid but lacks permission for the request (HTTP 403). */
export class AuthorizationError extends Terminal49Error {
  constructor(message: string, status = 403, details?: unknown) {
    super(message, status, details);
    this.name = 'AuthorizationError';
  }
}

/** Thrown when the requested feature requires a plan upgrade (HTTP 403). */
export class FeatureNotEnabledError extends AuthorizationError {
  constructor(message: string, status = 403, details?: unknown) {
    super(message, status, details);
    this.name = 'FeatureNotEnabledError';
  }
}

/** Thrown when the requested resource does not exist (HTTP 404). */
export class NotFoundError extends Terminal49Error {
  constructor(message: string, status = 404, details?: unknown) {
    super(message, status, details);
    this.name = 'NotFoundError';
  }
}

/** Thrown when the request payload fails server-side validation (HTTP 400/422). */
export class ValidationError extends Terminal49Error {
  constructor(message: string, status = 400, details?: unknown) {
    super(message, status, details);
    this.name = 'ValidationError';
  }
}

/** Thrown when the API rate limit has been exceeded (HTTP 429). The SDK retries automatically. */
export class RateLimitError extends Terminal49Error {
  constructor(message: string, status = 429, details?: unknown) {
    super(message, status, details);
    this.name = 'RateLimitError';
  }
}

/** Thrown when the carrier or terminal upstream API is unavailable (HTTP 5xx). */
export class UpstreamError extends Terminal49Error {
  constructor(message: string, status = 500, details?: unknown) {
    super(message, status, details);
    this.name = 'UpstreamError';
  }
}

/**
 * Thrown when a transport-level failure occurs before a response is received —
 * a DNS failure, a refused/reset connection, or an otherwise failed `fetch`.
 * Has no HTTP status because no response was produced.
 */
export class NetworkError extends Terminal49Error {
  constructor(message: string, details?: unknown) {
    super(message, undefined, details);
    this.name = 'NetworkError';
  }
}

/**
 * Thrown when a request exceeds the configured request timeout and is aborted
 * by the SDK. Has no HTTP status because no response was produced.
 */
export class TimeoutError extends Terminal49Error {
  constructor(message = 'Request timed out', details?: unknown) {
    super(message, undefined, details);
    this.name = 'TimeoutError';
  }
}

/**
 * Normalize a thrown transport error (from `fetch`) into a {@link Terminal49Error}.
 * A pre-existing `Terminal49Error` (e.g. our own {@link TimeoutError}) is passed
 * through unchanged; everything else becomes a {@link NetworkError}.
 */
export function toNetworkError(error: unknown): Terminal49Error {
  if (error instanceof Terminal49Error) return error;
  const message =
    error instanceof Error ? error.message : 'Network request failed';
  return new NetworkError(`Network request failed: ${message}`, error);
}

export function extractErrorMessage(body: any): string {
  if (typeof body === 'string') {
    return body;
  }

  if (body?.error && typeof body.error === 'string') {
    return body.error;
  }

  if (typeof body?.errors === 'string') {
    return body.errors;
  }

  if (body?.errors && Array.isArray(body.errors) && body.errors.length > 0) {
    return body.errors
      .map((error: any) => {
        const detail = error.detail;
        const title = error.title;
        const code = error.code;
        const pointer = error.source?.pointer;
        let msg = detail || title || code || 'Unknown error';
        if (pointer) msg += ` (${pointer})`;
        return msg;
      })
      .join('; ');
  }

  if (body?.message) {
    return body.message;
  }

  if (body?.detail && typeof body.detail === 'string') {
    return body.detail;
  }

  return 'Unknown error';
}

export function toTerminal49Error(
  status: number,
  message: string,
  details?: unknown,
): Terminal49Error {
  switch (status) {
    case 400:
      return new ValidationError(message, status, details);
    case 401:
      return new AuthenticationError(
        'Invalid or missing API token',
        status,
        details,
      );
    case 403: {
      const normalized = message || 'Access forbidden';
      const featureNotEnabled = /not enabled|feature/i.test(normalized);
      return featureNotEnabled
        ? new FeatureNotEnabledError(normalized, status, details)
        : new AuthorizationError(normalized, status, details);
    }
    case 404:
      return new NotFoundError(
        message || 'Resource not found',
        status,
        details,
      );
    case 422:
      return new ValidationError(message, status, details);
    case 429:
      return new RateLimitError(
        message || 'Rate limit exceeded',
        status,
        details,
      );
    case 500:
    case 502:
    case 503:
    case 504:
      return new UpstreamError(
        message || `Upstream server error (${status})`,
        status,
        details,
      );
    default:
      return new Terminal49Error(
        `Unexpected response status: ${status}${message ? ` - ${message}` : ''}`,
        status,
        details,
      );
  }
}
