import { Terminal49Client } from '@terminal49/sdk';

export interface FakeResponse {
  status?: number;
  body?: unknown;
}

export interface FakeRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export type FakeRoutes = Record<
  string,
  FakeResponse | ((request: FakeRequest) => FakeResponse)
>;

/**
 * A fetch that answers Terminal49 API requests from `routes`, keyed by
 * method and path without the /v2 prefix, for example `GET /ports/{id}` with
 * the id filled in. An unknown route answers 404.
 */
export function fakeApiFetch(routes: FakeRoutes) {
  const requests: FakeRequest[] = [];
  const fetch = async (
    input: Request | URL | string,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const recorded: FakeRequest = {
      method: request.method,
      path: url.pathname.replace(/^\/v2/, ''),
      query: url.searchParams,
      body: text ? JSON.parse(text) : undefined,
    };
    requests.push(recorded);
    const route = routes[`${recorded.method} ${recorded.path}`];
    const response =
      typeof route === 'function'
        ? route(recorded)
        : (route ?? { status: 404 });
    const status = response.status ?? 200;
    return new Response(
      JSON.stringify(
        response.body ??
          (status >= 400 ? { errors: [{ status: String(status) }] } : {}),
      ),
      { status, headers: { 'Content-Type': 'application/vnd.api+json' } },
    );
  };
  return { fetch, requests };
}

/** A real SDK client whose requests are answered by {@link fakeApiFetch}. */
export function fakeApiClient(routes: FakeRoutes) {
  const { fetch, requests } = fakeApiFetch(routes);
  const client = new Terminal49Client({
    apiToken: 'TEST_KEY',
    apiBaseUrl: 'https://api.test/v2',
    maxRetries: 0,
    fetchImpl: fetch,
  });
  return { client, requests };
}
