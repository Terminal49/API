import { describe, expect, it, vi } from 'vite-plus/test';
import { executeSearchDocs, MINTLIFY_DOCS_MCP_URL } from './search-docs.js';

function sse(result: unknown): string {
  return `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result })}\n\n`;
}

function textResult(
  title: string,
  link: string,
  page: string,
  content: string,
) {
  return {
    type: 'text',
    text: `Title: ${title}\nLink: ${link}\nPage: ${page}\nContent: ${content}`,
  };
}

describe('executeSearchDocs', () => {
  it('forwards the query to the Mintlify docs MCP and parses results', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          sse({
            content: [
              textResult(
                'Set up webhooks',
                'https://terminal49.com/docs/api-docs/in-depth-guides/webhooks',
                'api-docs/in-depth-guides/webhooks',
                'This guide shows how to configure a webhook consumer.',
              ),
              textResult(
                'Elsewhere',
                'https://example.com/page',
                'x',
                'not ours',
              ),
            ],
          }),
        ),
    );

    const result = await executeSearchDocs(
      { query: 'webhooks' },
      fetchImpl as typeof fetch,
    );

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(MINTLIFY_DOCS_MCP_URL);
    expect(JSON.parse(init.body as string).params).toEqual({
      name: 'search_terminal49',
      arguments: { query: 'webhooks' },
    });
    expect(result).toEqual({
      query: 'webhooks',
      total_results: 1,
      results: [
        {
          title: 'Set up webhooks',
          url: 'https://terminal49.com/docs/api-docs/in-depth-guides/webhooks',
          page: 'api-docs/in-depth-guides/webhooks',
          content: 'This guide shows how to configure a webhook consumer.',
        },
      ],
    });
  });

  it('applies the limit and truncates long excerpts', async () => {
    const many = Array.from({ length: 4 }, (_, i) =>
      textResult(
        `T${i}`,
        `https://terminal49.com/docs/p${i}`,
        `p${i}`,
        'x'.repeat(2_000),
      ),
    );
    const fetchImpl = vi.fn(async () => new Response(sse({ content: many })));

    const result = await executeSearchDocs(
      { query: 'q', limit: 2 },
      fetchImpl as typeof fetch,
    );

    expect(result.total_results).toBe(2);
    expect(result.results[0].content.length).toBe(1_201);
  });

  it('throws on upstream HTTP and tool errors', async () => {
    const httpError = vi.fn(async () => new Response('nope', { status: 502 }));
    await expect(
      executeSearchDocs({ query: 'q' }, httpError as typeof fetch),
    ).rejects.toThrow('HTTP 502');

    const toolError = vi.fn(
      async () => new Response(sse({ content: [], isError: true })),
    );
    await expect(
      executeSearchDocs({ query: 'q' }, toolError as typeof fetch),
    ).rejects.toThrow('returned an error');
  });
});
