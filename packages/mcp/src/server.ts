/**
 * Terminal49 MCP Server
 * Implementation using @modelcontextprotocol/sdk with McpServer API
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
import { executeListShipments } from './tools/list-shipments.js';
import { executeListContainers } from './tools/list-containers.js';
import { executeListTrackingRequests } from './tools/list-tracking-requests.js';
import { readContainerResource } from './resources/container.js';
import { readMilestoneGlossaryResource } from './resources/milestone-glossary.js';
import { queryGuidanceResource, readQueryGuidanceResource } from './resources/query-guidance.js';

type ToolContent = { type: 'text'; text: string };

type ResponseContract = {
  purpose: string;
  can_answer: string[];
  requires_more_data: string[];
  relevant_fields: string[];
  presentation_guidance: string;
  suggested_follow_ups: string[];
  suggested_tools: string[];
};

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

function normalizeStructuredContent(result: unknown): unknown {
  return result;
}

function formatAsText(result: unknown): string {
  try {
    return JSON.stringify(result);
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

const responseContractSchema = z.object({
  purpose: z.string(),
  can_answer: z.array(z.string()),
  requires_more_data: z.array(z.string()),
  relevant_fields: z.array(z.string()),
  presentation_guidance: z.string(),
  suggested_follow_ups: z.array(z.string()),
  suggested_tools: z.array(z.string()),
});

function normalizeContract(contract: ResponseContract): ResponseContract {
  return {
    purpose: contract.purpose,
    can_answer: contract.can_answer,
    requires_more_data: contract.requires_more_data,
    relevant_fields: contract.relevant_fields,
    presentation_guidance: contract.presentation_guidance,
    suggested_follow_ups: contract.suggested_follow_ups,
    suggested_tools: contract.suggested_tools,
  };
}

function attachResponseContract(
  result: unknown,
  contract: ResponseContract,
): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }

  return {
    ...result,
    _response_contract: normalizeContract(contract),
  };
}

function buildSearchContract(result: any, args: { query: string }): ResponseContract {
  const hasContainers = result.total_results > 0 && (result.containers?.length ?? 0) > 0;
  const hasShipments = result.total_results > 0 && (result.shipments?.length ?? 0) > 0;

  return {
    purpose: `Resolve identifier ${args.query} into concrete container and shipment IDs.`,
    can_answer: [
      'container IDs and shipment references',
      'carrier/scac hints for discovered items',
      'what additional lookup step is needed',
    ],
    requires_more_data: hasContainers || hasShipments ? [] : ['A valid/refined identifier (container/BL/reference)'],
    relevant_fields: ['containers', 'shipments', 'total_results'],
    presentation_guidance:
      hasContainers || hasShipments
        ? 'Group matches by container and shipment. Ask for clarification only when multiple entities are strong candidates.'
        : 'Ask for a clearer identifier and verify format before calling another tool.',
    suggested_follow_ups: ['get_container', 'get_shipment_details'],
    suggested_tools: hasContainers || hasShipments ? ['get_container', 'get_shipment_details'] : ['search_container'],
  };
}

function buildTrackContract(result: any, args: { number: string }): ResponseContract {
  const hasTrackedContainer = Boolean((result as any)?.id);
  const isPending = Boolean((result as any)?.tracking_request_created) && !hasTrackedContainer;
  const state = (result as any)?._metadata?.container_state || 'unknown';
  return {
    purpose: `Track ${args.number} and return the linked container view when possible.`,
    can_answer: [
      'tracking request creation state',
      'basic container status and metadata',
      'where to pull next (if container details are delayed)',
    ],
    requires_more_data: isPending ? ['container UUID (once linking finishes)'] : [],
    relevant_fields: ['tracking_request_created', 'container_state', 'id', 'status'],
    presentation_guidance:
      isPending
        ? 'Tracking request was created but container linking is not immediate. Mention this and provide next-check guidance.'
        : `Use container state "${state}" to answer readiness, holds, and pickup timing.`,
    suggested_follow_ups:
      isPending
        ? ['list_tracking_requests', 'get_container']
        : ['get_container_transport_events'],
    suggested_tools: ['get_container', 'get_container_transport_events'],
  };
}

function buildTransportEventsContract(result: any, _args: { id: string }): ResponseContract {
  const totalEvents = result.total_events ?? result.timeline?.length ?? 0;
  return {
    purpose: 'Summarize what happened and forecast next likely milestone for the container.',
    can_answer: ['journey timeline', 'major milestones', 'rail/transshipment context'],
    requires_more_data:
      totalEvents > 0 ? [] : ['recent container events becoming available from carrier feed'],
    relevant_fields: ['timeline', 'event_categories', 'milestones'],
    presentation_guidance:
      totalEvents > 0
        ? 'Render in chronological order. Prioritize milestones over minor terminal noise.'
        : 'No events found yet; recommend checking base container context and retrying later.',
    suggested_follow_ups: ['get_container', 'get_container_route'],
    suggested_tools: ['get_container', 'get_container_route'],
  };
}

function buildShippingLineContract(result: any): ResponseContract {
  return {
    purpose: 'Help user identify a supported SCAC before creating a track request.',
    can_answer: ['SCAC lookup', 'carrier aliases and names', 'supported carrier search'],
    requires_more_data: result.total_lines > 0 ? [] : ['additional query context'],
    relevant_fields: ['shipping_lines', 'total_lines'],
    presentation_guidance: 'Sort carriers alphabetically and show both SCAC and company names.',
    suggested_follow_ups: ['track_container'],
    suggested_tools: ['track_container'],
  };
}

function buildRouteContract(result: any, _args: { id: string }): ResponseContract {
  const available = Array.isArray(result.route_locations);
  return {
    purpose: 'Communicate container routing and vessel itinerary.',
    can_answer: [
      'transshipment structure',
      'leg-by-leg ETD/ETA',
      'carrier and vessel coverage',
    ],
    requires_more_data: available ? [] : ['event timeline via get_container_transport_events'],
    relevant_fields: ['route_locations', 'total_legs', 'alternative'],
    presentation_guidance: available
      ? 'Show origin → transshipments → destination. Emphasize missing legs and ETA changes.'
      : 'This account has no route payload; switch to events and container snapshot.',
    suggested_follow_ups: ['get_container_transport_events', 'get_container'],
    suggested_tools: ['get_container_transport_events', 'get_container'],
  };
}

function buildContainerContract(): ResponseContract {
  return {
    purpose: 'Provide current container snapshot and readiness context.',
    can_answer: ['status', 'location', 'pickup readiness', 'rail and shipment context'],
    requires_more_data: ['holds, fees, and timeline by demand'],
    relevant_fields: ['id', 'container_number', 'status', 'pod_terminal', 'demurrage'],
    presentation_guidance:
      'Summarize state first, then call out LFD, holds, and fees if present. If terminal availability is unclear, suggest transport events.',
    suggested_follow_ups: ['get_container_transport_events', 'get_container_route'],
    suggested_tools: ['get_container_transport_events', 'get_container_route'],
  };
}

function buildShipmentContract(): ResponseContract {
  return {
    purpose: 'Explain shipment-level routing, container counts, and references.',
    can_answer: ['shipment identifiers', 'routing summary', 'container list'],
    requires_more_data: ['container-level ETA confidence when only one terminal is visible'],
    relevant_fields: ['id', 'bill_of_lading', 'status', 'containers', 'routing'],
    presentation_guidance:
      'Group by shipment summary then container health signals (pickup ETA, pickup_lfd, holds).',
    suggested_follow_ups: ['get_container', 'list_containers'],
    suggested_tools: ['get_container', 'list_containers'],
  };
}

function buildListContract(result: any): ResponseContract {
  const count = result?.items ? result.items.length : 0;
  return {
    purpose: 'Surface aggregate operational worklist results.',
    can_answer: ['which records match filters', 'count and paging state'],
    requires_more_data: count === 0 ? ['alternative filters or tighter date ranges'] : [],
    relevant_fields: ['items', 'links', 'meta', 'count'],
    presentation_guidance: 'Return only top-level actionable summary unless user requests full records.',
    suggested_follow_ups: ['list_containers', 'list_tracking_requests'],
    suggested_tools: ['list_containers', 'list_tracking_requests', 'get_container'],
  };
}

function wrapToolWithContract<TArgs>(
  handler: (args: TArgs) => Promise<unknown>,
  buildContract?: (result: unknown, args: TArgs) => ResponseContract,
): (args: TArgs) => Promise<{ content: ToolContent[]; structuredContent: any }> {
  return async (args: TArgs) => {
    try {
      const result = await handler(args);
      const structuredContent = buildContract
        ? attachResponseContract(result, buildContract(result, args))
        : result;

      return {
        content: buildContentPayload(result),
        structuredContent: normalizeStructuredContent(structuredContent),
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
          pod_terminal: z.string().optional(),
          pol_terminal: z.string().optional(),
          destination: z.string().optional(),
        })),
        shipments: z.array(z.object({
          id: z.string(),
          ref_numbers: z.array(z.string()),
          shipping_line: z.string(),
          container_count: z.number(),
        })),
        total_results: z.number(),
        _response_contract: responseContractSchema,
      },
    },
    wrapToolWithContract(
      async ({ query }) => executeSearchContainer({ query }, client),
      (result, args) => buildSearchContract(result as any, args),
    )
  );

  // Tool 2: Track Container
  server.registerTool(
    'track_container',
    {
      title: 'Track Container',
      description:
        'Track a container, bill of lading, or booking number. ' +
        'Uses inference to choose the carrier/type when possible, creates a tracking request, ' +
        'and returns detailed container information.',
      inputSchema: {
        number: z.string().optional().describe('Container, bill of lading, or booking number to track'),
        numberType: z
          .string()
          .optional()
          .describe('Optional override: container | bill_of_lading | booking_number'),
        containerNumber: z.string().optional().describe('Deprecated alias for number (container)'),
        bookingNumber: z.string().optional().describe('Deprecated alias for number (booking/BL)'),
        scac: z.string().optional().describe('Optional SCAC code of the shipping line (e.g., MAEU for Maersk)'),
        refNumbers: z.array(z.string()).optional().describe('Optional reference numbers for matching'),
      },
      outputSchema: {
        error: z.string().optional(),
        message: z.string().optional(),
        id: z.string().optional(),
        container_number: z.string().optional(),
        status: z.string().optional(),
        tracking_request_created: z.boolean().optional(),
        infer_result: z.any().optional(),
        _response_contract: responseContractSchema.optional(),
      },
    },
    wrapToolWithContract(
      async ({ number, numberType, containerNumber, scac, bookingNumber, refNumbers }) =>
        executeTrackContainer(
          { number, numberType, containerNumber, scac, bookingNumber, refNumbers },
          client,
        ),
      (result, args) => buildTrackContract(result as any, { number: args.number || args.containerNumber || args.bookingNumber || '' })
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
          .default(['shipment'])
          .describe(
            'Optional related data to include. Default: [\'shipment\'] covers most use cases. ' +
            '• shipment: Routing, BOL, line, ref numbers (lightweight, always useful) ' +
            '• pod_terminal: Terminal name, location, availability (lightweight, needed for demurrage questions) ' +
            '• transport_events: Full event history, rail tracking (heavy 50-100 events, use for journey/timeline questions)'
          ),
      },
      outputSchema: z
        .object({
          _response_contract: responseContractSchema,
        })
        .passthrough(),
    },
    wrapToolWithContract(
      async ({ id, include }) => executeGetContainer({ id, include }, client),
      () => buildContainerContract(),
    )
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
      outputSchema: z
        .object({
          _response_contract: responseContractSchema,
        })
        .passthrough(),
      },
    wrapToolWithContract(
      async ({ id, include_containers }) =>
        executeGetShipmentDetails({ id, include_containers }, client),
      () => buildShipmentContract(),
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
      outputSchema: z.union([
        z.object({
          total_events: z.number(),
          event_categories: z.object({
            vessel_events: z.number(),
            rail_events: z.number(),
            truck_events: z.number(),
            terminal_events: z.number(),
            other_events: z.number(),
          }),
          timeline: z.array(
            z.object({
              event: z.string(),
              timestamp: z.string(),
              timezone: z.string().optional(),
              voyage_number: z.string().optional().nullable(),
              location: z
                .object({
                  name: z.string().optional(),
                  code: z.string().optional(),
                  type: z.string().optional(),
                })
                .nullable(),
            })
          ),
          milestones: z.record(z.string(), z.string().nullable()),
          _response_contract: responseContractSchema,
          _metadata: z.object({
            presentation_guidance: z.string(),
          }),
        }),
        z.object({
          mapped: z.array(z.record(z.string(), z.any())),
          summary: z.object({
            total_events: z.number(),
            event_categories: z.object({
              vessel_events: z.number(),
              rail_events: z.number(),
              truck_events: z.number(),
              terminal_events: z.number(),
              other_events: z.number(),
            }),
            timeline: z.array(
              z.object({
                event: z.string(),
                timestamp: z.string(),
                timezone: z.string().optional(),
                voyage_number: z.string().optional().nullable(),
                location: z
                  .object({
                    name: z.string().optional(),
                    code: z.string().optional(),
                    type: z.string().optional(),
                  })
                  .nullable(),
              })
            ),
            milestones: z.record(z.string(), z.string().nullable()),
            _response_contract: responseContractSchema,
            _metadata: z.object({
              presentation_guidance: z.string(),
            }),
          }),
        }),
      ]),
    },
    wrapToolWithContract(
      async ({ id }) => executeGetContainerTransportEvents({ id }, client),
      (result, args) => buildTransportEventsContract(result as any, args),
    )
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
        _response_contract: responseContractSchema,
      },
    },
    wrapToolWithContract(
      async ({ search }) => executeGetSupportedShippingLines({ search }, client),
      (result) => buildShippingLineContract(result as any),
    )
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
      // Keep a single permissive schema because this tool can return either
      // route fields or feature-gating fields depending on account capability.
      outputSchema: z.object({
        route_id: z.string().optional(),
        total_legs: z.number().optional(),
        route_locations: z
          .array(
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
          )
          .optional(),
        created_at: z.string().nullable().optional(),
        updated_at: z.string().nullable().optional(),
        _metadata: z
          .object({
            presentation_guidance: z.string().optional(),
          })
          .optional(),

        // Feature gating / errors
        error: z.string().optional(),
        message: z.string().optional(),
        alternative: z.string().optional(),
        _response_contract: responseContractSchema.optional(),
      }),
    },
    wrapToolWithContract(
      async ({ id }) => executeGetContainerRoute({ id }, client),
      (result, args) => buildRouteContract(result as any, args),
    )
  );

  // Tool 8: List Shipments
  server.registerTool(
    'list_shipments',
    {
      title: 'List Shipments',
      description:
        'List shipments with optional filters and pagination. ' +
        'Use for queries like "show recent shipments" or "shipments for a carrier".',
      inputSchema: {
        status: z.string().optional().describe('Filter by shipment status'),
        port: z.string().optional().describe('Filter by POD port LOCODE'),
        carrier: z.string().optional().describe('Filter by shipping line SCAC'),
        updated_after: z.string().optional().describe('Filter by updated_at (ISO8601) >= value'),
        include_containers: z
          .boolean()
          .optional()
          .describe('Include containers relationship in response. Default: true.'),
        page: z.number().int().positive().optional().describe('Page number (1-based)'),
        page_size: z.number().int().positive().optional().describe('Page size'),
      },
      outputSchema: z.object({
        items: z.array(z.record(z.string(), z.any())),
        links: z.record(z.string(), z.string()).optional(),
        meta: z.record(z.string(), z.any()).optional(),
        _response_contract: responseContractSchema,
      }),
    },
    wrapToolWithContract(
      async (args) => executeListShipments(args, client),
      (result) => buildListContract(result as any),
    )
  );

  // Tool 9: List Containers
  server.registerTool(
    'list_containers',
    {
      title: 'List Containers',
      description:
        'List containers with optional filters and pagination. ' +
        'Use for queries like "containers at port" or "latest updates".',
      inputSchema: {
        status: z.string().optional().describe('Filter by container status'),
        port: z.string().optional().describe('Filter by POD port LOCODE'),
        carrier: z.string().optional().describe('Filter by shipping line SCAC'),
        updated_after: z.string().optional().describe('Filter by updated_at (ISO8601) >= value'),
        include: z
          .string()
          .optional()
          .describe('Comma-separated include list (e.g., shipment,pod_terminal)'),
        page: z.number().int().positive().optional().describe('Page number (1-based)'),
        page_size: z.number().int().positive().optional().describe('Page size'),
      },
      outputSchema: z.object({
        items: z.array(z.record(z.string(), z.any())),
        links: z.record(z.string(), z.string()).optional(),
        meta: z.record(z.string(), z.any()).optional(),
        _response_contract: responseContractSchema,
      }),
    },
    wrapToolWithContract(
      async (args) => executeListContainers(args, client),
      (result) => buildListContract(result as any),
    )
  );

  // Tool 10: List Tracking Requests
  server.registerTool(
    'list_tracking_requests',
    {
      title: 'List Tracking Requests',
      description:
        'List tracking requests with optional filters and pagination. ' +
        'Useful for monitoring recent tracking activity.',
      inputSchema: {
        filters: z
          .record(z.string(), z.string())
          .optional()
          .describe('Raw query filters (e.g., filter[status]=succeeded)'),
        status: z.string().optional().describe('Filter by request status (mapped to filter[status])'),
        request_type: z.string()
          .optional()
          .describe('Filter by request type (mapped to filter[request_type])'),
        page: z.number().int().positive().optional().describe('Page number (1-based)'),
        page_size: z.number().int().positive().optional().describe('Page size'),
      },
      outputSchema: z.object({
        items: z.array(z.record(z.string(), z.any())),
        links: z.record(z.string(), z.string()).optional(),
        meta: z.record(z.string(), z.any()).optional(),
        _response_contract: responseContractSchema,
      }),
    },
    wrapToolWithContract(
      async (args) => executeListTrackingRequests(args, client),
      (result) => buildListContract(result as any),
    )
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

  // Resource 3: Query Guidance (internal LLM tool routing hints)
  server.registerResource(
    'query-guidance',
    queryGuidanceResource.uri,
    {
      title: queryGuidanceResource.name,
      description: queryGuidanceResource.description,
      mimeType: queryGuidanceResource.mimeType,
    },
    async () => {
      const resource = readQueryGuidanceResource();
      return {
        contents: [
          {
            uri: queryGuidanceResource.uri,
            mimeType: queryGuidanceResource.mimeType,
            text: resource,
          },
        ],
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
  console.error('Available: 10 tools | 3 prompts | 3 resources');
  console.error('SDK: @modelcontextprotocol/sdk (McpServer API)');
}
