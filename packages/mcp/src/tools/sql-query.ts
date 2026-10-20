import { createHash } from 'node:crypto';
import {
  NetworkError,
  RateLimitError,
  Terminal49Client,
  Terminal49Error,
  TimeoutError,
  UpstreamError,
  type AssistantQueryPreview,
} from '@terminal49/sdk';

/**
 * SQL analysis over the account's read-only `assistant_*` views, served by the
 * Terminal49 API to signed-in users of accounts with assistant SQL. The API
 * authorizes every call; this module only decides when to list the tools and
 * how to report their failures.
 */

export const SQL_TOOL_NAMES = [
  'sql_query',
  'describe_views',
  'query_guide',
  'get_query_result',
] as const;

export function isSqlTool(toolName: string): boolean {
  return SQL_TOOL_NAMES.some((name) => name === toolName);
}

/** A hash of the caller's credentials and account, so no token is held as a key. */
export function sqlScope(
  apiToken: string,
  apiBaseUrl: string | undefined,
  accountId: string | undefined,
): string {
  return createHash('sha256')
    .update(JSON.stringify([apiBaseUrl ?? '', accountId ?? '', apiToken]))
    .digest('hex');
}

/**
 * The SQL tools' client never retries: a retried query can run twice, and a
 * rate limit must stop the turn rather than be retried around.
 */
export function createSqlClient(
  apiToken: string,
  apiBaseUrl: string | undefined,
  accountId: string | undefined,
): Terminal49Client {
  return new Terminal49Client({
    apiToken,
    apiBaseUrl,
    accountId,
    maxRetries: 0,
  });
}

// Share only concurrent work, never completed results: a model that sends the
// same query twice in parallel runs it once. Each caller gets its own copy.
const pendingQueries = new Map<string, Promise<AssistantQueryPreview>>();

export async function executeSqlQuery(
  { sql }: { sql: string },
  client: Pick<Terminal49Client, 'assistantQueries'>,
  scope: string,
): Promise<AssistantQueryPreview> {
  const key = createHash('sha256')
    .update(JSON.stringify([scope, sql]))
    .digest('hex');
  let request = pendingQueries.get(key);
  if (!request) {
    request = client.assistantQueries
      .query(sql)
      .finally(() => pendingQueries.delete(key));
    pendingQueries.set(key, request);
  }
  return structuredClone(await request);
}

export function executeDescribeViews(
  {
    view,
    columns,
    search,
  }: { view: string | null; columns: string[] | null; search: string | null },
  client: Pick<Terminal49Client, 'assistantQueries'>,
) {
  return view
    ? client.assistantQueries.view(
        view,
        columns ?? undefined,
        search ?? undefined,
      )
    : client.assistantQueries.views();
}

export function executeQueryGuide(
  { topic }: { topic: string | null },
  client: Pick<Terminal49Client, 'assistantQueries'>,
) {
  return topic
    ? client.assistantQueries.guide(topic)
    : client.assistantQueries.guides();
}

export function executeGetQueryResult(
  {
    result_id,
    offset,
    limit,
  }: { result_id: string; offset: number; limit: number },
  client: Pick<Terminal49Client, 'assistantQueries'>,
) {
  return client.assistantQueries.result(result_id, offset, limit);
}

/**
 * The text a failed SQL tool call returns. The API writes its 404, 409, 422
 * and 503 messages for the model (an unknown guide topic lists the available
 * ones, a rejected query says why), so they pass through. Other failures get
 * fixed text, so upstream detail never reaches the client.
 */
export function formatSqlToolError(error: unknown): string {
  const status = error instanceof Terminal49Error ? error.status : undefined;
  const apiMessage =
    error instanceof Terminal49Error &&
    error.message &&
    error.message !== 'Unknown error'
      ? error.message
      : undefined;
  switch (status) {
    case 400:
      return 'Invalid SQL tool request or missing account context. Check the arguments and reconnect with an active account.';
    case 401:
      return 'SQL tools need a signed-in Terminal49 user. API keys are not supported.';
    case 403:
      return 'SQL access is not enabled for this user and account.';
    case 404:
      return (
        apiMessage ??
        'Not found, or the stored result expired. Check the view or topic name, or run the query again.'
      );
    case 409:
      return (
        apiMessage ??
        'Access to this stored result changed. Run the query again under your current access.'
      );
    case 422:
      return (
        apiMessage ?? 'Invalid query. Check the schema and revise the query.'
      );
    case 429: {
      const details =
        error instanceof Terminal49Error ? error.details : undefined;
      const wait =
        details && typeof details === 'object' && 'retry_after' in details
          ? details.retry_after
          : undefined;
      const after =
        typeof wait === 'number' ? ` Retry after ${wait} seconds.` : '';
      return `Rate limited.${after} Explain the wait and stop querying this turn; do not retry or switch tools to get around the limit.`;
    }
    case 503:
      if (apiMessage) {
        return `${apiMessage} Stop querying this turn; do not rewrite or immediately retry the query.`;
      }
      break;
  }
  return 'The query service failed. This is not evidence of invalid SQL. Stop querying this turn; do not rewrite or immediately retry the query.';
}

const DISCOVERY_TTL_MS = 60_000;
const DISCOVERY_MAX_ENTRIES = 1_000;
const discoveryCache = new Map<
  string,
  { expiresAt: number; decision: Promise<boolean> }
>();

// A transient failure says nothing about access. The API authorizes every SQL
// call, so keeping the tools listed is safe and avoids "unknown tool" errors
// partway through a conversation.
function isTransientDiscoveryError(error: unknown): boolean {
  return (
    error instanceof UpstreamError ||
    error instanceof RateLimitError ||
    error instanceof NetworkError ||
    error instanceof TimeoutError
  );
}

async function probeAssistantSql(
  apiToken: string,
  apiBaseUrl: string | undefined,
  accountId: string,
): Promise<boolean> {
  const client = new Terminal49Client({
    apiToken,
    apiBaseUrl,
    accountId,
    maxRetries: 0,
    timeoutMs: 5000,
  });
  const result = await client.assistantQueries.views();
  return Array.isArray(result.views);
}

/**
 * Whether this credential and account may use the SQL tools, read from the
 * same endpoint and authorization the tools use. Decisions are cached for a
 * minute per credential, account and API base. A denial (401, 403, 404 or a
 * malformed response) hides the tools; a transient failure keeps them listed
 * and is not cached.
 */
export function discoverAssistantSql(
  apiToken: string,
  apiBaseUrl: string | undefined,
  accountId: string | undefined,
): Promise<boolean> {
  if (!accountId) {
    return Promise.resolve(false);
  }
  const key = sqlScope(apiToken, apiBaseUrl, accountId);
  const now = Date.now();
  const cached = discoveryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.decision;
  }

  const decision: Promise<boolean> = probeAssistantSql(
    apiToken,
    apiBaseUrl,
    accountId,
  ).catch((error: unknown) => {
    if (!isTransientDiscoveryError(error)) {
      return false;
    }
    if (discoveryCache.get(key)?.decision === decision) {
      discoveryCache.delete(key);
    }
    return true;
  });

  discoveryCache.delete(key);
  if (discoveryCache.size >= DISCOVERY_MAX_ENTRIES) {
    for (const [staleKey, entry] of discoveryCache) {
      if (entry.expiresAt <= now) {
        discoveryCache.delete(staleKey);
      }
    }
    if (discoveryCache.size >= DISCOVERY_MAX_ENTRIES) {
      const oldest = discoveryCache.keys().next().value;
      if (oldest !== undefined) {
        discoveryCache.delete(oldest);
      }
    }
  }
  discoveryCache.set(key, { expiresAt: now + DISCOVERY_TTL_MS, decision });
  return decision;
}

/** Test hook: forget cached discovery decisions. */
export function resetSqlDiscoveryCache(): void {
  discoveryCache.clear();
}
