/**
 * search_docs tool
 * Searches the public Terminal49 documentation (terminal49.com/docs) through Mintlify, so
 * results always match what is live. With a Mintlify assistant API key it uses the documented
 * REST search API; without one it forwards to the MCP server Mintlify hosts for the docs.
 */

import { z } from 'zod';

export const MINTLIFY_DOCS_MCP_URL = 'https://terminal49.mintlify.app/mcp';
// `terminal49` is the domain identifier from terminal49.mintlify.app.
export const MINTLIFY_SEARCH_API_URL =
  'https://api.mintlify.com/discovery/v1/search/terminal49';
const DOCS_ORIGIN = 'https://terminal49.com/docs';
const MINTLIFY_SEARCH_TOOL = 'search_terminal49';
const TIMEOUT_MS = 10_000;
const MAX_CONTENT_CHARS = 1_200;

export interface DocsResult {
  title: string;
  url: string;
  page: string;
  content: string;
}

export interface SearchDocsResponse {
  query: string;
  total_results: number;
  results: DocsResult[];
}

export interface SearchDocsOptions {
  /** Mintlify assistant API key (`mint_dsc_…`). Selects the REST search API when set. */
  assistantApiKey?: string;
  fetchImpl?: typeof fetch;
}

export async function executeSearchDocs(
  args: { query: string; limit?: number },
  { assistantApiKey, fetchImpl = fetch }: SearchDocsOptions = {},
): Promise<SearchDocsResponse> {
  const limit = args.limit ?? 5;
  const results = assistantApiKey
    ? await searchViaRest(args.query, limit, assistantApiKey, fetchImpl)
    : await searchViaMcp(args.query, limit, fetchImpl);
  return { query: args.query, total_results: results.length, results };
}

async function searchViaRest(
  query: string,
  limit: number,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<DocsResult[]> {
  const response = await fetchImpl(MINTLIFY_SEARCH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, pageSize: limit }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Documentation search failed (HTTP ${response.status}).`);
  }
  return restResultsSchema
    .parse(await response.json())
    .map(restResult)
    .filter((result): result is DocsResult => result !== null)
    .slice(0, limit);
}

async function searchViaMcp(
  query: string,
  limit: number,
  fetchImpl: typeof fetch,
): Promise<DocsResult[]> {
  const response = await fetchImpl(MINTLIFY_DOCS_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: MINTLIFY_SEARCH_TOOL, arguments: { query } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Documentation search failed (HTTP ${response.status}).`);
  }

  const message = parseRpcMessage(await response.text());
  if (message.error || message.result?.isError) {
    throw new Error('Documentation search returned an error.');
  }

  return (message.result?.content ?? [])
    .flatMap((item) => (item.type === 'text' && item.text ? [item.text] : []))
    .map(parseResult)
    .filter((result): result is DocsResult => result !== null)
    .slice(0, limit);
}

const restResultsSchema = z.array(
  z.object({
    content: z.string(),
    path: z.string(),
    metadata: z.object({ title: z.string().optional() }).optional(),
  }),
);

// REST results carry a page path and the matching content; the title comes from
// metadata when present, else the section's first heading, else the path.
function restResult({
  content,
  path,
  metadata,
}: z.infer<typeof restResultsSchema>[number]): DocsResult | null {
  const url = path.startsWith('https://')
    ? path
    : `${DOCS_ORIGIN}/${path.replace(/^\/+/, '')}`;
  if (!url.startsWith(DOCS_ORIGIN)) return null;
  const heading = content.match(/^#+ (.+)$/m)?.[1]?.trim();
  return {
    title: metadata?.title || heading || path,
    url,
    page: url.slice(DOCS_ORIGIN.length + 1),
    content: truncate(content.trim()),
  };
}

const rpcMessageSchema = z.object({
  result: z
    .object({
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
      isError: z.boolean().optional(),
    })
    .optional(),
  error: z.unknown().optional(),
});

// Mintlify answers as a single-event SSE stream; plain JSON is accepted too.
function parseRpcMessage(body: string): z.infer<typeof rpcMessageSchema> {
  const data = body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('');
  return rpcMessageSchema.parse(JSON.parse(data || body));
}

// Each result is "Title: …\nLink: …\nPage: …\nContent: …".
function parseResult(text: string): DocsResult | null {
  const field = (name: string) =>
    text.match(new RegExp(`^${name}: (.*)$`, 'm'))?.[1]?.trim();
  const title = field('Title');
  const url = field('Link');
  if (!title || !url?.startsWith(DOCS_ORIGIN)) return null;
  const content = text.split(/^Content: /m)[1]?.trim() ?? '';
  return {
    title,
    url,
    page: field('Page') ?? '',
    content: truncate(content),
  };
}

function truncate(content: string): string {
  return content.length > MAX_CONTENT_CHARS
    ? `${content.slice(0, MAX_CONTENT_CHARS)}…`
    : content;
}
