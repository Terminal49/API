import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  createTerminal49McpServer,
  TERMINAL49_SERVER_INSTRUCTIONS,
} from './server.js';

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
  default?: unknown;
  maxLength?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  description?: string;
  items?: { enum?: string[] };
};

type AdvertisedInputSchema = {
  properties?: Record<string, AdvertisedProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

const DIRECTORY_FORBIDDEN_STEERING_FIELDS = [
  '_agent_steering',
  '_response_contract',
  'presentation_guidance',
  'suggested_follow_ups',
  'suggested_tools',
] as const;

const MCP_DOCS = readFileSync(
  new URL('../../../docs/mcp/home.mdx', import.meta.url),
  'utf8',
);

function documentedToolSection(toolName: string): string {
  const marker = `### \`${toolName}\``;
  const start = MCP_DOCS.indexOf(marker);
  if (start === -1) {
    throw new Error(`Missing ${toolName} section in docs/mcp/home.mdx`);
  }

  const nextSection = MCP_DOCS.indexOf('\n---', start);
  return MCP_DOCS.slice(start, nextSection === -1 ? undefined : nextSection);
}

function documentedParameters(toolName: string): string[] {
  return [
    ...documentedToolSection(toolName).matchAll(/^- `([^`]+)` \*\([^)]*\)\*/gm),
  ].map((match) => match[1]);
}

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
  it('keeps Directory-prohibited steering fields out of advertised instructions', async () => {
    const client = await connectClient({ era: 'modern' });
    const { tools } = await client.listTools();
    const advertisedInstructions = JSON.stringify({
      instructions: TERMINAL49_SERVER_INSTRUCTIONS,
      tools,
    });

    for (const field of DIRECTORY_FORBIDDEN_STEERING_FIELDS) {
      expect(advertisedInstructions).not.toContain(field);
    }
  });

  it('keeps critical MCP docs aligned with tools/list', async () => {
    const client = await connectClient({ era: 'modern' });
    const { tools } = await client.listTools();
    const toolSchemas = new Map(
      tools.map((tool) => [
        tool.name,
        tool.inputSchema as AdvertisedInputSchema,
      ]),
    );

    for (const toolName of [
      'list_shipments',
      'list_containers',
      'list_tracking_requests',
    ]) {
      const advertised = Object.keys(
        toolSchemas.get(toolName)?.properties ?? {},
      ).sort();
      expect(documentedParameters(toolName).sort(), toolName).toEqual(
        advertised,
      );
    }

    expect(toolSchemas.get('track_container')?.required).toContain('number');
    expect(documentedToolSection('track_container')).toMatch(
      /^- `number` \*\(string, required\)\*/m,
    );

    const transportEventsDescription =
      toolSchemas.get('get_container')?.properties?.include?.description;
    expect(transportEventsDescription).toMatch(
      /transport_events: Event summary \(count, rail event count, and latest event\); use get_container_transport_events for the full timeline/,
    );
    expect(documentedToolSection('get_container')).toMatch(
      /transport_events.*events\.count.*events\.rail_events_count.*events\.latest_event.*get_container_transport_events.*full timeline/,
    );
  });

  it('advertises bounded, identifier-only inputs in tools/list', async () => {
    const client = await connectClient({ era: 'modern' });
    const { tools } = await client.listTools();
    const toolSchemas = new Map(
      tools.map((tool) => [
        tool.name,
        tool.inputSchema as AdvertisedInputSchema,
      ]),
    );

    expect(tools).toHaveLength(10);
    for (const tool of tools) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(64);
      expect(tool.inputSchema.properties, tool.name).not.toHaveProperty(
        'intent',
      );
      for (const propertyName of Object.keys(
        tool.inputSchema.properties ?? {},
      )) {
        expect(propertyName, `${tool.name}.${propertyName}`).not.toMatch(
          /(?:chat|conversation|history|memory|messages?)/i,
        );
      }
    }

    const advertisedInstructions = [
      TERMINAL49_SERVER_INSTRUCTIONS,
      ...tools.flatMap((tool) => [
        tool.description ?? '',
        ...Object.values(
          (tool.inputSchema as AdvertisedInputSchema).properties ?? {},
        ).map((property) => property.description ?? ''),
      ]),
    ].join('\n');
    expect(advertisedInstructions).not.toMatch(
      /\b(?:send|provide|share|upload|attach)\b.{0,40}\b(?:chat|conversation) history\b/i,
    );
    expect(advertisedInstructions).not.toMatch(
      /\b(?:send|provide|share|upload|attach)\b.{0,40}\buser memory\b/i,
    );

    expect(
      toolSchemas.get('search_container')?.properties?.query,
    ).toMatchObject({
      maxLength: 128,
      description: expect.stringMatching(/never pass conversation text/i),
    });
    expect(
      toolSchemas.get('get_container')?.properties?.include?.description,
    ).toMatch(
      /transport_events: Event summary.*get_container_transport_events/,
    );

    for (const name of [
      'list_shipments',
      'list_containers',
      'list_tracking_requests',
    ]) {
      expect(
        toolSchemas.get(name)?.properties?.page,
        `${name}.page`,
      ).toMatchObject({
        minimum: 1,
      });
      expect(
        toolSchemas.get(name)?.properties?.page_size,
        `${name}.page_size`,
      ).toMatchObject({
        default: 25,
        minimum: 1,
        maximum: 25,
      });
    }

    expect(toolSchemas.get('get_container')?.properties?.include).toMatchObject(
      {
        default: ['shipment'],
        items: {
          enum: ['shipment', 'pod_terminal', 'transport_events'],
        },
      },
    );
    expect(
      toolSchemas.get('list_containers')?.properties?.include,
    ).toMatchObject({
      items: {
        enum: ['shipment', 'pod_terminal'],
      },
      maxItems: 2,
    });
    expect(
      toolSchemas.get('get_shipment_details')?.properties?.include_containers,
    ).toMatchObject({ default: true });
    expect(
      toolSchemas.get('list_shipments')?.properties?.include_containers,
    ).toMatchObject({ default: false });

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
