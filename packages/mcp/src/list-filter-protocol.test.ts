import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';

afterEach(() => vi.unstubAllGlobals());

it.each(['2026-07-28', '2025-11-25'])(
  'carries filters and factual pagination through the %s MCP protocol',
  async (version) => {
    const urls: URL[] = [];
    vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0]) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      urls.push(url);
      return new Response(
        JSON.stringify({
          data: [],
          links: {
            next:
              urls.length === 1
                ? 'https://api.test/v2/containers?page[number]=2'
                : null,
          },
          meta: { total: 0 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/vnd.api+json' },
        },
      );
    });
    const handler = createMcpHandler(
      () => createTerminal49McpServer('TEST_KEY', 'https://api.test'),
      { legacy: 'stateless', responseMode: 'json' },
    );
    const client = new Client(
      { name: 'filter-protocol-test', version: '1.0.0' },
      version === '2026-07-28'
        ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
        : { supportedProtocolVersions: ['2025-11-25'] },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL('https://mcp.test/mcp'),
      { fetch: (url, init) => handler.fetch(new Request(url, init)) },
    );
    try {
      await client.connect(transport);
      const args = {
        pod_code: 'USLAX',
        advanced_filters: {
          has_holds: false,
          created_at: ['>=2026-10-01', '<=2026-10-07'],
        },
        sort: 'pickup_lfd',
        page_size: 1,
      };
      const first = await client.callTool({
        name: 'list_containers',
        arguments: args,
      });
      expect(first.isError).not.toBe(true);
      expect(first.structuredContent).toMatchObject({
        items: [],
        _metadata: {
          applied_filters: {
            pod_code: 'USLAX',
            has_holds: false,
            created_at: ['>=2026-10-01', '<=2026-10-07'],
          },
          page: 1,
          page_size: 1,
          has_more: true,
          next_page: 2,
        },
      });
      expect(first.structuredContent).not.toHaveProperty('_response_contract');
      const second = await client.callTool({
        name: 'list_containers',
        arguments: { ...args, page: 2 },
      });
      expect(second.isError).not.toBe(true);
      expect(second.structuredContent).toMatchObject({
        _metadata: { page: 2, has_more: false },
      });
      expect(
        urls.map((url) => url.searchParams.get('filter[has_holds]')),
      ).toEqual(['false', 'false']);
      expect(
        urls.map((url) => url.searchParams.getAll('filter[created_at][]')),
      ).toEqual([
        ['>=2026-10-01', '<=2026-10-07'],
        ['>=2026-10-01', '<=2026-10-07'],
      ]);
      expect(urls.map((url) => url.searchParams.get('sort'))).toEqual([
        'pickup_lfd',
        'pickup_lfd',
      ]);
      expect(urls[1].searchParams.get('page[number]')).toBe('2');
      const invalid = await client.callTool({
        name: 'list_containers',
        arguments: { advanced_filters: { created_at: 'NOT_A_DATE' } },
      });
      expect(invalid.isError).toBe(true);
      expect(invalid.content).toEqual([
        expect.objectContaining({
          type: 'text',
          text: expect.stringContaining('created_at'),
        }),
      ]);
      expect(urls).toHaveLength(2);
    } finally {
      await client.close();
      await handler.close();
    }
  },
);
