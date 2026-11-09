import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { vi } from 'vite-plus/test';
import {
  createTerminal49McpServer,
  type Terminal49McpServerOptions,
} from '../server.js';
import { fakeApiFetch, type FakeRoutes } from './fake-api.js';

/**
 * Calls one tool through the MCP client and the HTTP handler. The server's
 * SDK client sends its API requests to `routes`.
 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
  routes: FakeRoutes,
  options: Terminal49McpServerOptions = {},
) {
  vi.stubGlobal('fetch', fakeApiFetch(routes).fetch);
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer(
        'fixture-token',
        'https://api.test',
        undefined,
        options,
      ),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client({ name: 'transport-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    return { ...result, text };
  } finally {
    await client.close();
    await handler.close();
  }
}
