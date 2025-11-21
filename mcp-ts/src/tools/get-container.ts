/**
 * get_container tool
 * Retrieves detailed container information by Terminal49 ID
 */

import { Terminal49Client } from '../client.js';

export interface GetContainerArgs {
  id: string;
}

export interface ContainerStatus {
  id: string;
  container_number: string;
  status: 'in_transit' | 'arrived' | 'discharged' | 'available_for_pickup';
  equipment: {
    type: string;
    length: string;
    height: string;
    weight_lbs: number;
  };
  location: {
    current_location: string | null;
    available_for_pickup: boolean;
    pod_arrived_at: string | null;
    pod_discharged_at: string | null;
  };
  demurrage: {
    pickup_lfd: string | null;
    pickup_appointment_at: string | null;
    fees_at_pod_terminal: any[];
    holds_at_pod_terminal: any[];
  };
  rail: {
    pod_rail_carrier: string | null;
    pod_rail_loaded_at: string | null;
    destination_eta: string | null;
    destination_ata: string | null;
  };
  shipment: {
    id: string;
    ref_numbers: string[];
    line: string;
  } | null;
  pod_terminal: {
    id: string;
    name: string;
    firms_code: string;
  } | null;
  updated_at: string;
  created_at: string;
}

export const getContainerTool = {
  name: 'get_container',
  description:
    'Get detailed information about a container by its Terminal49 ID. ' +
    'Returns container status, milestones, holds, LFD (Last Free Day), fees, ' +
    'and related shipment information.',
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

export async function executeGetContainer(
  args: GetContainerArgs,
  client: Terminal49Client
): Promise<ContainerStatus> {
  if (!args.id || args.id.trim() === '') {
    throw new Error('Container ID is required');
  }

  const startTime = Date.now();
  console.log(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'get_container',
      container_id: args.id,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const result = await client.getContainer(args.id);
    const duration = Date.now() - startTime;

    console.log(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'get_container',
        container_id: args.id,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    return formatContainerResponse(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'get_container',
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

function formatContainerResponse(apiResponse: any): ContainerStatus {
  const container = apiResponse.data?.attributes || {};
  const relationships = apiResponse.data?.relationships || {};
  const included = apiResponse.included || [];

  // Extract shipment info
  const shipmentId = relationships.shipment?.data?.id;
  const shipment = included.find(
    (item: any) => item.id === shipmentId && item.type === 'shipment'
  );

  // Extract terminal info
  const terminalId = relationships.pod_terminal?.data?.id;
  const podTerminal = included.find(
    (item: any) => item.id === terminalId && item.type === 'terminal'
  );

  return {
    id: apiResponse.data?.id,
    container_number: container.number,
    status: determineStatus(container),
    equipment: {
      type: container.equipment_type,
      length: container.equipment_length,
      height: container.equipment_height,
      weight_lbs: container.weight_in_lbs,
    },
    location: {
      current_location: container.location_at_pod_terminal,
      available_for_pickup: container.available_for_pickup,
      pod_arrived_at: container.pod_arrived_at,
      pod_discharged_at: container.pod_discharged_at,
    },
    demurrage: {
      pickup_lfd: container.pickup_lfd,
      pickup_appointment_at: container.pickup_appointment_at,
      fees_at_pod_terminal: container.fees_at_pod_terminal || [],
      holds_at_pod_terminal: container.holds_at_pod_terminal || [],
    },
    rail: {
      pod_rail_carrier: container.pod_rail_carrier_scac,
      pod_rail_loaded_at: container.pod_rail_loaded_at,
      destination_eta: container.ind_eta_at,
      destination_ata: container.ind_ata_at,
    },
    shipment: shipment
      ? {
          id: shipment.id,
          ref_numbers: shipment.attributes?.ref_numbers || [],
          line: shipment.attributes?.line,
        }
      : null,
    pod_terminal: podTerminal
      ? {
          id: podTerminal.id,
          name: podTerminal.attributes?.name,
          firms_code: podTerminal.attributes?.firms_code,
        }
      : null,
    updated_at: container.updated_at,
    created_at: container.created_at,
  };
}

function determineStatus(
  container: any
): 'in_transit' | 'arrived' | 'discharged' | 'available_for_pickup' {
  if (container.available_for_pickup) {
    return 'available_for_pickup';
  } else if (container.pod_discharged_at) {
    return 'discharged';
  } else if (container.pod_arrived_at) {
    return 'arrived';
  }
  return 'in_transit';
}
