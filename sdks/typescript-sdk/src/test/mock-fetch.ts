export function jsonResponse(
  body: any,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  });
}

export function createMockFetch(
  handlers: Record<string, (init?: RequestInit, url?: URL) => Response>,
) {
  const calls: Array<{ init?: RequestInit; url: URL }> = [];

  const fetchImpl = async (
    input: Request | URL | string,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request ? input : undefined;
    const urlString =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (request?.url ?? '');

    const url = new URL(urlString);
    const derivedBody =
      init && 'body' in init
        ? init.body
        : request
          ? await request.clone().text()
          : undefined;
    const effectiveInit: RequestInit | undefined =
      init || request
        ? {
            ...init,
            method: init?.method || request?.method,
            headers: init?.headers || request?.headers,
            body: derivedBody,
          }
        : undefined;

    const searchParams = new URLSearchParams(url.search);
    const search = searchParams.toString()
      ? `?${[...searchParams.entries()].map(([k, v]) => `${k}=${v}`).join('&')}`
      : '';
    const relative = url.pathname.replace('/v2', '') + search;

    const handler = handlers[relative];
    if (!handler) {
      throw new Error(`No handler for ${relative}`);
    }

    calls.push({ init: effectiveInit, url });
    return handler(effectiveInit, url);
  };

  return { fetchImpl, calls };
}
