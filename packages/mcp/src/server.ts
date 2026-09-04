/**
 * Terminal49 MCP Server
 * Implementation using the MCP TypeScript SDK v2 McpServer API
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import {
  completable,
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';
import { executeGetContainer } from './tools/get-container.js';
import { executeTrackContainer } from './tools/track-container.js';
import { executeSearchContainer } from './tools/search-container.js';
import { executeGetShipmentDetails } from './tools/get-shipment-details.js';
import { executeGetContainerTransportEvents } from './tools/get-container-transport-events.js';
import { executeGetSupportedShippingLines } from './tools/get-supported-shipping-lines.js';
import {
  executeGetContainerRoute,
  type FeatureNotEnabledResult,
} from './tools/get-container-route.js';
import { executeListShipments } from './tools/list-shipments.js';
import { executeListContainers } from './tools/list-containers.js';
import { executeListTrackingRequests } from './tools/list-tracking-requests.js';
import { readContainerResource } from './resources/container.js';
import { readMilestoneGlossaryResource } from './resources/milestone-glossary.js';
import {
  queryGuidanceResource,
  readQueryGuidanceResource,
} from './resources/query-guidance.js';
import {
  listDisplayColumnsResource,
  readListDisplayColumnsResource,
} from './resources/list-display.js';
import {
  instrumentMcpServerWithPostHog,
  registerPostHogExitHook,
} from './posthog.js';
import {
  captureMcpException,
  flushMcpEvents,
  instrumentMcpServer,
} from './sentry.js';
import { logMcpEvent } from './logging.js';

/**
 * MCP content-block annotations (per spec). `audience` lets a client decide who
 * a block is for: end "user", the "assistant" (model), or both. We tag
 * agent-steering payload (the response contract / metadata that exists only to
 * guide the model) as assistant-only so clients can hide it from end users,
 * while the human-readable answer stays unannotated (visible to everyone).
 */
type ContentAnnotations = {
  audience?: Array<'user' | 'assistant'>;
  priority?: number;
};

type TextContent = {
  type: 'text';
  text: string;
  annotations?: ContentAnnotations;
};

type ResourceLinkContent = {
  type: 'resource_link';
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: ContentAnnotations;
};

type ToolContent = TextContent | ResourceLinkContent;

/**
 * Annotation marking a content block as steering-only (assistant/model
 * audience). Clients that respect audience annotations can hide these blocks
 * from end users, since they carry tool-routing hints rather than answers.
 */
const ASSISTANT_ONLY_ANNOTATION: ContentAnnotations = {
  audience: ['assistant'],
};

/**
 * Server-level instructions (MCP `ServerOptions.instructions`). This is a
 * concise operating guide handed to the LLM at initialize time so it
 * understands the ocean-tracking domain and how to chain the tools.
 */
export const TERMINAL49_SERVER_INSTRUCTIONS = `Terminal49 tracks ocean containers and shipments live from carriers and terminals. Data is real-time from ocean carriers (by SCAC, e.g. MAEU = Maersk) and US/Canada terminals, so values change between calls.

Domain vocabulary: SCAC = 4-letter carrier code; BOL = bill of lading and booking number identify a shipment; POL/POD = port of lading/discharge; LFD = last free day (pickup deadline before demurrage accrues); demurrage/detention = late fees; holds = customs/freight/terminal blocks preventing pickup; transport events = carrier milestones (vessel loaded, departed, arrived, discharged, rail, delivered).

Only track_container changes Terminal49 account records: it creates a tracking request to begin monitoring a number and is marked non-read-only. The other tools only fetch data and are marked read-only. All tools operate within the user's private Terminal49 account and none delete or overwrite data.

Canonical chaining: start with search_container to resolve a container number / BOL / reference into Terminal49 UUIDs, then get_container or get_shipment_details for a snapshot, then get_container_transport_events for the milestone timeline (and get_container_route for multi-leg routing if the account has it). Use get_supported_shipping_lines to resolve a carrier name to its SCAC before track_container. Use list_containers / list_shipments / list_tracking_requests for fleet-level worklists.

Tool results carry a _response_contract with presentation and follow-up hints; treat it as steering for you, not content to show the user.`;

type ResponseDisplayColumn = {
  key: string;
  label: string;
  path?: string;
  description?: string;
  compute?: string;
};

type ResponseDisplayColumnSet = {
  intent: string;
  when_user_asks: string[];
  columns: string[];
};

type ResponseDisplay = {
  preferred_format: 'table' | 'list';
  table_when_rows_gte: number;
  max_rows: number;
  default_columns: string[];
  sort: Array<{ key: string; direction: 'asc' | 'desc' }>;
  empty_state: string;
  // The full per-column catalog (~2KB) is intentionally NOT inlined on every
  // list response. Agents fetch it once from the resource below.
  column_catalog_resource: string;
  column_catalog?: ResponseDisplayColumn[];
  column_sets: ResponseDisplayColumnSet[];
  selection_strategy: string;
};

type ResponseContract = {
  purpose: string;
  can_answer: string[];
  requires_more_data: string[];
  relevant_fields: string[];
  presentation_guidance: string;
  suggested_follow_ups: string[];
  suggested_tools: string[];
  display?: ResponseDisplay;
  // List-only honesty signals. Optional so non-list contracts stay unchanged.
  dropped_filters?: string[];
  total_is_reliable?: boolean;
};

/** Resource URI for the one-time list display column catalog. */
export const LIST_DISPLAY_COLUMNS_URI = listDisplayColumnsResource.uri;

/**
 * Filters the MCP list_* tools actually forward to the Terminal49 API, by
 * entity. Anything outside an entity's vocabulary cannot scope its list and is
 * reported back to the agent as a dropped filter so it never claims a false
 * worklist. `page`, `page_size`, `include`, and `include_containers` are
 * transport/shape knobs, not scoping filters, and are ignored here.
 *
 * Tracking-request filters are explicit schema properties rather than an
 * arbitrary query-string map, so callers cannot smuggle pagination or
 * unrelated text through to the API.
 */
const SUPPORTED_LIST_FILTERS_BY_ENTITY: Record<
  ListEntityType,
  readonly string[]
> = {
  container: [],
  shipment: ['number', 'tracking_stopped'],
  tracking_request: ['request_number', 'status', 'scac'],
  unknown: [],
};

/** Non-filter knobs that must never be treated as scoping filters. */
const NON_FILTER_LIST_ARGS = new Set([
  'page',
  'page_size',
  'include',
  'include_containers',
]);

/**
 * Above this row count an unfiltered list `meta.total` almost certainly
 * reflects the whole account (admin-token firehose) rather than the user's
 * worklist, so we never present it as the filtered result size.
 */
const PLAUSIBLE_TOTAL_THRESHOLD = 1000;

function buildContentPayload(result: unknown): ToolContent[] {
  if (result && typeof result === 'object' && (result as any).summary) {
    return [{ type: 'text', text: formatAsText((result as any).summary) }];
  }

  if (result && typeof result === 'object' && (result as any).mapped) {
    return [{ type: 'text', text: formatAsText((result as any).mapped) }];
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
    const remediation = metadata.remediation
      ? `\n\nRemediation: ${metadata.remediation}`
      : '';
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
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function isFeatureNotEnabledResult(
  result: unknown,
): result is FeatureNotEnabledResult {
  return Boolean(
    result &&
    typeof result === 'object' &&
    (result as any).error === 'FeatureNotEnabled' &&
    typeof (result as any).message === 'string',
  );
}

function hasMetadataError(
  result: unknown,
): result is { _metadata: { error: string } } {
  const metadata = (result as any)?._metadata;
  return Boolean(metadata && typeof metadata.error === 'string');
}

const responseDisplayColumnSchema = z.object({
  key: z.string(),
  label: z.string(),
  path: z.string().optional(),
  description: z.string().optional(),
  compute: z.string().optional(),
});

const responseDisplayColumnSetSchema = z.object({
  intent: z.string(),
  when_user_asks: z.array(z.string()),
  columns: z.array(z.string()),
});

const responseDisplaySchema = z.object({
  preferred_format: z.enum(['table', 'list']),
  table_when_rows_gte: z.number().int().positive(),
  max_rows: z.number().int().positive(),
  default_columns: z.array(z.string()),
  sort: z.array(
    z.object({
      key: z.string(),
      direction: z.enum(['asc', 'desc']),
    }),
  ),
  empty_state: z.string(),
  column_catalog_resource: z.string(),
  column_catalog: z.array(responseDisplayColumnSchema).optional(),
  column_sets: z.array(responseDisplayColumnSetSchema),
  selection_strategy: z.string(),
});

const responseContractSchema = z.object({
  purpose: z.string(),
  can_answer: z.array(z.string()),
  requires_more_data: z.array(z.string()),
  relevant_fields: z.array(z.string()),
  presentation_guidance: z.string(),
  suggested_follow_ups: z.array(z.string()),
  suggested_tools: z.array(z.string()),
  display: responseDisplaySchema.optional(),
  dropped_filters: z.array(z.string()).optional(),
  total_is_reliable: z.boolean().optional(),
});

/** Hard ceiling for list page size. Keeps a single MCP response bounded. */
const MAX_LIST_PAGE_SIZE = 25;

const listPageSchema = z
  .number()
  .int()
  .positive()
  .optional()
  .describe('Page number (1-based)');

const listPageSizeSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_LIST_PAGE_SIZE)
  .optional()
  .default(25)
  .describe(`Page size (default 25; maximum ${MAX_LIST_PAGE_SIZE})`);

function stripLegacyIntent(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  const args = { ...value } as Record<string, unknown>;
  delete args.intent;
  return args;
}

function normalizeContract(contract: ResponseContract): ResponseContract {
  return {
    purpose: contract.purpose,
    can_answer: contract.can_answer,
    requires_more_data: contract.requires_more_data,
    relevant_fields: contract.relevant_fields,
    presentation_guidance: contract.presentation_guidance,
    suggested_follow_ups: contract.suggested_follow_ups,
    suggested_tools: contract.suggested_tools,
    display: contract.display,
    dropped_filters: contract.dropped_filters,
    total_is_reliable: contract.total_is_reliable,
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

function buildSearchContract(
  result: any,
  args: { query: string },
): ResponseContract {
  const hasContainers =
    result.total_results > 0 && (result.containers?.length ?? 0) > 0;
  const hasShipments =
    result.total_results > 0 && (result.shipments?.length ?? 0) > 0;

  return {
    purpose: `Resolve identifier ${args.query} into concrete container and shipment IDs.`,
    can_answer: [
      'container IDs and shipment references',
      'carrier/scac hints for discovered items',
      'what additional lookup step is needed',
    ],
    requires_more_data:
      hasContainers || hasShipments
        ? []
        : ['A valid/refined identifier (container/BL/reference)'],
    relevant_fields: ['containers', 'shipments', 'total_results'],
    presentation_guidance:
      hasContainers || hasShipments
        ? 'Group matches by container and shipment. Ask for clarification only when multiple entities are strong candidates.'
        : 'Ask for a clearer identifier and verify format before calling another tool.',
    suggested_follow_ups: ['get_container', 'get_shipment_details'],
    suggested_tools:
      hasContainers || hasShipments
        ? ['get_container', 'get_shipment_details']
        : ['search_container'],
  };
}

function buildTrackContract(
  result: any,
  args: { number: string },
): ResponseContract {
  const hasTrackedContainer = Boolean((result as any)?.id);
  const isPending =
    Boolean((result as any)?.tracking_request_created) && !hasTrackedContainer;
  const wasNotCreated =
    (result as any)?.error === 'NotFound' &&
    (result as any)?.tracking_request_created === false;
  const matchedButUnavailable =
    (result as any)?.error === 'ContainerUnavailable';
  const state = (result as any)?._metadata?.container_state || 'unknown';
  return {
    purpose: `Track ${args.number} and return the linked container view when possible.`,
    can_answer: [
      'tracking request creation state',
      'basic container status and metadata',
      'where to pull next (if container details are delayed)',
    ],
    requires_more_data: isPending
      ? ['container details becoming available after request linking']
      : matchedButUnavailable
        ? ['the matched container details becoming available']
        : wasNotCreated
          ? ['a verified identifier and carrier SCAC']
          : [],
    relevant_fields: [
      'tracking_request_created',
      'container_state',
      'id',
      'status',
    ],
    presentation_guidance: isPending
      ? 'Tracking request was created but container linking is not immediate. Mention this and provide next-check guidance.'
      : matchedButUnavailable
        ? 'A tracked container match exists, but its details are temporarily unavailable. Do not claim that a new tracking request was created.'
        : wasNotCreated
          ? 'No tracking request was created. Ask the user to verify the identifier and carrier; do not describe this as pending.'
          : `Use container state "${state}" to answer readiness, holds, and pickup timing.`,
    suggested_follow_ups: isPending
      ? ['list_tracking_requests', 'get_container']
      : matchedButUnavailable
        ? ['get_container', 'search_container']
        : wasNotCreated
          ? ['get_supported_shipping_lines', 'search_container']
          : ['get_container_transport_events'],
    suggested_tools: wasNotCreated
      ? ['get_supported_shipping_lines', 'search_container']
      : ['get_container', 'get_container_transport_events'],
  };
}

function buildTransportEventsContract(
  result: any,
  _args: { id: string },
): ResponseContract {
  const totalEvents = result.total_events ?? result.timeline?.length ?? 0;
  return {
    purpose:
      'Summarize what happened and forecast next likely milestone for the container.',
    can_answer: [
      'journey timeline',
      'major milestones',
      'rail/transshipment context',
    ],
    requires_more_data:
      totalEvents > 0
        ? []
        : ['recent container events becoming available from carrier feed'],
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
    purpose:
      'Help user identify a supported SCAC before creating a track request.',
    can_answer: [
      'SCAC lookup',
      'carrier aliases and names',
      'supported carrier search',
    ],
    requires_more_data:
      result.total_lines > 0 ? [] : ['additional query context'],
    relevant_fields: ['shipping_lines', 'total_lines'],
    presentation_guidance:
      'Sort carriers alphabetically and show both SCAC and company names.',
    suggested_follow_ups: ['track_container'],
    suggested_tools: ['track_container'],
  };
}

function buildRouteContract(
  result: any,
  _args: { id: string },
): ResponseContract {
  const available = Array.isArray(result.route_locations);
  return {
    purpose: 'Communicate container routing and vessel itinerary.',
    can_answer: [
      'transshipment structure',
      'leg-by-leg ETD/ETA',
      'carrier and vessel coverage',
    ],
    requires_more_data: available
      ? []
      : ['event timeline via get_container_transport_events'],
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
    can_answer: [
      'status',
      'location',
      'pickup readiness',
      'rail and shipment context',
    ],
    requires_more_data: ['holds, fees, and timeline by demand'],
    relevant_fields: [
      'id',
      'container_number',
      'status',
      'pod_terminal',
      'demurrage',
    ],
    presentation_guidance:
      'Summarize state first, then call out LFD, holds, and fees if present. If terminal availability is unclear, suggest transport events.',
    suggested_follow_ups: [
      'get_container_transport_events',
      'get_container_route',
    ],
    suggested_tools: ['get_container_transport_events', 'get_container_route'],
  };
}

function buildShipmentContract(): ResponseContract {
  return {
    purpose:
      'Explain shipment-level routing, container counts, and references.',
    can_answer: ['shipment identifiers', 'routing summary', 'container list'],
    requires_more_data: [
      'container-level ETA confidence when only one terminal is visible',
    ],
    relevant_fields: [
      'id',
      'bill_of_lading',
      'status',
      'containers',
      'routing',
    ],
    presentation_guidance:
      'Group by shipment summary then container health signals (pickup ETA, pickup_lfd, holds).',
    suggested_follow_ups: ['get_container', 'list_containers'],
    suggested_tools: ['get_container', 'list_containers'],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

type ListEntityType = 'container' | 'shipment' | 'tracking_request' | 'unknown';

function detectListEntityType(result: any): ListEntityType {
  const firstItem = Array.isArray(result?.items)
    ? asRecord(result.items[0])
    : {};

  if (
    'requestType' in firstItem ||
    'request_type' in firstItem ||
    'requestNumber' in firstItem
  ) {
    return 'tracking_request';
  }

  if (
    'billOfLading' in firstItem ||
    'bill_of_lading' in firstItem ||
    'podVesselName' in firstItem
  ) {
    return 'shipment';
  }

  if (
    'number' in firstItem ||
    'container_number' in firstItem ||
    'podDischargedAt' in firstItem
  ) {
    return 'container';
  }

  return 'unknown';
}

function buildContainerListDisplay(): ResponseDisplay {
  return {
    preferred_format: 'table',
    table_when_rows_gte: 2,
    max_rows: 25,
    default_columns: [
      'number',
      'currentStatus',
      'podDischargedAt',
      'podFullOutAt',
      'availableForPickup',
      'pickupLfd',
      'holdsCount',
      'terminals.podTerminal.name',
    ],
    sort: [{ key: 'pickupLfd', direction: 'asc' }],
    empty_state: 'No matching containers found for the current filters.',
    column_catalog_resource: LIST_DISPLAY_COLUMNS_URI,
    column_sets: [
      {
        intent: 'discharged_not_picked_up',
        when_user_asks: [
          'discharged but not picked up',
          'not picked up',
          'still at terminal',
        ],
        columns: [
          'number',
          'currentStatus',
          'podDischargedAt',
          'podFullOutAt',
          'availableForPickup',
          'pickupLfd',
          'holdsCount',
          'terminals.podTerminal.name',
        ],
      },
      {
        intent: 'pickup_readiness',
        when_user_asks: ['ready for pickup', 'can we pick up', 'pickup status'],
        columns: [
          'number',
          'availableForPickup',
          'pickupLfd',
          'holdsCount',
          'feesCount',
          'locationAtPodTerminal',
          'terminals.podTerminal.name',
        ],
      },
      {
        intent: 'holds_and_blocks',
        when_user_asks: [
          'holds',
          'blocked',
          'customs hold',
          'why not available',
        ],
        columns: [
          'number',
          'currentStatus',
          'holdsCount',
          'holdsAtPodTerminal',
          'pickupLfd',
          'terminals.podTerminal.name',
        ],
      },
      {
        intent: 'inland_rail',
        when_user_asks: ['on rail', 'inland arrival', 'destination eta'],
        columns: [
          'number',
          'podRailCarrierScac',
          'indEtaAt',
          'indAtaAt',
          'shipment.shippingLineScac',
          'shipment.billOfLading',
        ],
      },
    ],
    selection_strategy:
      'Choose the column_set whose when_user_asks best matches the user question. If none match, use default_columns. Use markdown table when row count >= table_when_rows_gte.',
  };
}

function buildShipmentListDisplay(): ResponseDisplay {
  return {
    preferred_format: 'table',
    table_when_rows_gte: 2,
    max_rows: 25,
    default_columns: [
      'billOfLading',
      'shippingLineScac',
      'podVesselName',
      'portOfDischargeName',
      'podEtaAt',
      'podAtaAt',
      'destinationEtaAt',
    ],
    sort: [{ key: 'podEtaAt', direction: 'asc' }],
    empty_state: 'No matching shipments found for the current filters.',
    column_catalog_resource: LIST_DISPLAY_COLUMNS_URI,
    column_sets: [
      {
        intent: 'vessel_arrivals',
        when_user_asks: [
          'when is vessel arriving',
          'vessel arrival',
          'eta by vessel',
        ],
        columns: [
          'podVesselName',
          'podVoyageNumber',
          'portOfDischargeName',
          'podEtaAt',
          'podAtaAt',
          'billOfLading',
          'shippingLineScac',
        ],
      },
      {
        intent: 'arrivals_by_port',
        when_user_asks: ['arriving at', 'arrivals this week', 'port arrivals'],
        columns: [
          'billOfLading',
          'podVesselName',
          'portOfDischargeName',
          'podEtaAt',
          'podAtaAt',
          'destinationName',
        ],
      },
    ],
    selection_strategy:
      'Prefer vessel_arrivals for vessel questions, arrivals_by_port for location/time-window questions, otherwise default_columns.',
  };
}

function buildTrackingRequestListDisplay(): ResponseDisplay {
  return {
    preferred_format: 'table',
    table_when_rows_gte: 2,
    max_rows: 25,
    default_columns: [
      'requestNumber',
      'requestType',
      'status',
      'scac',
      'createdAt',
      'updatedAt',
      'failedReason',
    ],
    sort: [{ key: 'updatedAt', direction: 'desc' }],
    empty_state: 'No tracking requests found for the current filters.',
    column_catalog_resource: LIST_DISPLAY_COLUMNS_URI,
    column_sets: [
      {
        intent: 'failed_requests',
        when_user_asks: ['failed tracking', 'why failed', 'tracking errors'],
        columns: [
          'requestNumber',
          'requestType',
          'status',
          'scac',
          'failedReason',
          'updatedAt',
        ],
      },
      {
        intent: 'tracking_activity',
        when_user_asks: [
          'recent tracking activity',
          'latest requests',
          'tracking queue',
        ],
        columns: [
          'requestNumber',
          'requestType',
          'status',
          'scac',
          'createdAt',
          'updatedAt',
        ],
      },
    ],
    selection_strategy:
      'Use failed_requests when user asks about errors/failures; otherwise tracking_activity.',
  };
}

export type ListRequestContext = {
  /** The filter args the caller passed to the list_* tool. */
  filters?: Record<string, unknown>;
  /** Filters the SDK reports it could not apply (echoed verbatim). */
  unsupportedFilters?: string[];
};

function isProvided(value: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return false;
  }
  // An empty array or empty plain object scopes nothing. Treating it as
  // "provided" would mark an unfiltered firehose as the user's scoped worklist
  // and falsely trust meta.total.
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

/** Filter keys the caller supplied that actually scope the list. */
function appliedFilterKeys(
  filters: Record<string, unknown> | undefined,
  entityType: ListEntityType,
  unsupportedFilters: string[] | undefined,
): string[] {
  if (!filters) {
    return [];
  }

  const supported = SUPPORTED_LIST_FILTERS_BY_ENTITY[entityType];
  const unsupported = new Set(unsupportedFilters ?? []);
  return supported.filter((key) => {
    if (unsupported.has(key)) {
      return false;
    }
    return isProvided(filters[key]);
  });
}

/**
 * Filter keys the caller supplied that the list endpoint cannot honor. Prefers
 * the SDK's own `unsupportedFilters` when present, otherwise derives them from
 * the supported vocabulary so the agent is never told a phantom filter applied.
 */
function droppedFilterKeys(
  filters: Record<string, unknown> | undefined,
  unsupportedFilters: string[] | undefined,
  entityType: ListEntityType,
): string[] {
  const fromSdk = Array.isArray(unsupportedFilters) ? unsupportedFilters : [];
  if (!filters) {
    return [...new Set(fromSdk)];
  }

  const supported = SUPPORTED_LIST_FILTERS_BY_ENTITY[entityType];
  const derived = Object.keys(filters).filter((key) => {
    if (NON_FILTER_LIST_ARGS.has(key)) {
      return false;
    }
    return isProvided(filters[key]) && !supported.includes(key);
  });

  return [...new Set([...fromSdk, ...derived])];
}

export function buildListContract(
  result: any,
  entityTypeHint?: ListEntityType,
  requestContext: ListRequestContext = {},
): ResponseContract {
  const count = result?.items ? result.items.length : 0;
  const entityType =
    entityTypeHint && entityTypeHint !== 'unknown'
      ? entityTypeHint
      : detectListEntityType(result);
  const display =
    entityType === 'container'
      ? buildContainerListDisplay()
      : entityType === 'shipment'
        ? buildShipmentListDisplay()
        : entityType === 'tracking_request'
          ? buildTrackingRequestListDisplay()
          : undefined;

  const applied = appliedFilterKeys(
    requestContext.filters,
    entityType,
    requestContext.unsupportedFilters,
  );
  const dropped = droppedFilterKeys(
    requestContext.filters,
    requestContext.unsupportedFilters,
    entityType,
  );
  const isFiltered = applied.length > 0;
  const supportedFilters = SUPPORTED_LIST_FILTERS_BY_ENTITY[entityType];
  const supportedVocab = supportedFilters.join(', ');
  const filterGuidance =
    supportedFilters.length > 0
      ? `a filter to scope this list (${supportedVocab})`
      : 'server-side filters are not available for this list endpoint; use pagination and inspect returned rows';

  const rawTotal = Number(result?.meta?.total);
  const hasTotal = Number.isFinite(rawTotal);
  // An unfiltered list whose total exceeds the plausibility threshold is almost
  // certainly the whole-account firehose, not the user's worklist. A filtered
  // total is the user's scoped result and is trusted.
  const totalIsReliable = hasTotal
    ? isFiltered || rawTotal <= PLAUSIBLE_TOTAL_THRESHOLD
    : true;

  const canAnswer: string[] = ['count and paging state'];
  canAnswer.unshift('records in the current page');
  if (isFiltered) {
    canAnswer.unshift('which records match the applied filters');
  }

  const requiresMoreData: string[] = [];
  if (!isFiltered) {
    requiresMoreData.push(filterGuidance);
  }
  if (dropped.length > 0) {
    requiresMoreData.push(
      supportedFilters.length > 0
        ? `unsupported filter(s) were ignored: ${dropped.join(', ')} — re-query using only ${supportedVocab}`
        : `unsupported filter(s) were ignored: ${dropped.join(', ')} — this endpoint has no server-side filters`,
    );
  }
  if (hasTotal && !totalIsReliable) {
    requiresMoreData.push(
      'meta.total reflects the entire account, not a filtered worklist — apply a filter before quoting a total',
    );
  }
  if (count === 0) {
    requiresMoreData.push('alternative filters or tighter date ranges');
  }

  const presentationGuidance = [
    count === 0
      ? 'No rows matched; surface the empty_state guidance rather than an empty table.'
      : count === 1
        ? 'For a single result, provide a concise row summary. For multiple rows, render a markdown table.'
        : 'Render a markdown table using the response_contract display hints. Avoid dumping full nested records.',
    !isFiltered
      ? "This is an unfiltered list; do not describe it as the user's filtered worklist. State that results are unscoped."
      : '',
    hasTotal && !totalIsReliable
      ? 'Do not quote meta.total as the answer count; it is an account-wide figure.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    purpose: 'Surface aggregate operational worklist results.',
    can_answer: canAnswer,
    requires_more_data: requiresMoreData,
    relevant_fields: ['items', 'links', 'meta', 'count'],
    presentation_guidance: presentationGuidance,
    suggested_follow_ups: ['list_containers', 'list_tracking_requests'],
    suggested_tools: [
      'list_containers',
      'list_tracking_requests',
      'get_container',
    ],
    display,
    dropped_filters: dropped.length > 0 ? dropped : undefined,
    total_is_reliable: hasTotal ? totalIsReliable : undefined,
  };
}

/**
 * Builds an assistant-only steering content block from a response contract.
 *
 * This surfaces the agent-steering hints (presentation guidance, suggested
 * follow-up tools) as a discrete content block annotated `audience:
 * ['assistant']`, so spec-aware clients can hide it from end users while still
 * delivering it to the model. The user-facing answer block (built by
 * buildContentPayload) is left unannotated and remains visible to everyone.
 */
function buildSteeringContent(contract: ResponseContract): TextContent {
  const steering = {
    _agent_steering: true,
    purpose: contract.purpose,
    presentation_guidance: contract.presentation_guidance,
    suggested_follow_ups: contract.suggested_follow_ups,
    suggested_tools: contract.suggested_tools,
  };
  return {
    type: 'text',
    text: formatAsText(steering),
    annotations: ASSISTANT_ONLY_ANNOTATION,
  };
}

/**
 * The container resource template registered below. Resource-link content
 * blocks reference these URIs so large list payloads can be replaced by compact
 * links the client can resolve on demand (resources/read), reducing context.
 */
const CONTAINER_RESOURCE_URI_PREFIX = 'terminal49://container/';

function buildContainerResourceLink(
  item: Record<string, unknown>,
): ResourceLinkContent | undefined {
  const id = typeof item.id === 'string' ? item.id : undefined;
  if (!id) {
    return undefined;
  }
  const number = typeof item.number === 'string' ? item.number : undefined;
  return {
    type: 'resource_link',
    uri: `${CONTAINER_RESOURCE_URI_PREFIX}${id}`,
    name: number ? `Container ${number}` : `Container ${id}`,
    description:
      'Compact container summary (status, milestones, holds, LFD) resolvable via resources/read.',
    mimeType: 'text/markdown',
    annotations: { audience: ['user', 'assistant'] },
  };
}

/**
 * Builds resource_link blocks for a list result, pointing each row at its
 * registered resource URI. Currently scoped to the container resource template,
 * which is the registered, resolvable surface (see DEFERRED note in PR/README
 * for shipment links, which need a shipment resource template first).
 */
function buildListResourceLinks(
  result: unknown,
  entityType: ListEntityType,
): ResourceLinkContent[] {
  if (entityType !== 'container') {
    return [];
  }
  const items = Array.isArray((result as any)?.items)
    ? (result as any).items
    : [];
  const links: ResourceLinkContent[] = [];
  for (const item of items) {
    const link = buildContainerResourceLink(asRecord(item));
    if (link) {
      links.push(link);
    }
  }
  return links;
}

function wrapToolWithContract<TArgs>(
  handler: (args: TArgs) => Promise<unknown>,
  buildContract?: (result: unknown, args: TArgs) => ResponseContract,
  buildResourceLinks?: (result: unknown, args: TArgs) => ResourceLinkContent[],
): (args: TArgs) => Promise<{
  content: ToolContent[];
  structuredContent?: any;
  isError?: boolean;
}> {
  return async (args: TArgs) => {
    try {
      const result = await handler(args);
      const contract = buildContract ? buildContract(result, args) : undefined;
      const structuredContent = contract
        ? attachResponseContract(result, contract)
        : result;

      const content: ToolContent[] = buildContentPayload(result);

      if (buildResourceLinks) {
        content.push(...buildResourceLinks(result, args));
      }

      // Steering metadata is appended as an assistant-only block so clients can
      // hide it from end users; the answer block above stays user-visible.
      if (contract) {
        content.push(buildSteeringContent(contract));
      }

      return {
        content,
        structuredContent,
      };
    } catch (error) {
      const err = error as Error;
      captureMcpException(error);
      await flushMcpEvents();
      // Log the real error for operators; never echo internal messages (which
      // can contain upstream URLs, tokens, or stack detail) back to the client.
      logMcpEvent({
        event: 'mcp.tool.error',
        error: err.name,
        message: err.message,
        timestamp: new Date().toISOString(),
      });
      return {
        content: [
          {
            type: 'text',
            text: 'The Terminal49 request could not be completed. Please retry; if it persists, contact support.',
          },
        ],
        isError: true,
      };
    }
  };
}

/**
 * Builds a completion callback for a carrier/SCAC prompt argument. It reuses
 * the live get_supported_shipping_lines data, filters by the partial value the
 * user has typed (matching SCAC, name, or short name), and returns SCAC codes
 * as completion candidates (most clients send the SCAC to track_container).
 *
 * The MCP completion spec caps suggestions at 100; we trim to a usable slice.
 * Any error (e.g. live API hiccup) degrades gracefully to no suggestions rather
 * than failing the completion request.
 */
function createCarrierScacCompleter(
  client: Terminal49Client,
): (value: string | undefined) => Promise<string[]> {
  return async (value: string | undefined): Promise<string[]> => {
    try {
      const search = typeof value === 'string' ? value.trim() : '';
      const { shipping_lines } = await executeGetSupportedShippingLines(
        { search },
        client,
      );
      return shipping_lines.slice(0, 100).map((line) => line.scac);
    } catch {
      return [];
    }
  };
}

export function createTerminal49McpServer(
  apiToken: string,
  apiBaseUrl?: string,
  accountId?: string,
): McpServer {
  const client = new Terminal49Client({
    apiToken,
    apiBaseUrl,
    accountId,
    defaultFormat: 'mapped',
  });

  const completeCarrierScac = createCarrierScacCompleter(client);

  // Observability wrapping, outermost last. Sentry's wrapper returns a wrapped
  // server; PostHog's `instrument()` patches request handlers in place and also
  // proxies `_registeredTools`, so it is applied to the object the tools below
  // are actually registered on and picks up every one of them. Both are no-ops
  // when their respective env vars are unset.
  const server = instrumentMcpServerWithPostHog(
    instrumentMcpServer(
      new McpServer(
        {
          name: 'terminal49-mcp',
          version: '1.0.0',
        },
        {
          instructions: TERMINAL49_SERVER_INSTRUCTIONS,
        },
      ),
    ),
    // Groups the stateless HTTP path's events per account instead of minting an
    // anonymous person per request.
    { distinctId: accountId },
  );

  // ==================== TOOLS ====================

  // Tool 1: Search Container
  server.registerTool(
    'search_container',
    {
      title: 'Search Containers',
      description:
        'Search for containers, shipments, and tracking information by container number, ' +
        'booking number, bill of lading, or reference number. Returns matching private-account records. ' +
        'Pass exactly one identifier, never a user message or conversation history. ' +
        'Examples: CAIU2885402, MAEU123456789, or a customer reference number.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1)
          .max(128)
          .describe(
            'One container number, booking number, Bill of Lading number, or customer reference (maximum 128 characters). Identifier only; never pass conversation text, a user message, or full history.',
          ),
      }),
      outputSchema: z.object({
        containers: z.array(
          z.object({
            id: z.string(),
            container_number: z.string(),
            status: z.string(),
            shipping_line: z.string(),
            pod_terminal: z.string().optional(),
            pol_terminal: z.string().optional(),
            destination: z.string().optional(),
            duplicate_number: z.boolean().optional(),
          }),
        ),
        shipments: z.array(
          z.object({
            id: z.string(),
            ref_numbers: z.array(z.string()),
            shipping_line: z.string(),
            container_count: z.number(),
          }),
        ),
        total_results: z.number(),
        _response_contract: responseContractSchema,
      }),
    },
    wrapToolWithContract(
      async ({ query }) => executeSearchContainer({ query }, client),
      (result, args) => buildSearchContract(result as any, args),
    ),
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
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        number: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .optional()
          .describe(
            'One container, Bill of Lading, or booking number (maximum 64 characters). Identifier only; never pass conversation text.',
          ),
        numberType: z
          .enum(['container', 'bill_of_lading', 'booking_number'])
          .optional()
          .describe(
            'Optional override: container | bill_of_lading | booking_number',
          ),
        containerNumber: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .optional()
          .describe(
            'Deprecated alias for one container number (maximum 64 characters)',
          ),
        bookingNumber: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .optional()
          .describe(
            'Deprecated alias for one booking or Bill of Lading number (maximum 64 characters)',
          ),
        scac: z
          .string()
          .trim()
          .length(4)
          .regex(/^[A-Za-z]{4}$/)
          .optional()
          .describe(
            'Optional four-letter shipping-line SCAC (e.g., MAEU for Maersk)',
          ),
        refNumbers: z
          .array(z.string().trim().min(1).max(64))
          .max(10)
          .optional()
          .describe(
            'Up to 10 reference-number identifiers, each at most 64 characters. Never pass conversation text.',
          ),
      }),
      outputSchema: z
        .object({
          error: z.string().optional(),
          message: z.string().optional(),
          id: z.string().optional(),
          container_number: z.string().optional(),
          status: z.string().optional(),
          tracking_request_created: z.boolean().optional(),
          infer_result: z.any().optional(),
          _response_contract: responseContractSchema,
        })
        .passthrough(),
    },
    wrapToolWithContract(
      async ({
        number,
        numberType,
        containerNumber,
        scac,
        bookingNumber,
        refNumbers,
      }) =>
        executeTrackContainer(
          {
            number,
            numberType,
            containerNumber,
            scac,
            bookingNumber,
            refNumbers,
          },
          client,
        ),
      (result, args) =>
        buildTrackContract(result as any, {
          number:
            args.number || args.containerNumber || args.bookingNumber || '',
        }),
    ),
  );

  // Tool 3: Get Container
  server.registerTool(
    'get_container',
    {
      title: 'Get Container Details',
      description:
        'Get container information with flexible data loading. Returns core container data (status, location, equipment, dates) ' +
        'plus optional shipment, terminal, or transport-event data. Transport events are excluded by default to keep snapshots compact.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        id: z
          .string()
          .uuid()
          .describe('The Terminal49 container ID (UUID format)'),
        include: z
          .array(z.enum(['shipment', 'pod_terminal', 'transport_events']))
          .optional()
          .default(['shipment'])
          .describe(
            "Optional related data to include. Default: ['shipment'] covers most use cases. " +
              '• shipment: Routing, BOL, line, ref numbers (lightweight, always useful) ' +
              '• pod_terminal: Terminal name, location, availability (lightweight, needed for demurrage questions) ' +
              '• transport_events: Full event history, rail tracking (heavy 50-100 events, use for journey/timeline questions)',
          ),
      }),
      outputSchema: z
        .object({
          _response_contract: responseContractSchema,
        })
        .passthrough(),
    },
    wrapToolWithContract(
      async ({ id, include }) => executeGetContainer({ id, include }, client),
      () => buildContainerContract(),
    ),
  );

  // Tool 4: Get Shipment Details
  server.registerTool(
    'get_shipment_details',
    {
      title: 'Get Shipment Details',
      description:
        'Get detailed shipment information including routing, BOL, containers, and port details. ' +
        'Returns: Bill of Lading, shipping line, port details, vessel info, ETAs, container list.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        id: z
          .string()
          .uuid()
          .describe('The Terminal49 shipment ID (UUID format)'),
        include_containers: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            'Include list of containers in this shipment. Default: true',
          ),
      }),
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
    ),
  );

  // Tool 5: Get Container Transport Events
  server.registerTool(
    'get_container_transport_events',
    {
      title: 'Get Container Transport Events',
      description:
        'Get detailed transport event timeline for a container. Returns all milestones and movements ' +
        '(vessel loaded, departed, arrived, discharged, rail movements, delivery). ' +
        'Provides journey history, timeline analysis, and rail tracking without loading the full container snapshot.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        id: z
          .string()
          .uuid()
          .describe('The Terminal49 container ID (UUID format)'),
      }),
      outputSchema: z
        .object({
          _response_contract: responseContractSchema,
        })
        .passthrough(),
    },
    wrapToolWithContract(
      async ({ id }) => executeGetContainerTransportEvents({ id }, client),
      (result, args) => buildTransportEventsContract(result as any, args),
    ),
  );

  // Tool 6: Get Supported Shipping Lines
  server.registerTool(
    'get_supported_shipping_lines',
    {
      title: 'Get Supported Shipping Lines',
      description:
        'Get list of shipping lines (carriers) supported by Terminal49 for container tracking. ' +
        'Returns SCAC codes, full names, and common abbreviations, with optional name or SCAC filtering.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        search: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .optional()
          .describe(
            'Optional carrier name or SCAC only (maximum 64 characters). Never pass a user message or conversation history.',
          ),
      }),
      outputSchema: z.object({
        total_lines: z.number(),
        shipping_lines: z.array(
          z.object({
            scac: z.string(),
            name: z.string(),
            short_name: z.string().optional(),
            bol_prefix: z.string().optional(),
            notes: z.string().optional(),
          }),
        ),
        _metadata: z.object({
          presentation_guidance: z.string(),
          error: z.string().optional(),
          remediation: z.string().optional(),
        }),
        _response_contract: responseContractSchema,
      }),
    },
    wrapToolWithContract(
      async ({ search }) =>
        executeGetSupportedShippingLines({ search }, client),
      (result) => buildShippingLineContract(result as any),
    ),
  );

  // Tool 7: Get Container Route
  server.registerTool(
    'get_container_route',
    {
      title: 'Get Container Route',
      description:
        'Get detailed routing and vessel itinerary for a container including all ports, vessels, and ETAs. ' +
        'Shows complete multi-leg journey (origin → transshipment ports → destination). ' +
        'This paid feature may not be available for every account.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        id: z
          .string()
          .uuid()
          .describe('The Terminal49 container ID (UUID format)'),
      }),
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
            }),
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
    ),
  );

  // Tool 8: List Shipments
  server.registerTool(
    'list_shipments',
    {
      title: 'List Shipments',
      description:
        'Return one intentionally requested page of shipments, optionally filtered by one shipment identifier or tracking-stopped state. Page size is capped at 25. Never pass conversation text into identifier fields.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        number: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .optional()
          .describe(
            'One shipment, booking, or Bill of Lading identifier (maximum 64 characters). Never pass conversation text.',
          ),
        tracking_stopped: z
          .boolean()
          .optional()
          .describe('Filter by whether shipping-line tracking has stopped'),
        include_containers: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Include container relationships in each shipment. Default: false to keep list responses compact.',
          ),
        page: listPageSchema,
        page_size: listPageSizeSchema,
      }),
      outputSchema: z.object({
        items: z.array(z.record(z.string(), z.any())),
        links: z.record(z.string(), z.string()).optional(),
        meta: z.record(z.string(), z.any()).optional(),
        unsupportedFilters: z.array(z.string()),
        _response_contract: responseContractSchema,
      }),
    },
    wrapToolWithContract(
      async (args) => executeListShipments(args, client),
      (result, args) =>
        buildListContract(result as any, 'shipment', {
          filters: args,
          unsupportedFilters: (result as any)?.unsupportedFilters,
        }),
    ),
  );

  // Tool 9: List Containers
  server.registerTool(
    'list_containers',
    {
      title: 'List Containers',
      description:
        'Return one intentionally requested page of containers, capped at 25 rows. The API does not expose server-side status, port, carrier, or update-time filters. Do not use this tool to pass or retrieve conversation text.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.object({
        include: z
          .array(z.enum(['shipment', 'pod_terminal']))
          .max(2)
          .optional()
          .describe(
            'Optional related records to include: shipment and/or pod_terminal',
          ),
        page: listPageSchema,
        page_size: listPageSizeSchema,
      }),
      outputSchema: z.object({
        items: z.array(z.record(z.string(), z.any())),
        links: z.record(z.string(), z.string()).optional(),
        meta: z.record(z.string(), z.any()).optional(),
        unsupportedFilters: z.array(z.string()),
        _response_contract: responseContractSchema,
      }),
    },
    wrapToolWithContract(
      async (args) => executeListContainers(args, client),
      (result, args) =>
        buildListContract(result as any, 'container', {
          filters: args,
          unsupportedFilters: (result as any)?.unsupportedFilters,
        }),
      // ResourceLinks: each container row becomes a compact link to the
      // registered terminal49://container/{id} resource, so the client can
      // resolve full details on demand instead of paying for them up front.
      (result) => buildListResourceLinks(result, 'container'),
    ),
  );

  // Tool 10: List Tracking Requests
  server.registerTool(
    'list_tracking_requests',
    {
      title: 'List Tracking Requests',
      description:
        'Return one intentionally requested page of tracking requests, optionally filtered by request identifier, status, or carrier SCAC. Page size is capped at 25. Identifier fields must never contain user messages or conversation history.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.preprocess(
        stripLegacyIntent,
        z
          .object({
            request_number: z
              .string()
              .trim()
              .min(1)
              .max(64)
              .optional()
              .describe(
                'One tracking request identifier (maximum 64 characters). Never pass conversation text.',
              ),
            status: z
              .enum(['created', 'pending', 'succeeded', 'failed'])
              .optional()
              .describe('Filter by request status (mapped to filter[status])'),
            scac: z
              .string()
              .trim()
              .length(4)
              .regex(/^[A-Za-z]{4}$/)
              .optional()
              .describe('Filter by one four-letter shipping-line SCAC'),
            page: listPageSchema,
            page_size: listPageSizeSchema,
          })
          .strict(),
      ),
      outputSchema: z.object({
        items: z.array(z.record(z.string(), z.any())),
        links: z.record(z.string(), z.string()).optional(),
        meta: z.record(z.string(), z.any()).optional(),
        _response_contract: responseContractSchema,
      }),
    },
    wrapToolWithContract(
      async (args) => executeListTrackingRequests(args, client),
      (result, args) =>
        buildListContract(result as any, 'tracking_request', {
          filters: args,
          unsupportedFilters: (result as any)?.unsupportedFilters,
        }),
    ),
  );

  // ==================== PROMPTS ====================

  // Prompt 1: Track Shipment
  server.registerPrompt(
    'track-shipment',
    {
      title: 'Track Container Shipment',
      description:
        'Quick container tracking workflow with carrier autocomplete',
      argsSchema: z.object({
        container_number: z
          .string()
          .describe('Container number (e.g., CAIU1234567)'),
        // Autocompletes from the live supported-carrier list (SCAC codes).
        // `completable` must wrap the INNER string so the MCP SDK (which
        // unwraps ZodOptional before checking isCompletable) advertises the
        // `completions` capability; `.optional()` is applied AFTER.
        carrier: completable(
          z
            .string()
            .describe('Shipping line SCAC code (e.g., MAEU for Maersk)'),
          completeCarrierScac,
        ).optional(),
      }),
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
    }),
  );

  // Prompt 2: Check Demurrage
  server.registerPrompt(
    'check-demurrage',
    {
      title: 'Check Demurrage Risk',
      description: 'Analyze demurrage/detention risk for a container',
      argsSchema: z.object({
        container_id: z.string().uuid().describe('Terminal49 container UUID'),
      }),
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
    }),
  );

  // Prompt 3: Analyze Delays
  server.registerPrompt(
    'analyze-delays',
    {
      title: 'Analyze Journey Delays',
      description: 'Identify delays and root causes in container journey',
      argsSchema: z.object({
        container_id: z.string().uuid().describe('Terminal49 container UUID'),
      }),
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
    }),
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
    },
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
    },
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
    },
  );

  // Resource 4: List Display Column Catalog (fetched once; referenced by
  // list_* contracts via column_catalog_resource instead of being inlined).
  server.registerResource(
    'list-display-columns',
    listDisplayColumnsResource.uri,
    {
      title: listDisplayColumnsResource.name,
      description: listDisplayColumnsResource.description,
      mimeType: listDisplayColumnsResource.mimeType,
    },
    async () => {
      return {
        contents: [
          {
            uri: listDisplayColumnsResource.uri,
            mimeType: listDisplayColumnsResource.mimeType,
            text: readListDisplayColumnsResource(),
          },
        ],
      };
    },
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
    console.error(
      'Get your API token at: https://app.terminal49.com/developers/api-keys',
    );
    process.exit(1);
  }

  // Long-lived process: drain queued analytics on natural exit. No-ops (and
  // registers no listener at all) when PostHog is unconfigured.
  registerPostHogExitHook();

  if (process.env.T49_MCP_STDIO_BANNER === '1') {
    console.error('Terminal49 MCP Server v1.0.0 running on stdio');
    console.error('Available: 10 tools | 3 prompts | 4 resources');
    console.error('SDK: @modelcontextprotocol/server v2 (McpServer API)');
  }

  serveStdio(() => createTerminal49McpServer(apiToken, apiBaseUrl));
}
