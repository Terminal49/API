import type { Middleware, MiddlewareCallbackParams } from 'openapi-fetch';
import { extractErrorMessage, toTerminal49Error } from './errors.js';

export type Interceptor = Middleware;

export class AuthInterceptor {
  constructor(private apiToken: string) {}

  onRequest({ request }: Pick<MiddlewareCallbackParams, 'id' | 'request'>) {
    const authHeader = this.apiToken.startsWith('Token ')
      ? this.apiToken
      : `Token ${this.apiToken}`;
    request.headers.set('Authorization', authHeader);
    request.headers.set('Accept', 'application/json');
    if (request.body && !request.headers.has('Content-Type')) {
      request.headers.set('Content-Type', 'application/json');
    }
    return request;
  }
}

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
        (currentResponse.status === 429 || currentResponse.status >= 500) &&
        attempt < this.maxRetries
      ) {
        const delay = 2 ** attempt * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));

        currentResponse = await this.fetchImpl(replayableRequest.clone());
        attempt++;
      }

      return currentResponse;
    } finally {
      this.replayableRequests.delete(requestKey);
    }
  }

  onError({
    request,
    id,
  }: Pick<MiddlewareCallbackParams, 'id' | 'request'> & {
    error: unknown;
  }) {
    this.replayableRequests.delete(this.requestKey(request, id));
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
