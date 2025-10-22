/**
 * Terminal49 MCP Server
 * Implementation using @modelcontextprotocol/sdk v1.20.1 with McpServer API
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Terminal49Client } from './client.js';
import { executeGetContainer } from './tools/get-container.js';
import { executeTrackContainer } from './tools/track-container.js';
import { executeSearchContainer } from './tools/search-container.js';
import { executeGetShipmentDetails } from './tools/get-shipment-details.js';
import { executeGetContainerTransportEvents } from './tools/get-container-transport-events.js';
import { executeGetSupportedShippingLines } from './tools/get-supported-shipping-lines.js';
import { executeGetContainerRoute } from './tools/get-container-route.js';
import { readContainerResource } from './resources/container.js';
import { readMilestoneGlossaryResource } from './resources/milestone-glossary.js';

export function createTerminal49McpServer(apiToken: string, apiBaseUrl?: string): McpServer {
  const client = new Terminal49Client({ apiToken, apiBaseUrl });

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
    async ({ query }) => {
      const result = await executeSearchContainer({ query }, client);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
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
    async ({ containerNumber, scac, bookingNumber, refNumbers }) => {
      const result = await executeTrackContainer(
        { containerNumber, scac, bookingNumber, refNumbers },
        client
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
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
    async ({ id, include }) => {
      const result = await executeGetContainer({ id, include }, client);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
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
    async ({ id, include_containers }) => {
      const result = await executeGetShipmentDetails({ id, include_containers }, client);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
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
    async ({ id }) => {
      const result = await executeGetContainerTransportEvents({ id }, client);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
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
    },
    async ({ search }) => {
      const result = await executeGetSupportedShippingLines({ search });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
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
    },
    async ({ id }) => {
      const result = await executeGetContainerRoute({ id }, client);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
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
    async (uri, { id }) => {
      const resource = await readContainerResource(uri.href, client);
      return {
        contents: [resource],
      };
    }
  );

  // Resource 2: Milestone Glossary
  server.registerResource(
    'milestone-glossary',
    new ResourceTemplate('terminal49://docs/milestone-glossary', { list: undefined }),
    {
      title: 'Milestone Glossary',
      description: 'Comprehensive event/milestone reference documentation',
    },
    async (uri) => {
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
  console.error('Available tools: 7 | Resources: 2');
  console.error('SDK: @modelcontextprotocol/sdk v1.20.1 (McpServer API)');
}
