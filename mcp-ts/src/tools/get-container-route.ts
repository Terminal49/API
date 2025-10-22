/**
 * get_container_route tool
 * Retrieves detailed routing information for a container
 * NOTE: This is a PAID FEATURE in Terminal49 API
 */

import { Terminal49Client } from '../client.js';

export interface GetContainerRouteArgs {
  id: string;
}

export const getContainerRouteTool = {
  name: 'get_container_route',
  description:
    'Get detailed routing and vessel itinerary for a container including all ports, vessels, and ETAs. ' +
    'Shows complete multi-leg journey (origin → transshipment ports → destination). ' +
    'NOTE: This is a paid feature and may not be available for all accounts. ' +
    'Use for questions about routing, transshipments, or detailed vessel itinerary.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The Terminal49 container ID (UUID format)',
      },
    },
    required: ['id'],
  },
};

export async function executeGetContainerRoute(
  args: GetContainerRouteArgs,
  client: Terminal49Client
): Promise<any> {
  if (!args.id || args.id.trim() === '') {
    throw new Error('Container ID is required');
  }

  const startTime = Date.now();
  console.log(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'get_container_route',
      container_id: args.id,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const result = await client.getContainerRoute(args.id);
    const duration = Date.now() - startTime;

    console.log(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'get_container_route',
        container_id: args.id,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    return formatRouteResponse(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    // Handle 403 errors (feature not enabled)
    const err = error as any;
    if (err.name === 'AuthenticationError' && err.message?.includes('not enabled')) {
      console.error(
        JSON.stringify({
          event: 'tool.execute.error',
          tool: 'get_container_route',
          container_id: args.id,
          error: 'FeatureNotEnabled',
          message: 'Route tracking is not enabled for this account',
          duration_ms: duration,
          timestamp: new Date().toISOString(),
        })
      );

      return {
        error: 'FeatureNotEnabled',
        message:
          'Route tracking is a paid feature and is not enabled for your Terminal49 account. ' +
          'Contact support@terminal49.com to enable this feature.',
        alternative:
          'Use get_container_transport_events to see historical movement, or get_container for basic routing info.',
      };
    }

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'get_container_route',
        container_id: args.id,
        error: (error as Error).name,
        message: (error as Error).message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    throw error;
  }
}

function formatRouteResponse(apiResponse: any): any {
  const route = apiResponse.data?.attributes || {};
  const relationships = apiResponse.data?.relationships || {};
  const included = apiResponse.included || [];

  // Extract route locations
  const routeLocationRefs = relationships.route_locations?.data || [];
  const routeLocations = routeLocationRefs
    .map((ref: any) => {
      const location = included.find((item: any) => item.id === ref.id && item.type === 'route_location');
      if (!location) return null;

      const attrs = location.attributes || {};
      const rels = location.relationships || {};

      // Find port info
      const portId = rels.port?.data?.id;
      const port = included.find((item: any) => item.id === portId && item.type === 'port');

      // Find vessel info
      const inboundVesselId = rels.inbound_vessel?.data?.id;
      const outboundVesselId = rels.outbound_vessel?.data?.id;
      const inboundVessel = included.find((item: any) => item.id === inboundVesselId && item.type === 'vessel');
      const outboundVessel = included.find((item: any) => item.id === outboundVesselId && item.type === 'vessel');

      return {
        port: port
          ? {
              code: port.attributes?.code,
              name: port.attributes?.name,
              city: port.attributes?.city,
              country_code: port.attributes?.country_code,
            }
          : null,
        inbound: {
          mode: attrs.inbound_mode,
          carrier_scac: attrs.inbound_scac,
          eta: attrs.inbound_eta_at,
          ata: attrs.inbound_ata_at,
          vessel: inboundVessel
            ? {
                name: inboundVessel.attributes?.name,
                imo: inboundVessel.attributes?.imo,
              }
            : null,
        },
        outbound: {
          mode: attrs.outbound_mode,
          carrier_scac: attrs.outbound_scac,
          etd: attrs.outbound_etd_at,
          atd: attrs.outbound_atd_at,
          vessel: outboundVessel
            ? {
                name: outboundVessel.attributes?.name,
                imo: outboundVessel.attributes?.imo,
              }
            : null,
        },
      };
    })
    .filter((loc: any) => loc !== null);

  return {
    route_id: apiResponse.data?.id,
    total_legs: routeLocations.length,
    route_locations: routeLocations,
    created_at: route.created_at,
    updated_at: route.updated_at,
    _metadata: {
      presentation_guidance:
        'Present route as a journey: Origin → [Transshipment Ports] → Destination. ' +
        'For each leg, show vessel name, carrier, and ETD/ETA/ATD/ATA. ' +
        'Highlight transshipment ports (where container changes vessels).',
    },
  };
}
