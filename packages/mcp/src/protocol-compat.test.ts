import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';

const LEGACY_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
] as const;

const openConnections: Array<{
  client: Client;
  handler: ReturnType<typeof createMcpHandler>;
}> = [];

type AdvertisedProperty = {
  type?: string;
  maxLength?: number;
  maximum?: number;
  description?: string;
  items?: { enum?: string[] };
};

type AdvertisedInputSchema = {
  properties?: Record<string, AdvertisedProperty>;
  additionalProperties?: boolean;
};

async function connectClient(
  options:
    | { era: 'modern' }
    | {
        era: 'legacy';
        protocolVersion: (typeof LEGACY_PROTOCOL_VERSIONS)[number];
      },
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
  it('advertises bounded, identifier-only inputs in tools/list', async () => {
    const client = await connectClient({ era: 'modern' });
    const { tools } = await client.listTools();
    const toolSchemas = new Map(
      tools.map((tool) => [
        tool.name,
        tool.inputSchema as AdvertisedInputSchema,
      ]),
    );

    expect(
      toolSchemas.get('search_container')?.properties?.query,
    ).toMatchObject({
      maxLength: 128,
      description: expect.stringMatching(/never pass conversation text/i),
    });

    for (const name of [
      'list_shipments',
      'list_containers',
      'list_tracking_requests',
    ]) {
      expect(toolSchemas.get(name)?.properties?.page_size?.maximum, name).toBe(
        25,
      );
      expect(toolSchemas.get(name)?.properties?.intent?.maxLength, name).toBe(
        120,
      );
    }

    const trackingRequestSchema = toolSchemas.get('list_tracking_requests');
    expect(trackingRequestSchema?.properties).not.toHaveProperty('filters');
    expect(trackingRequestSchema?.properties).not.toHaveProperty(
      'request_type',
    );
    expect(trackingRequestSchema?.properties).toMatchObject({
      request_number: { maxLength: 64 },
      status: { type: 'string' },
      scac: { minLength: 4, maxLength: 4 },
    });
    expect(trackingRequestSchema?.additionalProperties).toBe(false);
  });

  it.each([
    { era: 'modern' as const, protocolVersion: '2026-07-28' },
    ...LEGACY_PROTOCOL_VERSIONS.map((protocolVersion) => ({
      era: 'legacy' as const,
      protocolVersion,
    })),
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
          readOnlyHint: tool.name !== 'track_container',
          destructiveHint: false,
          openWorldHint: false,
        });
      }
    },
  );
});
