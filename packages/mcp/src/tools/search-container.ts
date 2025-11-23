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
  }>;
  shipments: Array<{
    id: string;
    ref_numbers: string[];
    shipping_line: string;
    container_count: number;
  }>;
  total_results: number;
}

export const searchContainerTool = {
  name: 'search_container',
  description:
    'Search for containers, shipments, and tracking information by container number, ' +
    'booking number, bill of lading, or reference number. ' +
    'This is the fastest way to find container information. ' +
    'Examples: CAIU2885402, MAEU123456789, or any reference number.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Search query - can be a container number, booking number, BL number, or reference number',
      },
    },
    required: ['query'],
  },
};

export async function executeSearchContainer(
  args: SearchContainerArgs,
  client: Terminal49Client
): Promise<SearchResult> {
  if (!args.query || args.query.trim() === '') {
    throw new Error('Search query is required');
  }

  const startTime = Date.now();
  console.log(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'search_container',
      query: args.query,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const result = await client.search(args.query);
    const formattedResult = formatSearchResponse(result);

    const duration = Date.now() - startTime;
    console.log(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'search_container',
        query: args.query,
        total_results: formattedResult.total_results,
        containers_found: formattedResult.containers.length,
        shipments_found: formattedResult.shipments.length,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    return formattedResult;
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'search_container',
        query: args.query,
        error: (error as Error).name,
        message: (error as Error).message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    throw error;
  }
}

/**
 * Format search API response into structured result
 */
function formatSearchResponse(apiResponse: any): SearchResult {
  const data = Array.isArray(apiResponse.data) ? apiResponse.data : [apiResponse.data];
  const included = apiResponse.included || [];

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

  return {
    containers,
    shipments,
    total_results: containers.length + shipments.length,
  };
}

/**
 * Format search_result type container
 */
function formatSearchResult(searchResult: any): SearchResult['containers'][0] {
  const attrs = searchResult.attributes || {};

  return {
    id: searchResult.id,
    container_number: attrs.number || 'Unknown',
    status: attrs.status || 'unknown',
    shipping_line: attrs.scac || 'Unknown',
    pod_terminal: attrs.port_of_discharge_name,
    pol_terminal: attrs.port_of_lading_name,
    destination: attrs.port_of_discharge_name,
  };
}

/**
 * Format search_result type shipment
 */
function formatSearchResultShipment(searchResult: any): SearchResult['shipments'][0] {
  const attrs = searchResult.attributes || {};

  return {
    id: searchResult.id,
    ref_numbers: attrs.ref_numbers || [],
    shipping_line: attrs.scac || 'Unknown',
    container_count: attrs.containers_count || 0,
  };
}

function formatContainer(container: any, included: any[]): SearchResult['containers'][0] {
  const attrs = container.attributes || {};
  const relationships = container.relationships || {};

  // Find related terminal
  const podTerminalId = relationships.pod_terminal?.data?.id;
  const polTerminalId = relationships.pol_terminal?.data?.id;

  const podTerminal = included.find(
    (item: any) => item.type === 'terminal' && item.id === podTerminalId
  );
  const polTerminal = included.find(
    (item: any) => item.type === 'terminal' && item.id === polTerminalId
  );

  // Find related shipment for shipping line
  const shipmentId = relationships.shipment?.data?.id;
  const shipment = included.find(
    (item: any) => item.type === 'shipment' && item.id === shipmentId
  );

  return {
    id: container.id,
    container_number: attrs.number || 'Unknown',
    status: determineContainerStatus(attrs),
    shipping_line: shipment?.attributes?.line_name || attrs.shipping_line_name || 'Unknown',
    pod_terminal: podTerminal?.attributes?.name,
    pol_terminal: polTerminal?.attributes?.name,
    destination: podTerminal?.attributes?.nickname || podTerminal?.attributes?.name,
  };
}

function formatShipment(shipment: any, included: any[]): SearchResult['shipments'][0] {
  const attrs = shipment.attributes || {};
  const relationships = shipment.relationships || {};

  // Count containers
  const containerIds = relationships.containers?.data || [];
  const containerCount = containerIds.length;

  return {
    id: shipment.id,
    ref_numbers: attrs.ref_numbers || [],
    shipping_line: attrs.line_name || attrs.line || 'Unknown',
    container_count: containerCount,
  };
}

function determineContainerStatus(attrs: any): string {
  if (attrs.available_for_pickup) {
    return 'available_for_pickup';
  } else if (attrs.pod_discharged_at) {
    return 'discharged';
  } else if (attrs.pod_arrived_at) {
    return 'arrived';
  } else if (attrs.pod_full_out_at) {
    return 'full_out';
  } else if (attrs.pol_loaded_at) {
    return 'in_transit';
  }
  return 'unknown';
}
