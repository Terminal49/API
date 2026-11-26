/**
 * search_container tool
 * Search for containers, shipments, or other entities using Terminal49 search API
 */

import { Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';
import { statusLabel } from '../lib/container-status.js';
import { formatShipmentResponse } from './get-shipment-details.js';
import { ToolInputError } from './soft-results.js';

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
    /** The shipment's own number (usually the BL), when the search result carries it. */
    bill_of_lading?: string;
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
    bill_of_lading: toTextOrUndefined(attrs.number),
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
/** The most shipment detail fetches one batch call makes; past it rows say which were skipped. */
export const MAX_BATCH_DETAIL_FETCHES = 50;
/** A row with no exact hit whose search found at most this many shipments has them checked against booking and user-provided numbers. */
const VERIFY_FEW_SHIPMENTS = 3;
/** Container numbers listed per shipment; container_count gives the total. */
export const MAX_BATCH_CONTAINER_NUMBERS = 20;
const BATCH_CONCURRENCY = 8;

export interface SearchContainersArgs {
  queries: string[];
}

/**
 * How a batch input matched: the identifier itself, a result that contains it
 * but none that equals it, nothing, or error when its own search failed (the
 * other rows are unaffected).
 */
export type BatchMatch = 'exact' | 'partial' | 'not_found' | 'error';

/** A shipment whose details were loaded: POD, terminal and ETA in one place. */
export interface BatchShipment {
  id: string;
  bill_of_lading: string | null;
  ref_numbers: string[];
  shipping_line: string;
  container_numbers: string[];
  container_count: number;
  port_of_discharge: {
    name: string | null;
    locode: string | null;
    terminal: string | null;
    eta: string | null;
    ata: string | null;
    timezone: string | null;
  };
}

/** A shipment search hit without details: ids and matched numbers only. */
export type BatchShipmentHit = SearchResult['shipments'][0];

export interface BatchResult {
  query: string;
  match: BatchMatch;
  containers: SearchResult['containers'];
  /** Exact rows: loaded shipments (a hit when its details are missing). Partial rows: hits only. */
  shipments: Array<BatchShipment | BatchShipmentHit>;
  tracking_requests: SearchResult['tracking_requests'];
  /** Why this row is incomplete: its search failed, or some shipment details could not be loaded. */
  error?: string;
  /** Shipments whose details this call skipped at the per-call fetch limit. */
  details_skipped?: string[];
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

type LoadedShipment = BatchShipment & { identifiers: string[] };

/** Shipment ids whose details decide or enrich a row, in priority order. */
function detailCandidates(target: string, search: SearchResult): string[] {
  const exactHits = search.shipments
    .filter((sh) =>
      [sh.bill_of_lading, ...sh.ref_numbers].some(
        (v) => normalizeIdentifier(v) === target,
      ),
    )
    .map((sh) => sh.id);
  const containerShipments = search.containers
    .filter(
      (c) =>
        c.shipment_id && normalizeIdentifier(c.container_number) === target,
    )
    .map((c) => c.shipment_id!);
  const ids = [...exactHits, ...containerShipments];
  const anyExact =
    ids.length > 0 ||
    search.tracking_requests.some(
      (r) => normalizeIdentifier(r.request_number) === target,
    );
  if (!anyExact && search.shipments.length <= VERIFY_FEW_SHIPMENTS) {
    ids.push(...search.shipments.map((sh) => sh.id));
  }
  return [...new Set(ids)];
}

/**
 * Resolves many identifiers in one call, one row per input in input order.
 * Each input is searched once with case and whitespace removed. A hit is
 * exact when one of its numbers equals the input (shipment number, BL,
 * booking, user-provided MBL or booking, a reference, a container or request
 * number); exact shipments carry POD, terminal and ETA, so a pasted list
 * needs no follow-up calls. One failed lookup never fails the batch.
 */
export async function executeSearchContainers(
  args: SearchContainersArgs,
  client: Terminal49Client,
): Promise<SearchContainersResult> {
  const queries = args.queries.map((query) => query.trim()).filter(Boolean);
  if (queries.length === 0) {
    throw new ToolInputError('Pass at least one identifier in queries.');
  }
  if (queries.length > MAX_BATCH_QUERIES) {
    throw new ToolInputError(
      `Pass at most ${MAX_BATCH_QUERIES} identifiers per call; split the list.`,
    );
  }

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'search_container',
    query_count: queries.length,
    timestamp: new Date().toISOString(),
  });

  const targets = [...new Set(queries.map(normalizeIdentifier))];
  const outcomes = await mapWithConcurrency(
    targets,
    BATCH_CONCURRENCY,
    (target) =>
      settle(async () => formatSearchResponse(await client.search(target))),
  );
  const searches = new Map(targets.map((t, i) => [t, outcomes[i]]));

  const candidates = new Map<string, string[]>();
  for (const [target, outcome] of searches) {
    if (outcome.ok)
      candidates.set(target, detailCandidates(target, outcome.value));
  }
  const wanted = [...new Set([...candidates.values()].flat())];
  const fetched = wanted.slice(0, MAX_BATCH_DETAIL_FETCHES);
  const details = new Map<string, Outcome<LoadedShipment>>();
  await mapWithConcurrency(fetched, BATCH_CONCURRENCY, async (id) => {
    details.set(id, await settle(() => loadBatchShipment(id, client)));
  });

  const results = queries.map((query) => {
    const target = normalizeIdentifier(query);
    const outcome = searches.get(target)!;
    return outcome.ok
      ? toBatchResult(
          query,
          target,
          outcome.value,
          candidates.get(target)!,
          details,
        )
      : errorRow(query, outcome.error);
  });
  const failed = results.filter((r) => r.match === 'error').length;

  logMcpEvent({
    event: 'tool.execute.complete',
    tool: 'search_container',
    query_count: queries.length,
    exact: results.filter((r) => r.match === 'exact').length,
    partial: results.filter((r) => r.match === 'partial').length,
    not_found: results.filter((r) => r.match === 'not_found').length,
    failed,
    detail_fetches: fetched.length,
    details_skipped: wanted.length - fetched.length,
    duration_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });

  return {
    results,
    total_results: results.filter(
      (r) => r.match === 'exact' || r.match === 'partial',
    ).length,
    failed,
  };
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
  client: Terminal49Client,
): Promise<LoadedShipment> {
  const result = await client.shipments.get(id, true, { format: 'raw' });
  const raw = (result as any)?.raw ?? result;
  const attrs = raw?.data?.attributes ?? {};
  const d = formatShipmentResponse(raw, true, null, null);
  const pod = d.routing.port_of_discharge;
  const containerNumbers = (d.containers?.containers ?? [])
    .map((c) => toTextOrUndefined(c.number))
    .filter((n): n is string => Boolean(n));
  return {
    id,
    bill_of_lading: d.bill_of_lading ?? null,
    ref_numbers: toStringList(d.reference_numbers),
    shipping_line: toText(d.shipping_line.scac),
    container_numbers: containerNumbers.slice(0, MAX_BATCH_CONTAINER_NUMBERS),
    container_count: containerNumbers.length,
    port_of_discharge: {
      name: pod.name ?? null,
      locode: pod.locode ?? null,
      terminal: pod.terminal?.name ?? null,
      eta: pod.eta ?? null,
      ata: pod.ata ?? null,
      timezone: pod.timezone ?? null,
    },
    identifiers: [
      d.bill_of_lading,
      d.normalized_number,
      attrs.bl_number,
      attrs.booking_number,
      attrs.user_provided_mbl_number,
      attrs.user_provided_booking_number,
      ...toStringList(d.reference_numbers),
    ]
      .map((v) => toTextOrUndefined(v))
      .filter((v): v is string => Boolean(v)),
  };
}

function withoutIdentifiers({
  identifiers: _,
  ...rest
}: LoadedShipment): BatchShipment {
  return rest;
}

function toBatchResult(
  query: string,
  target: string,
  search: SearchResult,
  candidateIds: string[],
  details: Map<string, Outcome<LoadedShipment>>,
): BatchResult {
  const isExact = (...values: Array<string | null | undefined>) =>
    values.some((value) => normalizeIdentifier(value) === target);

  const failures: string[] = [];
  const skipped: string[] = [];
  const loaded = new Map<string, LoadedShipment>();
  for (const id of candidateIds) {
    const outcome = details.get(id);
    if (!outcome) skipped.push(id);
    else if (outcome.ok) loaded.set(id, outcome.value);
    else failures.push(`shipment ${id}: ${outcome.error}`);
  }
  const finish = (row: BatchResult): BatchResult => ({
    ...row,
    ...(failures.length > 0 && {
      error: `Could not load details for ${failures.join('; ')}`,
    }),
    ...(skipped.length > 0 && { details_skipped: skipped }),
  });

  const exactContainers = search.containers.filter((c) =>
    isExact(c.container_number),
  );
  const exactRequests = search.tracking_requests.filter((r) =>
    isExact(r.request_number),
  );
  const shipments = new Map<string, BatchShipment | BatchShipmentHit>();
  for (const hit of search.shipments) {
    const full = loaded.get(hit.id);
    if (
      full
        ? isExact(...full.identifiers)
        : isExact(hit.bill_of_lading, ...hit.ref_numbers)
    ) {
      shipments.set(hit.id, full ? withoutIdentifiers(full) : hit);
    }
  }
  for (const c of exactContainers) {
    const full = c.shipment_id ? loaded.get(c.shipment_id) : undefined;
    if (full && !shipments.has(full.id))
      shipments.set(full.id, withoutIdentifiers(full));
  }

  if (exactContainers.length + shipments.size + exactRequests.length > 0) {
    return finish({
      query,
      match: 'exact',
      containers: exactContainers,
      shipments: [...shipments.values()],
      tracking_requests: exactRequests,
    });
  }
  return finish({
    query,
    match: search.total_results > 0 ? 'partial' : 'not_found',
    containers: search.containers,
    shipments: search.shipments,
    tracking_requests: search.tracking_requests,
  });
}
