/**
 * get_shipment_details tool
 * Retrieves detailed shipment information by Terminal49 shipment ID
 */

import { Terminal49Client } from '../client.js';

export interface GetShipmentArgs {
  id: string;
  include_containers?: boolean;
}

export const getShipmentDetailsTool = {
  name: 'get_shipment_details',
  description:
    'Get detailed shipment information including routing, BOL, containers, and port details. ' +
    'Use this when user asks about a shipment (vs a specific container). ' +
    'Returns: Bill of Lading, shipping line, port details, vessel info, ETAs, container list.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The Terminal49 shipment ID (UUID format)',
      },
      include_containers: {
        type: 'boolean',
        description: 'Include list of containers in this shipment. Default: true',
        default: true,
      },
    },
    required: ['id'],
  },
};

export async function executeGetShipmentDetails(
  args: GetShipmentArgs,
  client: Terminal49Client
): Promise<any> {
  if (!args.id || args.id.trim() === '') {
    throw new Error('Shipment ID is required');
  }

  const startTime = Date.now();
  console.log(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'get_shipment_details',
      shipment_id: args.id,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const includeContainers = args.include_containers !== false;
    const result = await client.getShipment(args.id, includeContainers);
    const duration = Date.now() - startTime;

    console.log(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'get_shipment_details',
        shipment_id: args.id,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    return formatShipmentResponse(result, includeContainers);
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'get_shipment_details',
        shipment_id: args.id,
        error: (error as Error).name,
        message: (error as Error).message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    throw error;
  }
}

function formatShipmentResponse(apiResponse: any, includeContainers: boolean): any {
  const shipment = apiResponse.data?.attributes || {};
  const relationships = apiResponse.data?.relationships || {};
  const included = apiResponse.included || [];

  // Determine shipment status
  const status = determineShipmentStatus(shipment);

  // Extract containers if included
  const containerData = includeContainers
    ? extractContainers(relationships, included)
    : `Call get_shipment_details with include_containers=true to fetch container list`;

  // Extract port/terminal info
  const polTerminal = included.find(
    (item: any) =>
      item.id === relationships.pol_terminal?.data?.id && item.type === 'terminal'
  );

  const podTerminal = included.find(
    (item: any) =>
      item.id === relationships.pod_terminal?.data?.id && item.type === 'terminal'
  );

  return {
    id: apiResponse.data?.id,
    bill_of_lading: shipment.bill_of_lading_number,
    normalized_number: shipment.normalized_number,
    status: status,
    shipping_line: {
      scac: shipment.shipping_line_scac,
      name: shipment.shipping_line_name,
      short_name: shipment.shipping_line_short_name,
    },
    customer_name: shipment.customer_name,
    reference_numbers: shipment.ref_numbers || [],
    tags: shipment.tags || [],
    routing: {
      port_of_lading: {
        locode: shipment.port_of_lading_locode,
        name: shipment.port_of_lading_name,
        terminal: polTerminal
          ? {
              name: polTerminal.attributes?.name,
              firms_code: polTerminal.attributes?.firms_code,
            }
          : null,
        etd: shipment.pol_etd_at,
        atd: shipment.pol_atd_at,
        timezone: shipment.pol_timezone,
      },
      port_of_discharge: {
        locode: shipment.port_of_discharge_locode,
        name: shipment.port_of_discharge_name,
        terminal: podTerminal
          ? {
              name: podTerminal.attributes?.name,
              firms_code: podTerminal.attributes?.firms_code,
            }
          : null,
        eta: shipment.pod_eta_at,
        ata: shipment.pod_ata_at,
        original_eta: shipment.pod_original_eta_at,
        timezone: shipment.pod_timezone,
      },
      destination: shipment.destination_locode
        ? {
            locode: shipment.destination_locode,
            name: shipment.destination_name,
            eta: shipment.destination_eta_at,
            ata: shipment.destination_ata_at,
            timezone: shipment.destination_timezone,
          }
        : null,
    },
    vessel_at_pod: {
      name: shipment.pod_vessel_name,
      imo: shipment.pod_vessel_imo,
      voyage_number: shipment.pod_voyage_number,
    },
    containers: containerData,
    tracking: {
      line_tracking_last_attempted_at: shipment.line_tracking_last_attempted_at,
      line_tracking_last_succeeded_at: shipment.line_tracking_last_succeeded_at,
      line_tracking_stopped_at: shipment.line_tracking_stopped_at,
      line_tracking_stopped_reason: shipment.line_tracking_stopped_reason,
    },
    updated_at: shipment.updated_at,
    created_at: shipment.created_at,
    _metadata: {
      shipment_status: status,
      includes_loaded: includeContainers ? ['containers', 'ports', 'terminals'] : ['ports', 'terminals'],
      presentation_guidance: getShipmentPresentationGuidance(status, shipment),
    },
  };
}

function extractContainers(relationships: any, included: any[]): any {
  const containerRefs = relationships.containers?.data || [];

  if (containerRefs.length === 0) {
    return { count: 0, containers: [] };
  }

  const containers = containerRefs
    .map((ref: any) => {
      const container = included.find(
        (item: any) => item.id === ref.id && item.type === 'container'
      );
      if (!container) return null;

      const attrs = container.attributes || {};
      return {
        id: container.id,
        number: attrs.number,
        equipment_type: attrs.equipment_type,
        equipment_length: attrs.equipment_length,
        available_for_pickup: attrs.available_for_pickup,
        pod_arrived_at: attrs.pod_arrived_at,
        pod_discharged_at: attrs.pod_discharged_at,
        pickup_lfd: attrs.pickup_lfd,
      };
    })
    .filter((c: any) => c !== null);

  return {
    count: containers.length,
    containers: containers,
  };
}

function determineShipmentStatus(shipment: any): string {
  if (shipment.destination_ata_at) return 'delivered_to_destination';
  if (shipment.pod_ata_at) return 'arrived_at_pod';
  if (shipment.pol_atd_at) return 'in_transit';
  if (shipment.pol_etd_at) return 'awaiting_departure';
  return 'pending';
}

function getShipmentPresentationGuidance(status: string, shipment: any): string {
  switch (status) {
    case 'pending':
      return 'Shipment is being prepared. Focus on expected departure date and origin details.';

    case 'awaiting_departure':
      return 'Vessel has not yet departed. Emphasize ETD and vessel details.';

    case 'in_transit':
      const eta = shipment.pod_eta_at ? new Date(shipment.pod_eta_at) : null;
      const now = new Date();
      if (eta) {
        const daysToArrival = Math.ceil((eta.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return `Shipment is in transit. ETA in ${daysToArrival} days. Focus on vessel name, route, and arrival timing.`;
      }
      return 'Shipment is in transit. Focus on vessel and expected arrival.';

    case 'arrived_at_pod':
      return 'Shipment has arrived at destination port. Focus on containers and their discharge/availability status.';

    case 'delivered_to_destination':
      return 'Shipment delivered to final destination. Provide summary of journey and container delivery status.';

    default:
      return 'Present shipment routing and status clearly.';
  }
}
