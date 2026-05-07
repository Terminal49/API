import { extractErrorMessage, toTerminal49Error } from './errors.js';

export interface Interceptor {
  onRequest?(options: { request: Request; schemaPath: string; params: Record<string, unknown> }): Request | undefined | Promise<Request | undefined>;
  onResponse?(options: { request: Request; response: Response; schemaPath: string; params: Record<string, unknown> }): Response | undefined | Promise<Response | undefined>;
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
  constructor(
    private maxRetries: number,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async onResponse({ request, response }: { request: Request; response: Response }): Promise<Response> {
    let currentResponse = response;
    let attempt = 0;

    while (
      (currentResponse.status === 429 || currentResponse.status >= 500) &&
      attempt < this.maxRetries
    ) {
      const delay = 2 ** attempt * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
      
      currentResponse = await this.fetchImpl(request.clone());
      attempt++;
    }

    return currentResponse;
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
