import createClient, { type FetchResponse } from 'openapi-fetch';
import type { paths } from '../generated/terminal49.js';
import {
  AuthInterceptor,
  ErrorMappingInterceptor,
  type Interceptor,
  RetryInterceptor,
} from './interceptors.js';

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
      fetch: this.fetchImpl,
    });

    // Register built-in middlewares
    this.client.use(new AuthInterceptor(this.apiToken) as any);
    this.client.use(new ErrorMappingInterceptor() as any);
    this.client.use(
      new RetryInterceptor(this.maxRetries, this.fetchImpl) as any,
    );
  }

  public use(interceptor: Interceptor) {
    this.client.use(interceptor as any);
  }

  public async execute<T = any>(
    fn: () => Promise<FetchResponse<any, any, any>>,
  ): Promise<T> {
    const { data } = await fn();
    return data as T;
  }

  public async executeManual<T = any>(
    input: Request | URL | string,
    init?: RequestInit,
  ): Promise<T> {
    // This goes through the raw fetchImpl, bypassing openapi-fetch middleware for now,
    // or we could construct a Request and run it through the middleware manually.
    // For search(), which is the only user, we'll just run it directly.
    const req = new Request(input, init);
    const auth = new AuthInterceptor(this.apiToken);
    const retry = new RetryInterceptor(this.maxRetries, this.fetchImpl);
    const errorMap = new ErrorMappingInterceptor();

    const authedReq = auth.onRequest({ request: req } as any) || req;
    const retryableReq = retry.onRequest({ request: authedReq } as any);
    let res = await this.fetchImpl(retryableReq);
    res = await retry.onResponse({
      request: retryableReq,
      response: res,
    } as any);
    await errorMap.onResponse({ response: res } as any);

    try {
      return (await res.clone().json()) as T;
    } catch {
      return undefined as any;
    }
  }
}
