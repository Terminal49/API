import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';

const openConnections: Array<{
  client: Client;
  handler: ReturnType<typeof createMcpHandler>;
}> = [];

async function connectClient(
  options: { era: 'modern' } | { era: 'legacy'; protocolVersion: '2025-11-25' },
): Promise<Client> {
  const handler = createMcpHandler(
    () => createTerminal49McpServer('test-token', 'https://api.test'),
    {
      legacy: 'stateless',
      responseMode: 'json',
    },
  );
  const client = new Client(
    { name: 'terminal49-protocol-test', version: '1.0.0' },
    options.era === 'modern'
      ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      : { supportedProtocolVersions: [options.protocolVersion] },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.test/mcp'),
    {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    },
  );

  await client.connect(transport);
  openConnections.push({ client, handler });
  return client;
}

afterEach(async () => {
  await Promise.all(
    openConnections.splice(0).map(async ({ client, handler }) => {
      await client.close();
      await handler.close();
    }),
  );
});

describe('MCP protocol compatibility', () => {
  it.each([
    { era: 'modern' as const, protocolVersion: '2026-07-28' },
    {
      era: 'legacy' as const,
      protocolVersion: '2025-11-25' as const,
    },
  ])(
    'lists the complete server surface over $protocolVersion',
    async ({ era, protocolVersion }) => {
      const client =
        era === 'modern'
          ? await connectClient({ era })
          : await connectClient({ era, protocolVersion });

      expect(client.getProtocolEra()).toBe(era);
      expect(client.getNegotiatedProtocolVersion()).toBe(protocolVersion);

      const [{ tools }, { prompts }, { resources }, { resourceTemplates }] =
        await Promise.all([
          client.listTools(),
          client.listPrompts(),
          client.listResources(),
          client.listResourceTemplates(),
        ]);

      expect(tools).toHaveLength(10);
      expect(prompts).toHaveLength(3);
      expect(resources).toHaveLength(3);
      expect(resourceTemplates).toHaveLength(1);

      for (const tool of tools) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: false,
          destructiveHint: false,
          openWorldHint: false,
        });
      }
    },
  );
});
