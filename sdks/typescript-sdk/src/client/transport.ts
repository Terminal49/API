import { randomUUID } from 'node:crypto';
import createClient, {
  type FetchResponse,
  type MiddlewareCallbackParams,
} from 'openapi-fetch';
import type { paths } from '../generated/terminal49.js';
import { readSuccessBody } from './body.js';
import { toNetworkError } from './errors.js';
import {
  AuthInterceptor,
  ErrorMappingInterceptor,
  type Interceptor,
  RetryInterceptor,
} from './interceptors.js';
import { withTimeout } from './timeout.js';

/** Default per-request timeout (ms) applied when the caller does not override it. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export interface TransportConfig {
  apiToken: string;
  accountId?: string;
  baseUrl: string;
  maxRetries?: number;
  /**
   * Per-request timeout in milliseconds. Defaults to
   * {@link DEFAULT_REQUEST_TIMEOUT_MS}. Set to `0` to disable the timeout.
   */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type ApiClient = ReturnType<typeof createClient<paths>>;

export class Transport {
  private apiToken: string;
  private accountId?: string;
  public baseUrl: string;
  private maxRetries: number;
  /** Timeout-wrapped fetch used for both the typed client and manual requests. */
  private fetchImpl: typeof fetch;
  public client: ApiClient;

  constructor(config: TransportConfig) {
    this.apiToken = config.apiToken;
    this.accountId = config.accountId;
    this.baseUrl = config.baseUrl;
    this.maxRetries = config.maxRetries ?? 2;

    const baseFetch = config.fetchImpl ?? fetch;
    const timeoutMs = config.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    // Every request is bounded by an AbortController-based timeout so a hung
    // upstream cannot wedge a caller forever. Applied once here so it covers
    // both the openapi-fetch client and the manual `executeManual` path.
    this.fetchImpl = withTimeout(baseFetch, timeoutMs);

    this.client = createClient<paths>({
      baseUrl: this.baseUrl,
      fetch: this.fetchImpl,
    });

    // Interceptor registration order is load-bearing. openapi-fetch runs
    // `onRequest` in registration order but `onResponse`/`onError` in REVERSE
    // order. Registering Retry LAST means that on the response/error pass it
    // runs BEFORE error-mapping — so transient 429/5xx and network failures get
    // a chance to retry before ErrorMapping would otherwise throw on them.
    this.client.use(new AuthInterceptor(this.apiToken, this.accountId));
    this.client.use(new ErrorMappingInterceptor());
    this.client.use(new RetryInterceptor(this.maxRetries, this.fetchImpl));
  }

  public use(interceptor: Interceptor) {
    this.client.use(interceptor);
  }

  public async execute<T = any>(
    fn: () => Promise<FetchResponse<any, any, any>>,
  ): Promise<T> {
    const { data } = await fn();
    return data as T;
  }

  /**
   * Run a request that has no entry in the generated OpenAPI types (currently
   * only `search()`) through the same Auth -> Retry -> ErrorMapping pipeline the
   * typed client uses, including the timeout-wrapped fetch. Successful bodies are
   * read with {@link readSuccessBody} so a non-JSON success body is surfaced
   * rather than silently collapsed to `undefined`.
   */
  public async executeManual<T = any>(
    input: Request | URL | string,
    init?: RequestInit,
  ): Promise<T> {
    const req = new Request(input, init);
    const auth = new AuthInterceptor(this.apiToken, this.accountId);
    const retry = new RetryInterceptor(this.maxRetries, this.fetchImpl);
    const errorMap = new ErrorMappingInterceptor();

    const middlewareContext = this.manualMiddlewareContext(req);
    const authedReq = auth.onRequest(middlewareContext) || req;
    const retryContext = this.manualMiddlewareContext(authedReq);
    const retryableReq = retry.onRequest(retryContext);

    let res: Response;
    try {
      res = await this.fetchImpl(retryableReq.clone());
    } catch (error) {
      // Mirror openapi-fetch's onError contract: a recovered Response is used,
      // otherwise the normalized error is thrown.
      const recovered = await retry.onError({
        request: retryableReq,
        error,
        id: retryContext.id,
      });
      if (recovered instanceof Response) {
        res = recovered;
      } else {
        throw recovered instanceof Error ? recovered : toNetworkError(error);
      }
    }

    res = await retry.onResponse({
      request: retryableReq,
      response: res,
      id: retryContext.id,
    });
    await errorMap.onResponse({
      request: retryableReq,
      response: res,
      id: retryContext.id,
    });

    return (await readSuccessBody<T>(res)) as T;
  }

  private manualMiddlewareContext(
    request: Request,
  ): Pick<MiddlewareCallbackParams, 'id' | 'request'> {
    return {
      request,
      id: `manual:${randomUUID()}`,
    };
  }
}
