export type QueryResult = {
  columns: string[];
  rows: unknown[][];
  row_count: number;
  truncated: boolean;
  row_limit: number;
};

export async function executeQuery(
  sql: string,
  apiToken: string,
  apiBaseUrl = 'https://api.terminal49.com/v2',
  accountId?: string,
): Promise<QueryResult | { error: string }> {
  const base = new URL(apiBaseUrl);
  if (!['https:', 'http:'].includes(base.protocol)) {
    throw new Error('Unsupported API URL');
  }
  const endpoint = new URL(
    `${base.pathname.replace(/\/$/, '')}/assistant_queries`,
    base.origin,
  );
  const authorization = /^(Bearer|Token)\s/i.test(apiToken)
    ? apiToken
    : `Token ${apiToken}`;
  const headers: Record<string, string> = {
    Authorization: authorization,
    'Content-Type': 'application/json',
  };
  if (accountId) headers['X-Account-ID'] = accountId;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql }),
    signal: AbortSignal.timeout(15_000),
  });
  const raw = await response.text();
  if (raw.length > 1_000_000) throw new Error('Query response is too large');
  const body: unknown = JSON.parse(raw);
  if (!response.ok) {
    const message =
      body &&
      typeof body === 'object' &&
      'error' in body &&
      typeof body.error === 'string'
        ? body.error
        : `Query request failed (${response.status})`;
    return { error: message };
  }
  return body as QueryResult;
}
