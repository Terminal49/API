import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { expect, it } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';
import { TOOLSETS } from './tools/registry.js';

it('states the real tracking cost and client interaction for tracking writes', async () => {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer('fixture-token', undefined, undefined, {
        toolsets: TOOLSETS,
      }),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client({ name: 'billing-signals-test', version: '1.0.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      }),
    );
    const { tools } = await client.listTools();
    const tracking = tools.filter((tool) =>
      ['track_container', 'resume_shipment_tracking'].includes(tool.name),
    );
    expect(tracking.some((tool) => tool.name === 'track_container')).toBe(true);
    for (const tool of tracking) {
      expect(tool.description, tool.name).toMatch(/quota/);
      expect(tool.description, tool.name).toMatch(/free or trial plan/);
      expect(tool.description, tool.name).toMatch(/consent/);
      expect(tool.description, tool.name).not.toMatch(/pay-as-you-go/);
      expect(tool._meta, tool.name).toBeUndefined();
      expect(tool.annotations, tool.name).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
      });
    }
  } finally {
    await client.close();
    await handler.close();
  }
});
