import type { Middleware, MiddlewareCallbackParams } from 'openapi-fetch';
import {
  extractErrorMessage,
  toNetworkError,
  toTerminal49Error,
} from './errors.js';
import {
  computeBackoffDelay,
  isRetryableNetworkError,
  isRetryableStatus,
  parseRetryAfterMs,
  shouldRetryRequest,
} from './retry-policy.js';

export type Interceptor = Middleware;

/** Header a caller can set to make a non-idempotent write safe to retry. */
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

export class AuthInterceptor {
  constructor(
    private apiToken: string,
    private accountId?: string,
  ) {}

  onRequest({ request }: Pick<MiddlewareCallbackParams, 'id' | 'request'>) {
    const authHeader =
      this.apiToken.startsWith('Token ') || this.apiToken.startsWith('Bearer ')
        ? this.apiToken
        : `Token ${this.apiToken}`;
    request.headers.set('Authorization', authHeader);
    if (this.accountId) {
      request.headers.set('x-account-id', this.accountId);
    }
    request.headers.set('Accept', 'application/json');
    if (request.body && !request.headers.has('Content-Type')) {
      request.headers.set('Content-Type', 'application/json');
    }
    return request;
  }
}

/**
 * Retries transient failures with backoff. Two kinds of failure are handled:
 *
 *  - A response with a retryable status (429 / 5xx), handled in `onResponse`.
 *  - A thrown transport error (DNS/connection/"fetch failed"), handled in
 *    `onError` — these never reach `onResponse` because `fetch` rejected.
 *
 * Retries are gated by {@link shouldRetryRequest}: idempotent methods are always
 * eligible, but non-idempotent writes are only retried when the caller supplied
 * an `Idempotency-Key` header. 429 backoff honors the server's `Retry-After`.
 */
export class RetryInterceptor {
  private replayableRequests = new Map<Request | string, Request>();

  constructor(
    private maxRetries: number,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  onRequest({ request, id }: Pick<MiddlewareCallbackParams, 'id' | 'request'>) {
    try {
      this.replayableRequests.set(
        this.requestKey(request, id),
        request.clone(),
      );
    } catch {
      this.replayableRequests.delete(this.requestKey(request, id));
    }
    return request;
  }

  async onResponse({
    request,
    response,
    id,
  }: Pick<MiddlewareCallbackParams, 'id' | 'request'> & {
    response: Response;
  }): Promise<Response> {
    const requestKey = this.requestKey(request, id);
    const replayableRequest = this.replayableRequests.get(requestKey);
    let currentResponse = response;
    let attempt = 0;

    try {
      while (
        replayableRequest &&
        isRetryableStatus(currentResponse.status) &&
        this.isRetryable(replayableRequest) &&
        attempt < this.maxRetries
      ) {
        const retryAfterMs = parseRetryAfterMs(
          currentResponse.headers.get('Retry-After'),
        );
        await this.sleep(computeBackoffDelay(attempt, retryAfterMs));

        currentResponse = await this.fetchImpl(replayableRequest.clone());
        attempt++;
      }

      return currentResponse;
    } finally {
      this.replayableRequests.delete(requestKey);
    }
  }

  /**
   * Recover from a thrown transport error by retrying eligible requests. If a
   * retry produces a response we return it (openapi-fetch then runs the normal
   * `onResponse` chain on it); otherwise we surface a normalized
   * {@link NetworkError} so error mapping is consistent with the response path.
   */
  async onError({
    request,
    error,
    id,
  }: Pick<MiddlewareCallbackParams, 'id' | 'request'> & {
    error: unknown;
  }): Promise<Response | Error> {
    const requestKey = this.requestKey(request, id);
    const replayableRequest = this.replayableRequests.get(requestKey);

    try {
      if (
        replayableRequest &&
        isRetryableNetworkError(error) &&
        this.isRetryable(replayableRequest)
      ) {
        let attempt = 0;
        while (attempt < this.maxRetries) {
          await this.sleep(computeBackoffDelay(attempt));
          try {
            return await this.fetchImpl(replayableRequest.clone());
          } catch (retryError) {
            attempt++;
            if (attempt >= this.maxRetries) {
              return toNetworkError(retryError);
            }
          }
        }
      }

      return toNetworkError(error);
    } finally {
      this.replayableRequests.delete(requestKey);
    }
  }

  private isRetryable(request: Request): boolean {
    return shouldRetryRequest({
      method: request.method,
      hasIdempotencyKey: request.headers.has(IDEMPOTENCY_KEY_HEADER),
    });
  }

  private sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private requestKey(request: Request, id?: string) {
    return id ?? request;
  }
}

export class ErrorMappingInterceptor {
  async onResponse({
    response,
  }: Pick<MiddlewareCallbackParams, 'id' | 'request'> & {
    response: Response;
  }): Promise<Response> {
    if (response.ok) {
      return response;
    }

    let errorBody: any = null;
    try {
      errorBody = await response.clone().json();
    } catch {
      // Ignore
    }

    throw toTerminal49Error(
      response.status,
      extractErrorMessage(errorBody),
      errorBody,
    );
  }
}
