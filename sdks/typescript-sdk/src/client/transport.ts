import createClient, { type FetchResponse } from 'openapi-fetch';
import type { paths } from '../generated/terminal49.js';
import { extractErrorMessage, toTerminal49Error } from './errors.js';

export interface TransportConfig {
  apiToken: string;
  baseUrl: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export type ApiClient = ReturnType<typeof createClient<paths>>;

export class Transport {
  private apiToken: string;
  public baseUrl: string;
  private maxRetries: number;
  private fetchImpl: typeof fetch;
  public client: ApiClient;

  constructor(config: TransportConfig) {
    this.apiToken = config.apiToken;
    this.baseUrl = config.baseUrl;
    this.maxRetries = config.maxRetries ?? 2;
    this.fetchImpl = config.fetchImpl ?? fetch;

    this.client = createClient<paths>({
      baseUrl: this.baseUrl,
      fetch: this.buildFetch(this.fetchImpl),
    });
  }

  private buildFetch(fetchImpl: typeof fetch) {
    return async (
      input: Request | URL | string,
      init?: RequestInit,
    ): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const authHeader = this.apiToken.startsWith('Token ')
        ? this.apiToken
        : `Token ${this.apiToken}`;
      headers.set('Authorization', authHeader);
      headers.set('Accept', 'application/json');
      if (init?.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      return fetchImpl(input, { ...init, headers });
    };
  }

  public async execute<T = any>(
    fn: () => Promise<FetchResponse<any, any, any>>,
  ): Promise<T> {
    return this.executeWithRetry(fn, 0);
  }

  private async executeWithRetry<T = any>(
    fn: () => Promise<FetchResponse<any, any, any>>,
    attempt: number,
  ): Promise<T> {
    const { data, error, response } = await fn();

    if (data !== undefined && response?.ok !== false) {
      return data as T;
    }

    const status = response?.status ?? 500;

    if ((status === 429 || status >= 500) && attempt < this.maxRetries) {
      const delay = 2 ** attempt * 500;
      await this.sleep(delay);
      return this.executeWithRetry(fn, attempt + 1);
    }

    const errorBody = error ?? (await this.safeParse(response));
    throw toTerminal49Error(status, extractErrorMessage(errorBody), errorBody);
  }

  public async executeManual<T = any>(
    input: Request | URL | string,
    init?: RequestInit,
  ): Promise<T> {
    return this.executeWithRetry(
      async (): Promise<FetchResponse<any, any, any>> => {
        const response = await this.buildFetch(this.fetchImpl)(input, init);
        let body: any;
        try {
          body = await response.clone().json();
        } catch {}
        return {
          data: response.ok ? (body as T) : undefined,
          error: response.ok ? undefined : body,
          response,
        };
      },
      0,
    );
  }

  private async safeParse(response?: Response | null): Promise<any> {
    if (!response) return null;
    try {
      return await response.clone().json();
    } catch {
      return null;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
