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
import {
  shipmentListInputSchema,
  containerListInputSchema,
  getShipmentFilters,
  getContainerFilters,
  SHIPMENT_FILTER_KEYS,
  CONTAINER_FILTER_KEYS,
  listResponseMetadataSchema,
} from './tools/list-filters.js';
import { executeListTrackingRequests } from './tools/list-tracking-requests.js';
import {
  executeListParties,
  listPartiesInputSchema,
} from './tools/list-parties.js';
import { executeSearchDocs } from './tools/search-docs.js';
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
  type McpAuthSource,
  type McpTransportKind,
  registerPostHogExitHook,
  SERVER_NAME,
  SERVER_VERSION,
} from './posthog.js';
import {
  captureMcpException,
  flushMcpEvents,
  instrumentMcpServer,
} from './sentry.js';
import { logMcpEvent } from './logging.js';

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
 * Server-level instructions (MCP `ServerOptions.instructions`). This is a
 * concise operating guide handed to the LLM at initialize time so it
 * understands the ocean-tracking domain and how to chain the tools.
 */
export const TERMINAL49_SERVER_INSTRUCTIONS = `Terminal49 tracks ocean containers and shipments live from carriers and terminals. Data is real-time from ocean carriers (by SCAC, e.g. MAEU = Maersk) and US/Canada terminals, so values change between calls.

Domain vocabulary: SCAC = 4-letter carrier code; BOL = bill of lading and booking number identify a shipment; POL/POD = port of lading/discharge; LFD = last free day (pickup deadline before demurrage accrues); demurrage/detention = late fees; holds = customs/freight/terminal blocks preventing pickup; transport events = carrier milestones (vessel loaded, departed, arrived, discharged, rail, delivered); custom fields = account-defined fields (PO number, project manager, etc.) on containers and shipments, loaded with get_container include ['custom_fields'] or get_shipment_details include_custom_fields.

Only track_container changes Terminal49 account records: it creates a tracking request to begin monitoring a number and is marked non-read-only. The other tools only fetch data and are marked read-only. All tools except search_docs operate within the user's private Terminal49 account; search_docs searches the public Terminal49 documentation. None delete or overwrite data.

Canonical chaining: start with search_container to resolve a container number / BOL / reference into Terminal49 UUIDs, then get_container or get_shipment_details for a snapshot, then get_container_transport_events for the milestone timeline (and get_container_route for multi-leg routing if the account has it). Use get_supported_shipping_lines to resolve a carrier name to its SCAC before track_container. Use list_parties to resolve a company name (customer, shipper, dray carrier) to a party ID before filtering containers by advanced_filters.parties. Use list_containers / list_shipments / list_tracking_requests for fleet-level worklists. Use search_docs for how-to and API questions (webhooks, statuses, LFD rules, SDK, MCP) and cite the returned links.`;

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
  applied_filters?: Record<string, unknown>;
  pagination_state?: 'partial_page' | 'last_page' | 'unknown';
};

/** Resource URI for the one-time list display column catalog. */
export const LIST_DISPLAY_COLUMNS_URI = listDisplayColumnsResource.uri;

const SUPPORTED_LIST_FILTERS_BY_ENTITY: Record<
  ListEntityType,
  readonly string[]
> = {
  container: CONTAINER_FILTER_KEYS,
  shipment: SHIPMENT_FILTER_KEYS,
  tracking_request: ['request_number', 'status', 'scac'],
  unknown: [],
};

/** Non-filter knobs that must never be treated as scoping filters. */
const NON_FILTER_LIST_ARGS = new Set([
  'page',
  'page_size',
  'include',
  'include_containers',
  'include_stopped_tracking',
  'view',
  'sort',
  'advanced_filters',
  'intent',
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

const METADATA_STEERING_FIELDS = new Set([
  'presentation_guidance',
  'recommendations',
  'suggestions',
  'suggested_follow_ups',
  'suggested_tools',
]);

/**
 * Defense in depth for tool executors that return factual `_metadata`.
 * Runtime responses must not carry model instructions or tool-routing hints.
 */
function stripResponseSteering(value: unknown, inMetadata = false): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripResponseSteering(item, inMetadata));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === '_agent_steering' || key === '_response_contract') {
      continue;
    }
    if (inMetadata && METADATA_STEERING_FIELDS.has(key)) {
      continue;
    }
    sanitized[key] = stripResponseSteering(
      nestedValue,
      key === '_metadata' || inMetadata,
    );
  }
  return sanitized;
}

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

  const args = requestContext.filters ?? {};
  const supportedArgs = Object.fromEntries(
    Object.entries(args).filter(
      ([key]) =>
        NON_FILTER_LIST_ARGS.has(key) ||
        SUPPORTED_LIST_FILTERS_BY_ENTITY[entityType].includes(key),
    ),
  );
  // The actively-tracked default is not a caller scope, so it never makes a list count as filtered.
  const callerArgs = { ...supportedArgs, include_stopped_tracking: true };
  const normalizedFilters: Record<string, unknown> =
    entityType === 'container'
      ? {
          ...getContainerFilters(containerListInputSchema.parse(callerArgs)),
        }
      : entityType === 'shipment'
        ? {
            ...getShipmentFilters(shipmentListInputSchema.parse(callerArgs)),
          }
        : supportedArgs;
  const applied = appliedFilterKeys(
    normalizedFilters,
    entityType,
    requestContext.unsupportedFilters,
  );
  const dropped = droppedFilterKeys(
    requestContext.filters,
    requestContext.unsupportedFilters,
    entityType,
  );
  const isFiltered = applied.length > 0;
  const links = result?.links;
  const paginationState = links?.next
    ? 'partial_page'
    : links && Object.hasOwn(links, 'next')
      ? 'last_page'
      : 'unknown';
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
  if (paginationState === 'partial_page') {
    requiresMoreData.push(
      'Results are partial. Continue with the same filters and sort and the next page from links.next before claiming a complete worklist.',
    );
  }
  if (count === 0) {
    requiresMoreData.push('alternative filters or tighter date ranges');
  }

  const presentationGuidance = [
    paginationState === 'partial_page'
      ? 'This response is a partial page; its row count is not the complete matching count.'
      : paginationState === 'last_page'
        ? 'This is the last page. Earlier pages may not have been retrieved; do not claim this page contains all matches.'
        : 'Pagination completeness is unknown; do not claim all matches have been retrieved.',
    count === 0
      ? 'No rows returned on this page; surface the empty_state guidance rather than an empty table.'
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
    applied_filters: Object.fromEntries(
      applied.map((key) => [key, normalizedFilters[key]]),
    ),
    pagination_state: paginationState,
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

function wrapTool<TArgs>(
  toolName: string,
  handler: (args: TArgs) => Promise<unknown>,
  buildResourceLinks?: (result: unknown, args: TArgs) => ResourceLinkContent[],
): (args: TArgs) => Promise<{
  content: ToolContent[];
  structuredContent?: any;
  isError?: boolean;
}> {
  return async (args: TArgs) => {
    try {
      const result = await handler(args);
      const structuredContent = stripResponseSteering(result);
      const content: ToolContent[] = buildContentPayload(structuredContent);

      if (buildResourceLinks) {
        content.push(...buildResourceLinks(structuredContent, args));
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
            text: formatToolError(toolName, args, error),
          },
        ],
        isError: true,
      };
    }
  };
}

function formatToolError(
  toolName: string,
  args: unknown,
  error: unknown,
): string {
  const input =
    args && typeof args === 'object' ? (args as Record<string, unknown>) : {};
  const id = typeof input.id === 'string' ? input.id : undefined;
  const number =
    typeof input.number === 'string'
      ? input.number
      : typeof input.containerNumber === 'string'
        ? input.containerNumber
        : typeof input.bookingNumber === 'string'
          ? input.bookingNumber
          : undefined;
  const err = error as {
    name?: string;
    message?: string;
    status?: number;
    details?: unknown;
  };
  const errorText = `${err.message ?? ''} ${safeStringify(err.details)}`;

  if (toolName === 'track_container') {
    if (!number?.trim() || /number is required/i.test(errorText)) {
      return 'number is required.';
    }
    if (
      err.name === 'ContainerCheckDigitError' ||
      /(?:iso\s*6346|check[-_\s]?digit)/i.test(errorText)
    ) {
      return `Container number ${number} fails the ISO 6346 check digit.`;
    }
  }

  if (err.name === 'NotFoundError' || err.status === 404) {
    switch (toolName) {
      case 'get_container':
      case 'get_container_transport_events':
        return `No container found with id ${id ?? '(missing)'}.`;
      case 'get_shipment_details':
        return `No shipment found with id ${id ?? '(missing)'}.`;
      case 'get_container_route':
        return `No route found for container id ${id ?? '(missing)'}.`;
      default:
        return 'The requested Terminal49 record was not found.';
    }
  }

  if (
    (toolName === 'list_shipments' || toolName === 'list_containers') &&
    err.name === 'ValidationError'
  ) {
    const details = asRecord(err.details);
    const keys: readonly string[] =
      toolName === 'list_shipments'
        ? SHIPMENT_FILTER_KEYS
        : CONTAINER_FILTER_KEYS;
    if (
      typeof details.filter === 'string' &&
      keys.includes(details.filter) &&
      err.message?.startsWith(`Invalid list filter "${details.filter}": `)
    ) {
      return `${err.message} Use the filter values and operators documented in the tool schema.`;
    }
    return 'Invalid or unsupported list filter. Use the names, values, and operators documented in the tool schema.';
  }

  if (toolName === 'track_container' && err.name === 'ValidationError') {
    return `Tracking identifier ${number} is invalid. Verify the identifier type and carrier SCAC.`;
  }

  return 'The Terminal49 request could not be completed. Contact support if the problem persists.';
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '';
  }
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

export interface Terminal49McpServerTelemetry {
  transport?: McpTransportKind;
  authSource?: McpAuthSource;
}

export function createTerminal49McpServer(
  apiToken: string,
  apiBaseUrl?: string,
  accountId?: string,
  telemetry: Terminal49McpServerTelemetry = {},
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
          name: SERVER_NAME,
          version: SERVER_VERSION,
        },
        {
          instructions: TERMINAL49_SERVER_INSTRUCTIONS,
        },
      ),
    ),
    // Groups the stateless HTTP path's events per account instead of minting an
    // anonymous person per request.
    { distinctId: accountId, ...telemetry },
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
        'Use get_container or get_shipment_details with a returned UUID for a detailed snapshot. ' +
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
      }),
    },
    wrapTool('search_container', async ({ query }) =>
      executeSearchContainer({ query }, client),
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
        'and returns detailed container information. If a newly created request is still pending, ' +
        'use list_tracking_requests to check its status.',
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
        })
        .passthrough(),
    },
    wrapTool(
      'track_container',
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
    ),
  );

  // Tool 3: Get Container
  server.registerTool(
    'get_container',
    {
      title: 'Get Container Details',
      description:
        'Get container information with flexible data loading. Returns core container data (status, location, equipment, dates) ' +
        'plus optional shipment, terminal, or transport-event data. Transport events are excluded by default to keep snapshots compact. ' +
        'Call get_container_transport_events for the complete milestone timeline.',
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
          .array(
            z.enum([
              'shipment',
              'pod_terminal',
              'transport_events',
              'custom_fields',
            ]),
          )
          .optional()
          .default(['shipment'])
          .describe(
            "Optional related data to include. Default: ['shipment'] covers most use cases. " +
              '• shipment: Routing, BOL, line, ref numbers (lightweight, always useful) ' +
              '• pod_terminal: Terminal name, location, availability (lightweight, needed for demurrage questions) ' +
              '• transport_events: Event summary (count, rail event count, and latest event); use get_container_transport_events for the full timeline ' +
              '• custom_fields: Account-defined fields such as PO number or project manager (lightweight; needs a signed-in user, not an API key)',
          ),
      }),
      outputSchema: z.object({}).passthrough(),
    },
    wrapTool('get_container', async ({ id, include }) =>
      executeGetContainer({ id, include }, client),
    ),
  );

  // Tool 4: Get Shipment Details
  server.registerTool(
    'get_shipment_details',
    {
      title: 'Get Shipment Details',
      description:
        'Get detailed shipment information including routing, BOL, containers, and port details. ' +
        'Returns: Bill of Lading, shipping line, port details, vessel info, ETAs, container list. ' +
        'Use get_container with a returned container UUID for pickup availability, holds, fees, and last free day.',
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
        include_custom_fields: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Include account-defined custom fields (e.g. PO number, project manager) set on this shipment. Needs a signed-in user, not an API key. Default: false',
          ),
      }),
      outputSchema: z.object({}).passthrough(),
    },
    wrapTool(
      'get_shipment_details',
      async ({ id, include_containers, include_custom_fields }) =>
        executeGetShipmentDetails(
          { id, include_containers, include_custom_fields },
          client,
        ),
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
      outputSchema: z.object({}).passthrough(),
    },
    wrapTool('get_container_transport_events', async ({ id }) =>
      executeGetContainerTransportEvents({ id }, client),
    ),
  );

  // Tool 6: Get Supported Shipping Lines
  server.registerTool(
    'get_supported_shipping_lines',
    {
      title: 'Get Supported Shipping Lines',
      description:
        'Get list of shipping lines (carriers) supported by Terminal49 for container tracking. ' +
        'Returns SCAC codes, full names, and common abbreviations, with optional name or SCAC filtering. ' +
        'Pass the returned four-letter SCAC to track_container when carrier inference is ambiguous.',
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
      }),
    },
    wrapTool('get_supported_shipping_lines', async ({ search }) =>
      executeGetSupportedShippingLines({ search }, client),
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
        // Feature gating / errors
        error: z.string().optional(),
        message: z.string().optional(),
        alternative: z.string().optional(),
      }),
    },
    wrapTool('get_container_route', async ({ id }) =>
      executeGetContainerRoute({ id }, client),
    ),
  );

  // Tool 8: List Shipments
  server.registerTool(
    'list_shipments',
    {
      title: 'List Shipments',
      description:
        'Return one requested page of shipments using common filters or advanced_filters for the confirmed public API catalog. Page size is capped at 25. ' +
        'Like the dashboard, only actively tracked shipments are returned unless an explicit tracking filter is supplied. Set include_stopped_tracking: true for history across active and stopped records; use actively_tracked: false or tracking_stopped: true for stopped records only. Report meta.total for the requested set. ' +
        'Use schema values and resolve UUIDs from authorized records. If links.next exists, results are partial: continue with the same filters and sort and the next page. A last page does not mean earlier pages were retrieved. Use get_shipment_details with a returned UUID for routing and container details. Never pass conversation text into identifier fields.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.preprocess(stripLegacyIntent, shipmentListInputSchema),
      outputSchema: z.object({
        items: z.array(z.record(z.string(), z.any())),
        links: z.record(z.string(), z.string().nullable()).optional(),
        meta: z.record(z.string(), z.any()).optional(),
        unsupportedFilters: z.array(z.string()),
        _metadata: listResponseMetadataSchema,
      }),
    },
    wrapTool('list_shipments', async (args) =>
      executeListShipments(args, client),
    ),
  );

  // Tool 9: List Containers
  server.registerTool(
    'list_containers',
    {
      title: 'List Containers',
      description:
        'Return one requested page of containers using common status, port, carrier, milestone, hold and fee filters, or advanced_filters for the confirmed public API catalog. Page size is capped at 25. ' +
        'Like the dashboard, only actively tracked containers are returned unless an explicit tracking filter is supplied. Set include_stopped_tracking: true for history across active and stopped records; use actively_tracked: false for stopped records only. ' +
        'Use the dashboard definitions and report meta.total for that set before any narrowing: ready for pickup = current_status available; at risk of demurrage or needs attention = requires_attention true with sort attention_priority (the Containers at Risk view); discharged but not picked up = current_status available,not_available,grounded,awaiting_inland_transfer. ' +
        'Add extra conditions such as LFD windows, fees or holds only when the user asks, and present them as a subset of that total. ' +
        'Compact rows preserve terminal freshness, POD timezone, shipment ID and active hold descriptions. Empty holds/fees arrays mean none reported; omitted holds/fees mean unavailable, not none. Use schema values and resolve UUIDs from authorized records. If links.next exists, results are partial: continue with the same filters and sort and the next page. A last page does not mean earlier pages were retrieved. Use get_container with a returned UUID for a detailed snapshot. Do not pass conversation text into filters.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.preprocess(stripLegacyIntent, containerListInputSchema),
      outputSchema: z.object({
        items: z.array(z.record(z.string(), z.any())),
        links: z.record(z.string(), z.string().nullable()).optional(),
        meta: z.record(z.string(), z.any()).optional(),
        unsupportedFilters: z.array(z.string()),
        _metadata: listResponseMetadataSchema,
      }),
    },
    wrapTool(
      'list_containers',
      async (args) => executeListContainers(args, client),
      // ResourceLinks: each container row becomes a compact link to the
      // registered terminal49://container/{id} resource, so the client can
      // resolve full details on demand instead of paying for them up front.
      (result) => buildListResourceLinks(result, 'container'),
    ),
  );

  // Tool 9b: List Parties
  server.registerTool(
    'list_parties',
    {
      title: 'List Parties',
      description:
        "Find the companies on this account's shipments (customers, shippers, consignees, customs brokers, freight forwarders, dray carriers) by name and return their IDs. " +
        'Search matches company-name substrings, ignoring case. Follow next_page with the same search and limit. Use nickname and role_names to distinguish matches, and ask the user when ambiguous. Use it before list_containers when a question names a company, then filter with advanced_filters.parties keyed by role, for example { "customer": "<id>" }.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      inputSchema: z.preprocess(stripLegacyIntent, listPartiesInputSchema),
      outputSchema: z.object({
        total_matched: z.number(),
        parties: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            nickname: z.string().optional(),
            role_names: z.array(z.string()).optional(),
          }),
        ),
        page: z.number().int().positive(),
        next_page: z.number().int().positive().nullable(),
        truncated: z.boolean(),
        usage: z.string(),
      }),
    },
    wrapTool('list_parties', async (args) => executeListParties(args, client)),
  );

  // Tool 10: List Tracking Requests
  server.registerTool(
    'list_tracking_requests',
    {
      title: 'List Tracking Requests',
      description:
        'Return one intentionally requested page of tracking requests, optionally filtered by request identifier, status, or carrier SCAC. Page size is capped at 25. For succeeded requests, use search_container to resolve the tracked identifier into container or shipment UUIDs. Identifier fields must never contain user messages or conversation history.',
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
      }),
    },
    wrapTool('list_tracking_requests', async (args) =>
      executeListTrackingRequests(args, client),
    ),
  );

  // Tool 11: Search Docs
  server.registerTool(
    'search_docs',
    {
      title: 'Search Terminal49 Docs',
      description:
        'Search the public Terminal49 documentation (terminal49.com/docs): API guides, webhooks, ' +
        'container statuses, holds and last free day rules, DataSync, the SDK, and this MCP server. ' +
        'Returns matching sections with title, link, and an excerpt. Use it for how-to and definition ' +
        'questions, not for account data, and cite the links in the answer.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
      inputSchema: z.object({
        query: z
          .string()
          .trim()
          .min(1)
          .max(256)
          .describe(
            'A short documentation search query (maximum 256 characters), e.g. "webhook retries".',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('Maximum results to return (1-10, default 5).'),
      }),
      outputSchema: z.object({
        query: z.string(),
        total_results: z.number(),
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            page: z.string(),
            content: z.string(),
          }),
        ),
      }),
    },
    wrapTool('search_docs', async ({ query, limit }) =>
      executeSearchDocs(
        { query, limit },
        { assistantApiKey: process.env.MINTLIFY_ASSISTANT_API_KEY },
      ),
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

  serveStdio(() =>
    createTerminal49McpServer(apiToken, apiBaseUrl, undefined, {
      transport: 'stdio',
    }),
  );
}
