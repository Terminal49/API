import { extractErrorMessage, toTerminal49Error } from './errors.js';

export interface Interceptor {
  onRequest?(options: {
    request: Request;
    schemaPath: string;
    params: Record<string, unknown>;
    id?: string;
  }): Request | undefined | Promise<Request | undefined>;
  onResponse?(options: {
    request: Request;
    response: Response;
    schemaPath: string;
    params: Record<string, unknown>;
    id?: string;
  }): Response | undefined | Promise<Response | undefined>;
}

export class AuthInterceptor implements Interceptor {
  constructor(private apiToken: string) {}

  onRequest({ request }: { request: Request }) {
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

export class RetryInterceptor implements Interceptor {
  private replayableRequests = new Map<Request | string, Request>();

  constructor(
    private maxRetries: number,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  onRequest({ request, id }: { request: Request; id?: string }) {
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
  }: {
    request: Request;
    response: Response;
    id?: string;
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

  private requestKey(request: Request, id?: string) {
    return id ?? request;
  }
}

export class ErrorMappingInterceptor implements Interceptor {
  async onResponse({ response }: { response: Response }): Promise<Response> {
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
