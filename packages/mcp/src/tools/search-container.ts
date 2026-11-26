/**
 * search_container tool
 * Search for containers, shipments, or other entities using Terminal49 search API
 */

import { Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';
import { statusLabel } from '../lib/container-status.js';
import { executeGetShipmentDetails } from './get-shipment-details.js';

export interface SearchContainerArgs {
  query: string;
}

export interface SearchResult {
  containers: Array<{
    id: string;
    container_number: string;
    /** Dashboard status label; omitted when the result carries no status. */
    status?: string;
    shipping_line: string;
    pod_terminal?: string;
    pol_terminal?: string;
    destination?: string;
    /** True when more than one result shares this container_number. */
    duplicate_number?: boolean;
    /** Shipment carrying this container, when the search result names it. */
    shipment_id?: string;
  }>;
  shipments: Array<{
    id: string;
    ref_numbers: string[];
    shipping_line: string;
    container_count: number;
  }>;
  tracking_requests: Array<{
    id: string;
    request_number: string;
    /** Tracking request status (pending, failed, ...), not a container status. */
    status: string;
    failed_reason?: string;
    scac?: string;
    shipment_id?: string;
  }>;
  total_results: number;
}

function toTextOrUndefined(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function toText(value: unknown, fallback = 'Unknown'): string {
  return toTextOrUndefined(value) ?? fallback;
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toTextOrUndefined(item))
    .filter((item): item is string => Boolean(item));
}

export async function executeSearchContainer(
  args: SearchContainerArgs,
  client: Terminal49Client,
): Promise<SearchResult> {
  const query = args.query.trim();
  if (!query) {
    throw new Error('Search query is required');
  }

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'search_container',
    query,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await client.search(query);
    const formattedResult = formatSearchResponse(result);

    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'search_container',
      query,
      total_results: formattedResult.total_results,
      containers_found: formattedResult.containers.length,
      shipments_found: formattedResult.shipments.length,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    return formattedResult;
  } catch (error) {
    const duration = Date.now() - startTime;

    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'search_container',
      query,
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}

/**
 * Format search API response into structured result
 */
function formatSearchResponse(apiResponse: any): SearchResult {
  const data = apiResponse?.data
    ? Array.isArray(apiResponse.data)
      ? apiResponse.data
      : [apiResponse.data]
    : [];
  const included = Array.isArray(apiResponse?.included)
    ? apiResponse.included
    : [];

  const containers: SearchResult['containers'] = [];
  const shipments: SearchResult['shipments'] = [];
  const trackingRequests: SearchResult['tracking_requests'] = [];

  // Process main data - search API returns type="search_result"
  for (const item of data) {
    if (!item) continue;

    // Search API returns "search_result" with entity_type attribute
    if (item.type === 'search_result') {
      const attrs = item.attributes || {};
      const entityType = attrs.entity_type;

      if (entityType === 'cargo' || entityType === 'container') {
        containers.push(formatSearchResult(item));
      } else if (entityType === 'shipment') {
        shipments.push(formatSearchResultShipment(item));
      } else if (entityType === 'tracking_request') {
        trackingRequests.push(formatSearchResultTrackingRequest(item));
      }
    }
    // Legacy format support
    else if (item.type === 'container') {
      containers.push(formatContainer(item, included));
    } else if (item.type === 'shipment') {
      shipments.push(formatShipment(item, included));
    }
  }

  // Also check included array for containers
  for (const item of included) {
    if (item.type === 'container') {
      // Avoid duplicates
      if (!containers.find((c) => c.id === item.id)) {
        containers.push(formatContainer(item, included));
      }
    } else if (item.type === 'shipment') {
      if (!shipments.find((s) => s.id === item.id)) {
        shipments.push(formatShipment(item, included));
      }
    }
  }

  flagDuplicateContainerNumbers(containers);

  return {
    containers,
    shipments,
    tracking_requests: trackingRequests,
    total_results:
      containers.length + shipments.length + trackingRequests.length,
  };
}

/**
 * Same container number can resolve to multiple records (re-tracked, multiple
 * carriers/shipments). Flag every member of a duplicate group so the caller can
 * disambiguate by id/SCAC/status instead of silently picking one.
 */
function flagDuplicateContainerNumbers(
  containers: SearchResult['containers'],
): void {
  const counts = new Map<string, number>();
  for (const container of containers) {
    const key = container.container_number;
    if (key && key !== 'Unknown') {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  for (const container of containers) {
    if ((counts.get(container.container_number) ?? 0) > 1) {
      container.duplicate_number = true;
    }
  }
}

/**
 * Format search_result type container
 */
function formatSearchResult(searchResult: any): SearchResult['containers'][0] {
  const attrs = searchResult.attributes || {};

  return {
    id: String(searchResult.id),
    container_number: toText(attrs.number),
    status: containerStatus(attrs),
    shipping_line: toText(attrs.scac || attrs.carrier_scac || attrs.carrier),
    pod_terminal: toTextOrUndefined(attrs.port_of_discharge_name),
    pol_terminal: toTextOrUndefined(attrs.port_of_lading_name),
    destination: toTextOrUndefined(attrs.port_of_discharge_name),
    shipment_id: toTextOrUndefined(attrs.shipment_id),
  };
}

/**
 * Format search_result type shipment
 */
function formatSearchResultShipment(
  searchResult: any,
): SearchResult['shipments'][0] {
  const attrs = searchResult.attributes || {};

  return {
    id: String(searchResult.id),
    ref_numbers: toStringList(attrs.ref_numbers),
    shipping_line: toText(attrs.scac || attrs.shipping_line),
    container_count: Number.isFinite(Number(attrs.containers_count))
      ? Number(attrs.containers_count)
      : 0,
  };
}

function formatSearchResultTrackingRequest(
  searchResult: any,
): SearchResult['tracking_requests'][0] {
  const attrs = searchResult.attributes || {};

  return {
    id: String(searchResult.id),
    request_number: toText(attrs.number),
    status: toText(attrs.status),
    failed_reason: toTextOrUndefined(attrs.failed_reason),
    scac: toTextOrUndefined(attrs.scac),
    shipment_id: toTextOrUndefined(attrs.shipment_id),
  };
}

function formatContainer(
  container: any,
  included: any[],
): SearchResult['containers'][0] {
  const attrs = container.attributes || {};
  const relationships = container.relationships || {};

  // Find related terminal
  const podTerminalId = relationships.pod_terminal?.data?.id;
  const polTerminalId = relationships.pol_terminal?.data?.id;

  const podTerminal = included.find(
    (item: any) => item.type === 'terminal' && item.id === podTerminalId,
  );
  const polTerminal = included.find(
    (item: any) => item.type === 'terminal' && item.id === polTerminalId,
  );

  // Find related shipment for shipping line
  const shipmentId = relationships.shipment?.data?.id;
  const shipment = included.find(
    (item: any) => item.type === 'shipment' && item.id === shipmentId,
  );

  return {
    id: String(container.id),
    container_number: toText(attrs.number),
    status: containerStatus(attrs),
    shipping_line: toText(
      shipment?.attributes?.line_name || attrs.shipping_line_name,
    ),
    pod_terminal: toTextOrUndefined(podTerminal?.attributes?.name),
    pol_terminal: toTextOrUndefined(polTerminal?.attributes?.name),
    destination: toTextOrUndefined(
      podTerminal?.attributes?.nickname || podTerminal?.attributes?.name,
    ),
  };
}

function formatShipment(
  shipment: any,
  _included: any[],
): SearchResult['shipments'][0] {
  const attrs = shipment.attributes || {};
  const relationships = shipment.relationships || {};

  // Count containers
  const containerIds = relationships.containers?.data || [];
  const containerCount = containerIds.length;

  return {
    id: String(shipment.id),
    ref_numbers: toStringList(attrs.ref_numbers),
    shipping_line: toText(attrs.line_name || attrs.line || attrs.shipping_line),
    container_count: containerCount,
  };
}

/** The dashboard label of the container's current_status, if it has one. */
function containerStatus(attrs: any): string | undefined {
  return statusLabel(toTextOrUndefined(attrs?.current_status)) ?? undefined;
}

/** The most identifiers one batch call resolves. */
export const MAX_BATCH_QUERIES = 50;
const BATCH_CONCURRENCY = 8;

export interface SearchContainersArgs {
  queries: string[];
}

/**
 * How a batch input matched: the identifier itself, only by prefix, nothing,
 * or error when its own search failed (the other rows are unaffected).
 */
export type BatchMatch = 'exact' | 'partial' | 'not_found' | 'error';

export interface BatchShipment {
  id: string;
  bill_of_lading: string | null;
  ref_numbers: string[];
  shipping_line: string;
  status: string;
  container_numbers: string[];
  port_of_discharge: {
    name: string | null;
    locode: string | null;
    terminal: string | null;
    eta: string | null;
    ata: string | null;
    timezone: string | null;
  };
}

export interface BatchResult {
  query: string;
  match: BatchMatch;
  containers: SearchResult['containers'];
  shipments: BatchShipment[];
  tracking_requests: SearchResult['tracking_requests'];
  /** Why this row is incomplete: its search failed, or some shipment details could not be loaded. */
  error?: string;
}

export interface SearchContainersResult {
  results: BatchResult[];
  total_results: number;
  /** Rows whose search failed (match is error). */
  failed: number;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

async function settle<T>(fn: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: (error as Error)?.message || String(error) };
  }
}

/** Case and whitespace never distinguish two identifiers; every other character does. */
function normalizeIdentifier(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

/**
 * Resolves many identifiers in one call. Each runs the same search as
 * search_container; matched shipments are fetched once each for status, POD
 * and ETA, so a pasted list needs no per-number follow-up calls. A hit counts
 * as exact only when its own number or a reference equals the input, so a
 * prefix match (SO/7407-58 for SO/7407-5) is reported as partial.
 */
export async function executeSearchContainers(
  args: SearchContainersArgs,
  client: Terminal49Client,
): Promise<SearchContainersResult> {
  const queries = [
    ...new Set(args.queries.map((query) => query.trim()).filter(Boolean)),
  ];
  if (queries.length === 0) {
    throw new Error('At least one search query is required');
  }
  if (queries.length > MAX_BATCH_QUERIES) {
    throw new Error(`Pass at most ${MAX_BATCH_QUERIES} identifiers per call`);
  }

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'search_container',
    query_count: queries.length,
    timestamp: new Date().toISOString(),
  });

  try {
    const searches = await mapWithConcurrency(
      queries,
      BATCH_CONCURRENCY,
      (query) =>
        settle(async () => formatSearchResponse(await client.search(query))),
    );

    // Shipments to load: every shipment hit, plus the shipment behind each
    // exactly matched container, which carries the POD and ETA.
    const scacById = new Map<string, string>();
    searches.forEach((outcome, index) => {
      if (!outcome.ok) return;
      for (const sh of outcome.value.shipments)
        scacById.set(sh.id, sh.shipping_line);
      const target = normalizeIdentifier(queries[index]);
      for (const c of outcome.value.containers) {
        if (
          c.shipment_id &&
          normalizeIdentifier(c.container_number) === target &&
          !scacById.has(c.shipment_id)
        ) {
          scacById.set(c.shipment_id, c.shipping_line);
        }
      }
    });
    const details = new Map<string, Outcome<LoadedShipment>>();
    await mapWithConcurrency(
      [...scacById],
      BATCH_CONCURRENCY,
      async ([id, scac]) => {
        details.set(
          id,
          await settle(() => loadBatchShipment(id, scac, client)),
        );
      },
    );

    const results = queries.map((query, index) => {
      const outcome = searches[index];
      return outcome.ok
        ? toBatchResult(query, outcome.value, details)
        : errorRow(query, outcome.error);
    });

    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'search_container',
      query_count: queries.length,
      exact: results.filter((r) => r.match === 'exact').length,
      partial: results.filter((r) => r.match === 'partial').length,
      not_found: results.filter((r) => r.match === 'not_found').length,
      failed: results.filter((r) => r.match === 'error').length,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });

    return {
      results,
      total_results: results.filter(
        (r) => r.match === 'exact' || r.match === 'partial',
      ).length,
      failed: results.filter((r) => r.match === 'error').length,
    };
  } catch (error) {
    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'search_container',
      query_count: queries.length,
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

type LoadedShipment = BatchShipment & { normalized_number: string | null };

function withoutNormalized({
  normalized_number: _,
  ...rest
}: LoadedShipment): BatchShipment {
  return rest;
}

function errorRow(query: string, error: string): BatchResult {
  return {
    query,
    match: 'error',
    containers: [],
    shipments: [],
    tracking_requests: [],
    error: `Search failed: ${error}`,
  };
}

async function loadBatchShipment(
  id: string,
  scac: string,
  client: Terminal49Client,
): Promise<LoadedShipment> {
  const d = await executeGetShipmentDetails(
    { id, include_containers: true },
    client,
  );
  const pod = d.routing.port_of_discharge;
  return {
    id,
    bill_of_lading: d.bill_of_lading ?? null,
    normalized_number: d.normalized_number ?? null,
    ref_numbers: toStringList(d.reference_numbers),
    shipping_line: toText(d.shipping_line.scac ?? scac),
    status: d.status,
    container_numbers: (d.containers?.containers ?? [])
      .map((c) => toTextOrUndefined(c.number))
      .filter((n): n is string => Boolean(n)),
    port_of_discharge: {
      name: pod.name ?? null,
      locode: pod.locode ?? null,
      terminal: pod.terminal?.name ?? null,
      eta: pod.eta ?? null,
      ata: pod.ata ?? null,
      timezone: pod.timezone ?? null,
    },
  };
}

function toBatchResult(
  query: string,
  search: SearchResult,
  details: Map<string, Outcome<LoadedShipment>>,
): BatchResult {
  const target = normalizeIdentifier(query);
  const isExact = (...values: Array<string | null | undefined>) =>
    values.some((value) => normalizeIdentifier(value) === target);

  const failures: string[] = [];
  const load = (id: string): LoadedShipment | undefined => {
    const outcome = details.get(id);
    if (!outcome) return undefined;
    if (outcome.ok) return outcome.value;
    failures.push(`shipment ${id}: ${outcome.error}`);
    return undefined;
  };
  const withError = (row: BatchResult): BatchResult =>
    failures.length > 0
      ? { ...row, error: `Could not load details for ${failures.join('; ')}` }
      : row;

  const exactContainers = search.containers.filter((c) =>
    isExact(c.container_number),
  );
  const loaded = search.shipments
    .map((hit) => load(hit.id))
    .filter((s): s is LoadedShipment => Boolean(s));
  const exactShipments = loaded.filter((s) =>
    isExact(s.bill_of_lading, s.normalized_number, ...s.ref_numbers),
  );
  const exactRequests = search.tracking_requests.filter((r) =>
    isExact(r.request_number),
  );

  if (
    exactContainers.length + exactShipments.length + exactRequests.length >
    0
  ) {
    const shipments = new Map(exactShipments.map((s) => [s.id, s]));
    for (const c of exactContainers) {
      if (!c.shipment_id || shipments.has(c.shipment_id)) continue;
      const s = load(c.shipment_id);
      if (s) shipments.set(s.id, s);
    }
    return withError({
      query,
      match: 'exact',
      containers: exactContainers,
      shipments: [...shipments.values()].map(withoutNormalized),
      tracking_requests: exactRequests,
    });
  }
  return withError({
    query,
    match: search.total_results > 0 ? 'partial' : 'not_found',
    containers: search.containers,
    shipments: loaded.map(withoutNormalized),
    tracking_requests: search.tracking_requests,
  });
}
