/**
 * Terminal49 MCP Server
 * Implementation using @modelcontextprotocol/sdk v1.20.1 with McpServer API
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';
import { executeGetContainer } from './tools/get-container.js';
import { executeTrackContainer } from './tools/track-container.js';
import { executeSearchContainer } from './tools/search-container.js';
import { executeGetShipmentDetails } from './tools/get-shipment-details.js';
import { executeGetContainerTransportEvents } from './tools/get-container-transport-events.js';
import { executeGetSupportedShippingLines } from './tools/get-supported-shipping-lines.js';
import { executeGetContainerRoute, type FeatureNotEnabledResult } from './tools/get-container-route.js';
import { readContainerResource } from './resources/container.js';
import { readMilestoneGlossaryResource } from './resources/milestone-glossary.js';

type ToolContent = { type: 'text'; text: string };

function buildContentPayload(result: unknown): ToolContent[] {
  if (result && typeof result === 'object' && (result as any).mapped) {
    return [{ type: 'text', text: formatAsText((result as any).mapped) }];
  }

  if (result && typeof result === 'object' && (result as any).summary) {
    return [{ type: 'text', text: formatAsText((result as any).summary) }];
  }

  if (isFeatureNotEnabledResult(result)) {
    return [
      {
        type: 'text',
        text: `${result.message}\n\nAlternative: ${result.alternative}`,
      },
    ];
  }

  if (hasMetadataError(result)) {
    const metadata = (result as any)._metadata;
    const remediation = metadata.remediation ? `\n\nRemediation: ${metadata.remediation}` : '';
    return [
      {
        type: 'text',
        text: `${metadata.error}${remediation}`,
      },
    ];
  }

  return [{ type: 'text', text: formatAsText(result) }];
}

function formatAsText(result: unknown): string {
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function isFeatureNotEnabledResult(result: unknown): result is FeatureNotEnabledResult {
  return Boolean(
    result &&
      typeof result === 'object' &&
      (result as any).error === 'FeatureNotEnabled' &&
      typeof (result as any).message === 'string'
  );
}

function hasMetadataError(result: unknown): result is { _metadata: { error: string } } {
  const metadata = (result as any)?._metadata;
  return Boolean(metadata && typeof metadata.error === 'string');
}

function wrapTool<TArgs>(
  handler: (args: TArgs) => Promise<unknown>
): (args: TArgs) => Promise<{ content: ToolContent[]; structuredContent: any }> {
  return async (args: TArgs) => {
    try {
      const result = await handler(args);
      return {
        content: buildContentPayload(result),
        structuredContent: result as any,
      };
    } catch (error) {
      const err = error as Error;
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        structuredContent: { error: err.name, message: err.message },
      };
    }
  };
}

export function createTerminal49McpServer(apiToken: string, apiBaseUrl?: string): McpServer {
  const client = new Terminal49Client({ apiToken, apiBaseUrl, defaultFormat: "mapped" });

  const server = new McpServer({
    name: 'terminal49-mcp',
    version: '1.0.0',
  });

  // ==================== TOOLS ====================

  // Tool 1: Search Container
  server.registerTool(
    'search_container',
    {
      title: 'Search Containers',
      description:
        'Search for containers, shipments, and tracking information by container number, ' +
        'booking number, bill of lading, or reference number. ' +
        'This is the fastest way to find container information. ' +
        'Examples: CAIU2885402, MAEU123456789, or any reference number.',
      inputSchema: {
        query: z.string().min(1).describe('Search query - can be a container number, booking number, BL number, or reference number'),
      },
      outputSchema: {
        containers: z.array(z.object({
          id: z.string(),
          container_number: z.string(),
          status: z.string(),
          shipping_line: z.string(),
        })),
        shipments: z.array(z.object({
          id: z.string(),
          ref_numbers: z.array(z.string()),
          shipping_line: z.string(),
          container_count: z.number(),
        })),
        total_results: z.number(),
      },
    },
    wrapTool(async ({ query }) => executeSearchContainer({ query }, client))
  );

  // Tool 2: Track Container
  server.registerTool(
    'track_container',
    {
      title: 'Track Container',
      description:
        'Track a container by its container number (e.g., CAIU2885402). ' +
        'This will create a tracking request if it doesn\'t exist and return detailed container information. ' +
        'Optionally provide SCAC code, booking number, or reference numbers for better matching.',
      inputSchema: {
        containerNumber: z.string().describe('The container number (e.g., CAIU2885402, TCLU1234567)'),
        scac: z.string().optional().describe('Optional SCAC code of the shipping line (e.g., MAEU for Maersk)'),
        bookingNumber: z.string().optional().describe('Optional booking/BL number if tracking by bill of lading'),
        refNumbers: z.array(z.string()).optional().describe('Optional reference numbers for matching'),
      },
      outputSchema: {
        id: z.string(),
        container_number: z.string(),
        status: z.string(),
        tracking_request_created: z.boolean(),
      },
    },
    wrapTool(async ({ containerNumber, scac, bookingNumber, refNumbers }) =>
      executeTrackContainer({ containerNumber, scac, bookingNumber, refNumbers }, client)
    )
  );

  // Tool 3: Get Container
  server.registerTool(
    'get_container',
    {
      title: 'Get Container Details',
      description:
        'Get container information with flexible data loading. Returns core container data (status, location, equipment, dates) ' +
        'plus optional related data. Choose includes based on user question and container state. ' +
        'Response includes metadata hints to guide follow-up queries.',
      inputSchema: {
        id: z.string().uuid().describe('The Terminal49 container ID (UUID format)'),
        include: z
          .array(z.enum(['shipment', 'pod_terminal', 'transport_events']))
          .optional()
          .default(['shipment', 'pod_terminal'])
          .describe(
            'Optional related data to include. Default: [\'shipment\', \'pod_terminal\'] covers most use cases. ' +
            '• shipment: Routing, BOL, line, ref numbers (lightweight, always useful) ' +
            '• pod_terminal: Terminal name, location, availability (lightweight, needed for demurrage questions) ' +
            '• transport_events: Full event history, rail tracking (heavy 50-100 events, use for journey/timeline questions)'
          ),
      },
    },
    wrapTool(async ({ id, include }) => executeGetContainer({ id, include }, client))
  );

  // Tool 4: Get Shipment Details
  server.registerTool(
    'get_shipment_details',
    {
      title: 'Get Shipment Details',
      description:
        'Get detailed shipment information including routing, BOL, containers, and port details. ' +
        'Use this when user asks about a shipment (vs a specific container). ' +
        'Returns: Bill of Lading, shipping line, port details, vessel info, ETAs, container list.',
      inputSchema: {
        id: z.string().uuid().describe('The Terminal49 shipment ID (UUID format)'),
        include_containers: z.boolean().optional().default(true).describe('Include list of containers in this shipment. Default: true'),
      },
    },
    wrapTool(async ({ id, include_containers }) =>
      executeGetShipmentDetails({ id, include_containers }, client)
    )
  );

  // Tool 5: Get Container Transport Events
  server.registerTool(
    'get_container_transport_events',
    {
      title: 'Get Container Transport Events',
      description:
        'Get detailed transport event timeline for a container. Returns all milestones and movements ' +
        '(vessel loaded, departed, arrived, discharged, rail movements, delivery). ' +
        'Use this for questions about journey history, "what happened", timeline analysis, rail tracking. ' +
        'More efficient than get_container with transport_events when you only need event data.',
      inputSchema: {
        id: z.string().uuid().describe('The Terminal49 container ID (UUID format)'),
      },
    },
    wrapTool(async ({ id }) => executeGetContainerTransportEvents({ id }, client))
  );

  // Tool 6: Get Supported Shipping Lines
  server.registerTool(
    'get_supported_shipping_lines',
    {
      title: 'Get Supported Shipping Lines',
      description:
        'Get list of shipping lines (carriers) supported by Terminal49 for container tracking. ' +
        'Returns SCAC codes, full names, and common abbreviations. ' +
        'Use this when user asks which carriers are supported or to validate a carrier name.',
      inputSchema: {
        search: z.string().optional().describe('Optional: Filter by carrier name or SCAC code'),
      },
      outputSchema: {
        total_lines: z.number(),
        shipping_lines: z.array(
          z.object({
            scac: z.string(),
            name: z.string(),
            short_name: z.string().optional(),
            bol_prefix: z.string().optional(),
            notes: z.string().optional(),
          })
        ),
        _metadata: z.object({
          presentation_guidance: z.string(),
          error: z.string().optional(),
          remediation: z.string().optional(),
        }),
      },
    },
    wrapTool(async ({ search }) => executeGetSupportedShippingLines({ search }, client))
  );

  // Tool 7: Get Container Route
  server.registerTool(
    'get_container_route',
    {
      title: 'Get Container Route',
      description:
        'Get detailed routing and vessel itinerary for a container including all ports, vessels, and ETAs. ' +
        'Shows complete multi-leg journey (origin → transshipment ports → destination). ' +
        'NOTE: This is a paid feature and may not be available for all accounts. ' +
        'Use for questions about routing, transshipments, or detailed vessel itinerary.',
      inputSchema: {
        id: z.string().uuid().describe('The Terminal49 container ID (UUID format)'),
      },
      outputSchema: z.union([
        z.object({
          route_id: z.string().optional(),
          total_legs: z.number(),
          route_locations: z.array(
            z.object({
              port: z
                .object({
                  code: z.string().nullable().optional(),
                  name: z.string().nullable().optional(),
                  city: z.string().nullable().optional(),
                  country_code: z.string().nullable().optional(),
                })
                .nullable(),
              inbound: z.object({
                mode: z.string().nullable().optional(),
                carrier_scac: z.string().nullable().optional(),
                eta: z.string().nullable().optional(),
                ata: z.string().nullable().optional(),
                vessel: z
                  .object({
                    name: z.string().nullable().optional(),
                    imo: z.string().nullable().optional(),
                  })
                  .nullable(),
              }),
              outbound: z.object({
                mode: z.string().nullable().optional(),
                carrier_scac: z.string().nullable().optional(),
                etd: z.string().nullable().optional(),
                atd: z.string().nullable().optional(),
                vessel: z
                  .object({
                    name: z.string().nullable().optional(),
                    imo: z.string().nullable().optional(),
                  })
                  .nullable(),
              }),
            })
          ),
          created_at: z.string().nullable().optional(),
          updated_at: z.string().nullable().optional(),
          _metadata: z.object({
            presentation_guidance: z.string(),
          }),
        }),
        z.object({
          error: z.literal('FeatureNotEnabled'),
          message: z.string(),
          alternative: z.string(),
        }),
      ]),
    },
    wrapTool(async ({ id }) => executeGetContainerRoute({ id }, client))
  );

  // ==================== PROMPTS ====================

  // Prompt 1: Track Shipment
  server.registerPrompt(
    'track-shipment',
    {
      title: 'Track Container Shipment',
      description: 'Quick container tracking workflow with carrier autocomplete',
      argsSchema: {
        container_number: z.string().describe('Container number (e.g., CAIU1234567)'),
        carrier: z.string().optional().describe('Shipping line SCAC code (e.g., MAEU for Maersk)'),
      },
    },
    async ({ container_number, carrier }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: carrier
              ? `Track container ${container_number} with carrier ${carrier}. Show current status, location, and any holds or issues.`
              : `Track container ${container_number}. Show current status, location, and any holds or issues.`,
          },
        },
      ],
    })
  );

  // Prompt 2: Check Demurrage
  server.registerPrompt(
    'check-demurrage',
    {
      title: 'Check Demurrage Risk',
      description: 'Analyze demurrage/detention risk for a container',
      argsSchema: {
        container_id: z.string().uuid().describe('Terminal49 container UUID'),
      },
    },
    async ({ container_id }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze demurrage risk for container ${container_id}. Check:
- Last Free Day (LFD) and days remaining
- Current availability status
- Any holds blocking pickup
- Terminal fees
- Recommended action to avoid demurrage charges`,
          },
        },
      ],
    })
  );

  // Prompt 3: Analyze Delays
  server.registerPrompt(
    'analyze-delays',
    {
      title: 'Analyze Journey Delays',
      description: 'Identify delays and root causes in container journey',
      argsSchema: {
        container_id: z.string().uuid().describe('Terminal49 container UUID'),
      },
    },
    async ({ container_id }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze the journey timeline for container ${container_id}:
- Identify any delays vs. expected schedule
- Compare actual vs. estimated times for each milestone
- Highlight unusual gaps or extended stays
- Determine root causes (port congestion, vessel delays, customs, etc.)
- Provide summary of impact on overall transit time`,
          },
        },
      ],
    })
  );

  // ==================== RESOURCES ====================

  // Resource 1: Container Resource
  server.registerResource(
    'container',
    new ResourceTemplate('terminal49://container/{id}', { list: undefined }),
    {
      title: 'Container Information',
      description: 'Access container data as a resource',
    },
    async (uri, { id: _id }) => {
      const resource = await readContainerResource(uri.href, client);
      return {
        contents: [resource],
      };
    }
  );

  // Resource 2: Milestone Glossary (static resource)
  server.registerResource(
    'milestone-glossary',
    'terminal49://docs/milestone-glossary',
    {
      title: 'Milestone Glossary',
      description: 'Comprehensive event/milestone reference documentation',
      mimeType: 'text/markdown',
    },
    async (_uri) => {
      const resource = readMilestoneGlossaryResource();
      return {
        contents: [resource],
      };
    }
  );

  return server;
}

// Stdio transport runner
export async function runStdioServer() {
  const apiToken = process.env.T49_API_TOKEN;
  const apiBaseUrl = process.env.T49_API_BASE_URL;

  if (!apiToken) {
    console.error('ERROR: T49_API_TOKEN environment variable is required');
    console.error('');
    console.error('Please set your Terminal49 API token:');
    console.error('  export T49_API_TOKEN=your_token_here');
    console.error('');
    console.error('Get your API token at: https://app.terminal49.com/developers/api-keys');
    process.exit(1);
  }

  const server = createTerminal49McpServer(apiToken, apiBaseUrl);
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error('Terminal49 MCP Server v1.0.0 running on stdio');
  console.error('Available: 7 tools | 3 prompts | 2 resources');
  console.error('SDK: @modelcontextprotocol/sdk v1.20.1 (McpServer API)');
}
