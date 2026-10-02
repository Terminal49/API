/**
 * search_docs tool
 * Searches the public Terminal49 documentation (terminal49.com/docs) by forwarding the
 * query to the MCP server Mintlify hosts for those docs, so results always match what is live.
 */

import { z } from 'zod';

export const MINTLIFY_DOCS_MCP_URL = 'https://terminal49.mintlify.app/mcp';
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

export async function executeSearchDocs(
  args: { query: string; limit?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<SearchDocsResponse> {
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
      params: { name: MINTLIFY_SEARCH_TOOL, arguments: { query: args.query } },
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

  const results = (message.result?.content ?? [])
    .flatMap((item) => (item.type === 'text' && item.text ? [item.text] : []))
    .map(parseResult)
    .filter((result): result is DocsResult => result !== null)
    .slice(0, args.limit ?? 5);

  return { query: args.query, total_results: results.length, results };
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
  if (!title || !url?.startsWith('https://terminal49.com/docs')) return null;
  const content = text.split(/^Content: /m)[1]?.trim() ?? '';
  return {
    title,
    url,
    page: field('Page') ?? '',
    content:
      content.length > MAX_CONTENT_CHARS
        ? `${content.slice(0, MAX_CONTENT_CHARS)}…`
        : content,
  };
}
