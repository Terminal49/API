/**
 * Terminal49 MCP Server
 * Implementation using the MCP TypeScript SDK v2 McpServer API
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import {
  completable,
  McpServer,
  ResourceTemplate,
  type StandardSchemaWithJSON,
  type ToolCallback,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';
import { executeGetContainer } from './tools/get-container.js';
import { executeTrackContainer } from './tools/track-container.js';
import { executeSearchContainer } from './tools/search-container.js';
import { executeGetShipmentDetails } from './tools/get-shipment-details.js';
import {
  executeGetContainerTransportEvents,
  getContainerTransportEventsTool,
} from './tools/get-container-transport-events.js';
import { executeGetSupportedShippingLines } from './tools/get-supported-shipping-lines.js';
import {
  routeSummaryOrSoftErrorSchema,
  executeGetContainerRoute,
  type FeatureNotEnabledResult,
} from './tools/get-container-route.js';
import { executeListShipments } from './tools/list-shipments.js';
import { executeListContainers } from './tools/list-containers.js';
import {
  executeSummarizeContainers,
  summarizeContainersInputSchema,
} from './tools/summarize-containers.js';
import {
  shipmentListInputSchema,
  containerListInputSchema,
  getShipmentFilters,
  getContainerFilters,
  SHIPMENT_FILTER_KEYS,
  CONTAINER_FILTER_KEYS,
  listResponseMetadataSchema,
} from './tools/list-filters.js';
import {
  executeListTrackingRequests,
  TRACKING_REQUEST_STATUS_FILTERS,
} from './tools/list-tracking-requests.js';
import {
  executeListParties,
  listPartiesInputSchema,
} from './tools/list-parties.js';
import { executeSearchDocs } from './tools/search-docs.js';
import { executeWhoami } from './tools/whoami.js';
import {
  DEFAULT_TOOLSETS,
  defaultTools,
  selectTools,
  type ToolDefinition,
  type ToolName,
  type Toolset,
} from './tools/registry.js';
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
import { buildServerInstructions } from './instructions.js';

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

/** Registers one tool on the server from its registry definition. */
type ToolRegistrar = (definition: ToolDefinition) => void;

/** The instructions a server with the default toolsets sends. */
export const TERMINAL49_SERVER_INSTRUCTIONS =
  buildServerInstructions(defaultTools());

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
 * MCP-owned response metadata must not carry model instructions or tool-routing hints.
 */
function stripResponseSteering(
  value: unknown,
  inMetadata = false,
  path: (string | number)[] = [],
  toolName?: string,
): unknown {
  // Only reported values at these two tool-owned paths are opaque data.
  // Keep steering cleanup everywhere else, including MCP-owned metadata.
  if (
    path.length === 3 &&
    path[2] === 'value' &&
    ((toolName === 'get_container_transport_events' &&
      path[0] === 'timeline' &&
      typeof path[1] === 'number') ||
      (toolName === 'get_container' &&
        path[0] === 'events' &&
        path[1] === 'latest_event'))
  )
    return value;
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      stripResponseSteering(item, inMetadata, [...path, index], toolName),
    );
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
      [...path, key],
      toolName,
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
      const structuredContent = stripResponseSteering(
        result,
        false,
        [],
        toolName,
      );
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
    if (err.name === 'TrackContainerError' && err.message) {
      return err.message;
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
    (toolName === 'list_shipments' ||
      toolName === 'list_containers' ||
      toolName === 'summarize_containers') &&
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
      return `${err.message.replace(/[.\s]*$/, '.')} Use the filter values and operators documented in the tool schema.`;
    }
    return 'Invalid or unsupported list filter. Use the names, values, and operators documented in the tool schema.';
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

export interface Terminal49McpServerOptions {
  transport?: McpTransportKind;
  authSource?: McpAuthSource;
  /** Toolsets to register. Defaults to DEFAULT_TOOLSETS. */
  toolsets?: readonly Toolset[];
  /** Register only tools whose readOnlyHint is true. */
  readOnly?: boolean;
}

export function createTerminal49McpServer(
  apiToken: string,
  apiBaseUrl?: string,
  accountId?: string,
  options: Terminal49McpServerOptions = {},
): McpServer {
  const client = new Terminal49Client({
    apiToken,
    apiBaseUrl,
    accountId,
    defaultFormat: 'mapped',
  });

  const selectedTools = selectTools({
    toolsets: options.toolsets ?? DEFAULT_TOOLSETS,
    readOnly: options.readOnly ?? false,
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
          instructions: buildServerInstructions(selectedTools),
        },
      ),
    ),
    // Groups the stateless HTTP path's events per account instead of minting an
    // anonymous person per request.
    {
      distinctId: accountId,
      transport: options.transport,
      authSource: options.authSource,
    },
  );

  // ==================== TOOLS ====================

  const tool =
    <
      InputArgs extends StandardSchemaWithJSON,
      OutputArgs extends StandardSchemaWithJSON,
    >(
      spec: {
        description: string;
        inputSchema: InputArgs;
        outputSchema: OutputArgs;
      },
      handler: (
        args: StandardSchemaWithJSON.InferOutput<InputArgs>,
      ) => Promise<unknown>,
      buildResourceLinks?: (result: unknown) => ResourceLinkContent[],
    ): ToolRegistrar =>
    (definition) => {
      server.registerTool(
        definition.name,
        {
          title: definition.title,
          description: spec.description,
          annotations: definition.annotations,
          inputSchema: spec.inputSchema,
          outputSchema: spec.outputSchema,
        },
        // SAFETY: the callback takes the parsed output of `spec.inputSchema`,
        // which is what ToolCallback<InputArgs> resolves to. TypeScript cannot
        // resolve that conditional type while InputArgs is still generic.
        wrapTool(
          definition.name,
          handler,
          buildResourceLinks,
        ) as ToolCallback<InputArgs>,
      );
    };

  const tools = {
    search_container: tool(
      {
        description:
          'Search for containers, shipments, and tracking information by container number, ' +
          'booking number, bill of lading, or reference number. Returns matching private-account containers, shipments, and tracking requests. Only a request whose tracking was stopped (status tracking_stopped) carries shipment_id. Succeeded requests appear as their container or shipment, and a request whose number matches a returned shipment is omitted. ' +
          'Use get_container or get_shipment_details with a returned UUID for a detailed snapshot. ' +
          'Pass exactly one identifier, never a user message or conversation history. ' +
          'Examples: CAIU2885402, MAEU123456789, or a customer reference number.',
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
          tracking_requests: z.array(
            z.object({
              id: z.string(),
              request_number: z.string(),
              status: z.string(),
              failed_reason: z.string().optional(),
              scac: z.string().optional(),
              shipment_id: z.string().optional(),
            }),
          ),
          total_results: z.number(),
        }),
      },
      async ({ query }) => executeSearchContainer({ query }, client),
    ),
    track_container: tool(
      {
        description:
          'Track a container, bill of lading, or booking number. ' +
          "If the number matches a container that is still being tracked, returns that container's details; " +
          'if it matches an in-progress tracking request, returns that request. ' +
          'Otherwise uses inference to choose the carrier/type when possible and creates a tracking request. ' +
          'A new request returns the request (id, request_number, number_type, scac). ' +
          'Container details come back only when the create response links a container, which a new request normally does not, ' +
          'so poll list_tracking_requests for its status, then use search_container or get_shipment_details. ' +
          'When the carrier cannot be inferred it asks for scac; a container prefix names the equipment owner, not the carrier.',
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
              'Four-letter shipping-line SCAC (e.g., MAEU for Maersk). Optional, but required when Terminal49 cannot infer the carrier.',
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
    get_container: tool(
      {
        description:
          'Get container information with flexible data loading. Returns core container data (status, location, equipment, dates) ' +
          'plus optional shipment, terminal, or transport-event data. Transport events are excluded by default to keep snapshots compact. ' +
          'Call get_container_transport_events for the complete milestone timeline.',
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
                '• transport_events: Active event summary (count, rail event count, and latest event); use get_container_transport_events for the full timeline ' +
                '• custom_fields: Account-defined fields such as PO number or project manager (lightweight; needs a signed-in user, not an API key)',
            ),
        }),
        outputSchema: z.object({}).passthrough(),
      },
      async ({ id, include }) => executeGetContainer({ id, include }, client),
    ),
    get_shipment_details: tool(
      {
        description:
          'Get detailed shipment information including routing, BOL, containers, and port details. ' +
          'Returns: Bill of Lading, shipping line, port details, vessel info, ETAs, container list. ' +
          'Use get_container with a returned container UUID for pickup availability, holds, fees, and last free day.',
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
      async ({ id, include_containers, include_custom_fields }) =>
        executeGetShipmentDetails(
          { id, include_containers, include_custom_fields },
          client,
        ),
    ),
    get_container_transport_events: tool(
      {
        description: getContainerTransportEventsTool.description,
        inputSchema: z.object({
          id: z
            .string()
            .uuid()
            .describe('The Terminal49 container ID (UUID format)'),
        }),
        outputSchema: z.object({}).passthrough(),
      },
      async ({ id }) => executeGetContainerTransportEvents({ id }, client),
    ),
    get_supported_shipping_lines: tool(
      {
        description:
          'Get list of shipping lines (carriers) supported by Terminal49 for container tracking. ' +
          'Returns SCAC codes, full names, and common abbreviations, with optional name or SCAC filtering. ' +
          (selectedTools.some((tool) => tool.name === 'track_container')
            ? 'Pass the returned four-letter SCAC to track_container when carrier inference is ambiguous.'
            : 'Use the returned four-letter SCAC when a carrier code is needed.'),
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
      async ({ search }) =>
        executeGetSupportedShippingLines({ search }, client),
    ),
    get_container_route: tool(
      {
        description:
          'Get the ocean route for a container: ports in order (POL, transshipment ports, POD) with ETA/ATA and ETD/ATD, ' +
          'plus the vessel carrying it now (name, IMO, voyage, position with the time it was reported, speed) while it is at sea. ' +
          'This paid feature (Routing Data) may not be available for every account.',
        inputSchema: z.object({
          id: z
            .string()
            .uuid()
            .describe('The Terminal49 container ID (UUID format)'),
        }),
        outputSchema: routeSummaryOrSoftErrorSchema,
      },
      async ({ id }) => executeGetContainerRoute({ id }, client),
    ),
    list_shipments: tool(
      {
        description:
          'Return one requested page of shipments using common filters or advanced_filters for the confirmed public API catalog. Page size is capped at 25. ' +
          'Like the dashboard, only actively tracked shipments are returned unless include_stopped_tracking is true (use it for history over a past period). Report meta.total for the requested set. ' +
          'Use schema values and resolve UUIDs from authorized records. If links.next exists, results are partial: continue with the same filters and sort and the next page. A last page does not mean earlier pages were retrieved. Use get_shipment_details with a returned UUID for routing and container details. Never pass conversation text into identifier fields.',
        inputSchema: z.preprocess(stripLegacyIntent, shipmentListInputSchema),
        outputSchema: z.object({
          items: z.array(z.record(z.string(), z.any())),
          links: z.record(z.string(), z.string().nullable()).optional(),
          meta: z.record(z.string(), z.any()).optional(),
          unsupportedFilters: z.array(z.string()),
          _metadata: listResponseMetadataSchema,
        }),
      },
      async (args) => executeListShipments(args, client),
    ),
    list_containers: tool(
      {
        description:
          'Return one requested page of containers using common status, port, carrier, milestone, hold and fee filters, or advanced_filters for the confirmed public API catalog. Page size is capped at 25. ' +
          'Like the dashboard, only actively tracked containers are returned unless include_stopped_tracking is true (use it for history such as pickups or dwell over a past period). ' +
          'Use the dashboard definitions and report meta.total for that set before any narrowing: ready for pickup = current_status available; at risk of demurrage or needs attention = requires_attention true with sort attention_priority (the Containers at Risk view); discharged but not picked up = current_status available,not_available,grounded,awaiting_inland_transfer. ' +
          'Add extra conditions such as LFD windows, fees or holds only when the user asks, and present them as a subset of that total. ' +
          'Use schema values and resolve UUIDs from authorized records. If links.next exists, results are partial: continue with the same filters and sort and the next page. A last page does not mean earlier pages were retrieved. Use get_container with a returned UUID for a detailed snapshot. Do not pass conversation text into filters.',
        inputSchema: z.preprocess(stripLegacyIntent, containerListInputSchema),
        outputSchema: z.object({
          items: z.array(z.record(z.string(), z.any())),
          links: z.record(z.string(), z.string().nullable()).optional(),
          meta: z.record(z.string(), z.any()).optional(),
          unsupportedFilters: z.array(z.string()),
          _metadata: listResponseMetadataSchema,
        }),
      },
      async (args) => executeListContainers(args, client),
      // ResourceLinks: each container row becomes a compact link to the
      // registered terminal49://container/{id} resource, so the client can
      // resolve full details on demand instead of paying for them up front.
      (result) => buildListResourceLinks(result, 'container'),
    ),
    summarize_containers: tool(
      {
        description:
          'Count containers grouped by POD terminal, status, shipping line, port of discharge, hold type, LFD date or POD arrival date, using the same filters as list_containers. ' +
          'Use it for "how many" and "break down by" questions; use list_containers for "which ones". ' +
          'Like the dashboard, only actively tracked containers are counted unless include_stopped_tracking is true. ' +
          'hold_type counts each distinct current POD hold name, including pending holds, so a container with two holds counts twice; dates follow dashboard display timezones, falling back to UTC when missing or invalid. A null key means the container has no value (no hold, no LFD, no arrival). ' +
          'Report the total, and say so when truncated is true (more than 200 groups).',
        inputSchema: z.preprocess(
          stripLegacyIntent,
          summarizeContainersInputSchema,
        ),
        outputSchema: z.object({
          total: z.number(),
          group_by: z.string(),
          truncated: z.boolean(),
          groups: z.array(
            z.object({
              key: z.string().nullable(),
              label: z.string().nullable(),
              count: z.number(),
            }),
          ),
          applied_filters: z.record(z.string(), z.unknown()),
        }),
      },
      async (args) => executeSummarizeContainers(args, client),
    ),
    list_parties: tool(
      {
        description:
          "Find the companies on this account's shipments (customers, shippers, consignees, customs brokers, freight forwarders, dray carriers) by name and return their IDs. " +
          'Use it before list_containers or summarize_containers when a question names a company, then filter with advanced_filters.parties keyed by role, for example { "customer": "<id>" }.',
        inputSchema: z.preprocess(stripLegacyIntent, listPartiesInputSchema),
        outputSchema: z.object({
          total_matched: z.number(),
          parties: z.array(z.object({ id: z.string(), name: z.string() })),
          truncated: z.boolean(),
          usage: z.string(),
        }),
      },
      async (args) => executeListParties(args, client),
    ),
    list_tracking_requests: tool(
      {
        description:
          'Return one intentionally requested page of tracking requests, optionally filtered by request identifier, status, or carrier SCAC. Page size is capped at 25. A request whose status is created has succeeded; its shipment.id is the shipment UUID for get_shipment_details. Identifier fields must never contain user messages or conversation history.',
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
                .enum(TRACKING_REQUEST_STATUS_FILTERS)
                .optional()
                .describe(
                  'Filter by request status: pending (still being processed), created (succeeded: the shipment was created), failed, or cancelled. ' +
                    'This filter cannot select awaiting_manifest (still being processed while the carrier manifest is pending) or tracking_stopped; ' +
                    'to find those, pass request_number without status.',
                ),
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
      async (args) => executeListTrackingRequests(args, client),
    ),
    search_docs: tool(
      {
        description:
          'Search the public Terminal49 documentation (terminal49.com/docs): API guides, webhooks, ' +
          'container statuses, holds and last free day rules, DataSync, the SDK, and this MCP server. ' +
          'Returns matching sections with title, link, and an excerpt. Use it for how-to and definition ' +
          'questions, not for account data, and cite the links in the answer.',
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
      async ({ query, limit }) =>
        executeSearchDocs(
          { query, limit },
          { assistantApiKey: process.env.MINTLIFY_ASSISTANT_API_KEY },
        ),
    ),
    whoami: tool(
      {
        description:
          'Identify the caller: whether this session uses an API key or a signed-in user, which ' +
          'Terminal49 account it is scoped to (company name, business type, plan, location), and ' +
          'which gated features that credential can use here (data_out_api, custom_fields, ' +
          'routing_data, rail_data, stop_tracking, trade_intel). Each feature carries a status: ' +
          'available, requires_paid_plan, requires_user_credential, or not_enabled. Call it when ' +
          'the user asks who they are or which account is connected, when another tool returns ' +
          'nothing or an authorization error, or before relying on a gated feature. Takes no arguments.',
        inputSchema: z.object({}),
        outputSchema: z.object({
          kind: z.enum(['api_key', 'user']),
          channel: z.string(),
          credential_name: z.string().nullable(),
          account: z.object({
            id: z.string(),
            company_name: z.string(),
            company_type: z.string().nullable(),
            plan: z.string().nullable(),
            scac: z.string().nullable(),
            abbr_name: z.string().nullable(),
            location: z.string().nullable(),
            tracking_slots: z
              .object({
                limit: z.number(),
                used: z.number(),
                remaining: z.number(),
              })
              .nullable(),
          }),
          user: z
            .object({
              id: z.string(),
              email: z.string(),
              name: z.string().nullable(),
              role: z.string().nullable(),
              job_role: z.string().nullable(),
              job_title: z.string().nullable(),
              terminal49_staff: z.boolean(),
            })
            .nullable(),
          other_accounts: z.array(
            z.object({ id: z.string(), company_name: z.string() }),
          ),
          features: z.record(z.string(), z.object({ status: z.string() })),
        }),
      },
      async () => executeWhoami(client),
    ),
  } satisfies Record<ToolName, ToolRegistrar>;

  for (const definition of selectedTools) {
    tools[definition.name](definition);
  }

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
          .describe('Container number (e.g., MSKU4330011)'),
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
