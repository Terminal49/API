/** Read an existing Rails v2 endpoint with the caller's own credentials. */
export type QueryArgs = {
  path: string;
  params?: Record<string, string | string[]>;
};

const MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_PARAMS = 30;

export function buildQueryUrl(baseUrl: string, args: QueryArgs): URL {
  const base = new URL(`${baseUrl.replace(/\/+$/, '')}/`);
  if (
    base.protocol !== 'https:' &&
    base.hostname !== 'localhost' &&
    base.hostname !== '127.0.0.1'
  ) {
    throw new Error('The configured API origin must use HTTPS.');
  }
  if (!base.pathname.endsWith('/v2/')) {
    throw new Error('The configured API base URL must end in /v2.');
  }
  const path = args.path;
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('?') ||
    path.includes('#') ||
    path.includes('\\')
  ) {
    throw new Error('Pass a Rails v2 path without a query string or fragment.');
  }
  const segments = path.slice(1).split('/');
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /%2f|%5c|%2e|%00/i.test(segment),
    )
  ) {
    throw new Error('The path contains an invalid segment.');
  }
  const url = new URL(segments.join('/'), base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
    throw new Error('The path must remain within the Rails v2 API.');
  }
  const params = args.params ?? {};
  if (Object.keys(params).length > MAX_PARAMS) {
    throw new Error('Too many query parameters.');
  }
  for (const [key, values] of Object.entries(params)) {
    if (!key || key.length > 100 || /[\u0000-\u001f]/.test(key)) {
      throw new Error('Invalid query parameter name.');
    }
    for (const value of Array.isArray(values) ? values : [values]) {
      if (value.length > 512)
        throw new Error('Query parameter value is too long.');
      url.searchParams.append(key, value);
    }
  }
  return url;
}

export async function executeQuery(
  args: QueryArgs,
  auth: { apiToken: string; accountId?: string; apiBaseUrl?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ path: string; status: number; body: unknown }> {
  const url = buildQueryUrl(
    auth.apiBaseUrl || 'https://api.terminal49.com/v2',
    args,
  );
  const authorization = /^(Token|Bearer) /i.test(auth.apiToken)
    ? auth.apiToken
    : `Token ${auth.apiToken}`;
  const headers: Record<string, string> = {
    Authorization: authorization,
    Accept: 'application/json',
  };
  if (auth.accountId) headers['x-account-id'] = auth.accountId;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Rails returned an empty response.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        throw new Error(
          'Rails response is too large; request a smaller page or fewer includes.',
        );
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bodyText = Buffer.concat(chunks).toString('utf8');
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error('Rails did not return JSON.');
  }
  return {
    path: `${url.pathname}${url.search}`,
    status: response.status,
    body,
  };
}
