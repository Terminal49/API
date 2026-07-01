/**
 * search_container tool
 * Search for containers, shipments, or other entities using Terminal49 search API
 */

import { Terminal49Client } from '@terminal49/sdk';

export interface SearchContainerArgs {
  query: string;
}

export interface SearchResult {
  containers: Array<{
    id: string;
    container_number: string;
    status: string;
    shipping_line: string;
    pod_terminal?: string;
    pol_terminal?: string;
    destination?: string;
    /** True when more than one result shares this container_number. */
    duplicate_number?: boolean;
  }>;
  shipments: Array<{
    id: string;
    ref_numbers: string[];
    shipping_line: string;
    container_count: number;
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
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'search_container',
      query,
      timestamp: new Date().toISOString(),
    }),
  );

  try {
    const result = await client.search(query);
    const formattedResult = formatSearchResponse(result);

    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'search_container',
        query,
        total_results: formattedResult.total_results,
        containers_found: formattedResult.containers.length,
        shipments_found: formattedResult.shipments.length,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      }),
    );

    return formattedResult;
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'search_container',
        query,
        error: (error as Error).name,
        message: (error as Error).message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      }),
    );

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
    total_results: containers.length + shipments.length,
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
    // Honor an explicit status when the search API supplies one; otherwise
    // derive a real status from availability/timestamp signals instead of
    // labeling every result "unknown".
    status: toTextOrUndefined(attrs.status) ?? determineContainerStatus(attrs),
    shipping_line: toText(attrs.scac || attrs.carrier_scac || attrs.carrier),
    pod_terminal: toTextOrUndefined(attrs.port_of_discharge_name),
    pol_terminal: toTextOrUndefined(attrs.port_of_lading_name),
    destination: toTextOrUndefined(attrs.port_of_discharge_name),
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
    status: determineContainerStatus(attrs),
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

/**
 * Derive a coarse container status from lifecycle signals.
 *
 * NOTE: these fields (`available_for_pickup`, `pod_*_at`, `pol_loaded_at`)
 * originate on the full container resource. The lightweight `/search` payload
 * is not guaranteed to carry them, and their exact presence/shape there is
 * unverified — so this stays deliberately defensive: it never throws on a
 * missing or oddly-typed `attrs`, treats only meaningful signals as set, and
 * falls back to `'unknown'` rather than guessing. When an explicit
 * `attrs.status` is present the caller prefers it over this derivation.
 */
function determineContainerStatus(attrs: any): string {
  if (!attrs || typeof attrs !== 'object') {
    return 'unknown';
  }
  if (isTruthySignal(attrs.available_for_pickup)) {
    return 'available_for_pickup';
  } else if (isTruthySignal(attrs.pod_full_out_at)) {
    return 'full_out';
  } else if (isTruthySignal(attrs.pod_discharged_at)) {
    return 'discharged';
  } else if (isTruthySignal(attrs.pod_arrived_at)) {
    return 'arrived';
  } else if (isTruthySignal(attrs.pol_loaded_at)) {
    return 'in_transit';
  }
  return 'unknown';
}

/**
 * A lifecycle signal is "set" only when it carries real information. Guards
 * against the API serializing absent timestamps as `null`/empty string and
 * against a boolean-ish flag arriving as the string `'false'`.
 */
function isTruthySignal(value: unknown): boolean {
  if (value === undefined || value === null || value === false) {
    return false;
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    return text.length > 0 && text !== 'false';
  }
  return Boolean(value);
}
