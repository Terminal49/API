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
  exclusiveMinimum?: number;
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
      /transport_events: Active event summary \(count, rail event count, and latest event\); use get_container_transport_events for the full timeline/,
    );
    expect(documentedToolSection('get_container')).toMatch(
      /transport_events.*events\.count.*events\.rail_events_count.*events\.latest_event.*get_container_transport_events.*full timeline/,
    );
  });

  it('warns that estimated_value is not available by lane, in tools/list and the docs', async () => {
    // The API answers estimated_value with a lane dimension or lane filter
    // (pol, pol_country, container_type) with a 400: the trade-intel service
    // checks every field used, grouped or filtered. The measure an agent picks
    // must carry that rule, filters included, wherever it is offered.
    const client = await connectClient({ era: 'modern' });
    const { tools } = await client.listTools();
    const laneRule =
      /estimated_value.*not available.*\bfilters?\b.*\bpol\b.*\bpol_country\b.*\bcontainer_type\b/s;

    for (const toolName of ['get_trade_trends', 'get_trade_breakdown']) {
      const schema = tools.find((tool) => tool.name === toolName)
        ?.inputSchema as AdvertisedInputSchema | undefined;
      expect(schema?.properties?.measure?.description, toolName).toMatch(
        laneRule,
      );
      expect(documentedToolSection(toolName), toolName).toMatch(laneRule);
    }
  });

  it('states the default window the API computes, in tools/list, the MCP docs and the OpenAPI spec', async () => {
    // Without since, the trade-intel service (analytics._range) returns the
    // N months ending with until, which defaults to the current, partial
    // month: since = until - (N - 1). With until 2026-10, trends starts at
    // 2024-11 and breakdown at 2025-11. "N months ago" would be N + 1 months.
    const client = await connectClient({ era: 'modern' });
    const { tools } = await client.listTools();
    const spec = JSON.parse(
      readFileSync(
        new URL('../../../docs/openapi.json', import.meta.url),
        'utf8',
      ),
    );
    const windows = [
      {
        toolName: 'get_trade_trends',
        path: '/trade_intel/trends',
        request: 'TradeIntelTrendsRequest',
        window: '24 months ending with',
        since: '23 months before',
      },
      {
        toolName: 'get_trade_breakdown',
        path: '/trade_intel/breakdown',
        request: 'TradeIntelBreakdownRequest',
        window: '12 months ending with',
        since: '11 months before',
      },
    ];

    for (const { toolName, path, request, window, since } of windows) {
      const tool = tools.find((candidate) => candidate.name === toolName);
      const sinceDescriptions = {
        'tools/list since': (tool?.inputSchema as AdvertisedInputSchema)
          ?.properties?.since?.description,
        'openapi since':
          spec.components.schemas[request].properties.since.description,
      };
      const windowDescriptions = {
        'tools/list description': tool?.description,
        'docs/mcp/home.mdx': documentedToolSection(toolName),
        'openapi operation': spec.paths[path].post.description,
      };

      for (const [surface, text] of Object.entries(sinceDescriptions)) {
        expect(text, `${toolName} ${surface}`).toContain(since);
      }
      for (const [surface, text] of Object.entries(windowDescriptions)) {
        expect(text, `${toolName} ${surface}`).toContain(window);
      }
      for (const [surface, text] of Object.entries({
        ...sinceDescriptions,
        ...windowDescriptions,
      })) {
        expect(text, `${toolName} ${surface}`).not.toMatch(
          /\d+ months ago|about (?:a|two) years? back/,
        );
      }
    }
  });

  it('gives the tools/list count and names wherever the docs count tools', async () => {
    const client = await connectClient({ era: 'modern' });
    const { tools } = await client.listTools();
    const read = (path: string) =>
      readFileSync(new URL(path, import.meta.url), 'utf8');
    const docs = {
      'packages/mcp/README.md': read('../README.md'),
      'packages/mcp/TOOLS_OVERVIEW.md': read('../TOOLS_OVERVIEW.md'),
      'docs/api-docs/in-depth-guides/mcp.mdx': read(
        '../../../docs/api-docs/in-depth-guides/mcp.mdx',
      ),
    };

    for (const [path, text] of Object.entries(docs)) {
      const counts = [
        ...text.matchAll(
          /\b(\d+)\*{0,2} (?:specialized )?tools\b|Tools \((\d+) Available\)/gi,
        ),
      ].map((match) => Number(match[1] ?? match[2]));
      expect(counts.length, path).toBeGreaterThan(0);
      for (const count of counts) expect(count, path).toBe(tools.length);
    }

    const readmeTable = [
      ...docs['packages/mcp/README.md'].matchAll(
        /^\| \*\*`([a-z_]+)`\*\* \|/gm,
      ),
    ].map((match) => match[1]);
    expect(readmeTable.sort()).toEqual(tools.map((tool) => tool.name).sort());
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

    expect(tools).toHaveLength(23);
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
      /transport_events: Active event summary.*get_container_transport_events/,
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
        type: 'integer',
        exclusiveMinimum: 0,
      });
      expect(
        toolSchemas.get(name)?.properties?.page_size,
        `${name}.page_size`,
      ).toMatchObject({
        default: 25,
        type: 'integer',
        exclusiveMinimum: 0,
        maximum: 25,
      });
    }

    expect(toolSchemas.get('get_container')?.properties?.include).toMatchObject(
      {
        default: ['shipment'],
        items: {
          enum: [
            'shipment',
            'pod_terminal',
            'transport_events',
            'custom_fields',
          ],
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

      expect(tools).toHaveLength(23);
      expect(prompts).toHaveLength(3);
      expect(resources).toHaveLength(3);
      expect(resourceTemplates).toHaveLength(1);

      for (const tool of tools) {
        expect(tool.annotations).toMatchObject({
          readOnlyHint: ![
            'track_container',
            'set_party_role',
            'set_custom_field',
          ].includes(tool.name),
          destructiveHint: ['set_party_role', 'set_custom_field'].includes(
            tool.name,
          ),
          openWorldHint: tool.name === 'search_docs',
        });
      }
    },
  );
});
