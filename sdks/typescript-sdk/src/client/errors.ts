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

export class AuthenticationError extends Terminal49Error {
  constructor(message: string, status = 401, details?: unknown) {
    super(message, status, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Terminal49Error {
  constructor(message: string, status = 403, details?: unknown) {
    super(message, status, details);
    this.name = 'AuthorizationError';
  }
}

export class FeatureNotEnabledError extends AuthorizationError {
  constructor(message: string, status = 403, details?: unknown) {
    super(message, status, details);
    this.name = 'FeatureNotEnabledError';
  }
}

export class NotFoundError extends Terminal49Error {
  constructor(message: string, status = 404, details?: unknown) {
    super(message, status, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Terminal49Error {
  constructor(message: string, status = 400, details?: unknown) {
    super(message, status, details);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Terminal49Error {
  constructor(message: string, status = 429, details?: unknown) {
    super(message, status, details);
    this.name = 'RateLimitError';
  }
}

export class UpstreamError extends Terminal49Error {
  constructor(message: string, status = 500, details?: unknown) {
    super(message, status, details);
    this.name = 'UpstreamError';
  }
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
