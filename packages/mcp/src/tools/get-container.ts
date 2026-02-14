/**
 * get_container tool
 * Retrieves detailed container information by Terminal49 ID
 */

import { Terminal49Client } from '@terminal49/sdk';

export interface GetContainerArgs {
  id: string;
  include?: ('shipment' | 'pod_terminal' | 'transport_events')[];
}

export interface ContainerStatus {
  id: string;
  container_number: string;
  status: 'in_transit' | 'arrived' | 'discharged' | 'available_for_pickup' | 'at_terminal' | 'on_rail' | 'delivered';
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
    fees_at_pod_terminal: any[] | null;
    holds_at_pod_terminal: any[] | null;
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
    shipping_line_name?: string;
    port_of_lading_name?: string;
    port_of_discharge_name?: string;
    destination_name?: string;
  } | null;
  pod_terminal: {
    id: string;
    name: string;
    firms_code: string;
  } | null;
  events?: {
    count: number;
    latest_event?: {
      event: string;
      timestamp: string;
      location?: string;
    };
    rail_events_count?: number;
  } | string;
  updated_at: string;
  created_at: string;
  _metadata: {
    container_state: string;
    includes_loaded: string[];
    can_answer: string[];
    needs_more_data_for: string[];
    relevant_for_current_state: string[];
    presentation_guidance: string;
    suggestions?: {
      message?: string;
      recommended_follow_up?: string | null;
    };
  };
}

export const getContainerTool = {
  name: 'get_container',
  description:
    'Get container information with flexible data loading. ' +
    'Returns core container data (status, location, equipment, dates) plus optional related data. ' +
    'Choose includes based on user question and container state. ' +
    'Response includes metadata hints to guide follow-up queries.',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'The Terminal49 container ID (UUID format)',
      },
      include: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['shipment', 'pod_terminal', 'transport_events'],
        },
        description:
          "Optional related data to include. Default: ['shipment', 'pod_terminal'] covers most use cases.\n\n" +
          "• 'shipment': Routing, BOL, line, ref numbers (lightweight, always useful)\n" +
          "• 'pod_terminal': Terminal name, location, availability (lightweight, needed for demurrage questions)\n" +
          "• 'transport_events': Full event history, rail tracking (heavy 50-100 events, use for journey/timeline questions)\n\n" +
          "When to include:\n" +
          "- shipment: Always useful for context (minimal cost)\n" +
          "- pod_terminal: For availability, demurrage, holds, fees, pickup questions\n" +
          "- transport_events: For journey timeline, 'what happened', rail tracking, milestone analysis",
        default: ['shipment', 'pod_terminal'],
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
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'get_container',
      container_id: args.id,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const includes = args.include || ['shipment', 'pod_terminal'];
    const result = await client.containers.get(args.id, includes, { format: 'both' });
    const raw = (result as any)?.raw ?? result;
    const mapped = (result as any)?.mapped;

    const duration = Date.now() - startTime;

    console.error(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'get_container',
        container_id: args.id,
        includes: includes,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    const summary = formatContainerResponse(raw, includes);
    return { ...summary, _mapped: mapped } as any;
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

function formatContainerResponse(apiResponse: any, includes: string[]): ContainerStatus {
  const container = apiResponse.data?.attributes || {};
  const relationships = apiResponse.data?.relationships || {};
  const included = apiResponse.included || [];

  // Determine container lifecycle state
  const containerState = determineContainerState(container);

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

  // Extract transport events
  const transportEvents = included.filter((item: any) => item.type === 'transport_event');

  // Format events data based on whether it was included
  const eventsData = includes.includes('transport_events')
    ? formatEventsData(transportEvents)
    : `Call get_container with include=['transport_events'] to fetch ${transportEvents.length || '~50-100'} event records`;

  // Generate LLM steering metadata
  const metadata = generateMetadata(container, containerState, includes);

  return {
    id: apiResponse.data?.id,
    container_number: container.number,
    status: containerState,
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
      pickup_lfd: container.pickup_lfd ?? null,
      pickup_appointment_at: container.pickup_appointment_at ?? null,
      // Preserve nulls so clients don’t mistake “unavailable” for “empty”.
      fees_at_pod_terminal: container.fees_at_pod_terminal ?? null,
      holds_at_pod_terminal: container.holds_at_pod_terminal ?? null,
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
          line: shipment.attributes?.shipping_line_scac,
          shipping_line_name: shipment.attributes?.shipping_line_name,
          port_of_lading_name: shipment.attributes?.port_of_lading_name,
          port_of_discharge_name: shipment.attributes?.port_of_discharge_name,
          destination_name: shipment.attributes?.destination_name,
        }
      : null,
    pod_terminal: podTerminal
      ? {
          id: podTerminal.id,
          name: podTerminal.attributes?.name,
          firms_code: podTerminal.attributes?.firms_code,
        }
      : null,
    events: eventsData,
    updated_at: container.updated_at,
    created_at: container.created_at,
    _metadata: metadata,
  };
}

/**
 * Determine container lifecycle state for intelligent data loading
 */
function determineContainerState(
  container: any
): 'in_transit' | 'arrived' | 'discharged' | 'available_for_pickup' | 'at_terminal' | 'on_rail' | 'delivered' {
  if (!container.pod_arrived_at) return 'in_transit';
  if (!container.pod_discharged_at) return 'arrived';
  if (container.pod_rail_loaded_at && !container.final_destination_full_out_at) return 'on_rail';
  if (container.final_destination_full_out_at || container.pod_full_out_at) return 'delivered';
  if (container.available_for_pickup) return 'available_for_pickup';
  return 'at_terminal';
}

/**
 * Format transport events data when included
 */
function formatEventsData(events: any[]): any {
  if (!events || events.length === 0) {
    return { count: 0 };
  }

  const railEvents = events.filter(
    (e: any) => e.attributes?.event?.startsWith('rail.') || e.attributes?.event?.includes('rail')
  );

  // Get most recent event
  const sortedEvents = [...events].sort(
    (a: any, b: any) =>
      new Date(b.attributes?.timestamp || 0).getTime() - new Date(a.attributes?.timestamp || 0).getTime()
  );

  const latestEvent = sortedEvents[0]?.attributes;

  return {
    count: events.length,
    rail_events_count: railEvents.length,
    latest_event: latestEvent
      ? {
          event: latestEvent.event,
          timestamp: latestEvent.timestamp,
          location: latestEvent.location_name || latestEvent.port_name,
        }
      : undefined,
  };
}

/**
 * Generate metadata hints to steer LLM decision-making
 */
function generateMetadata(container: any, state: string, includes: string[]): any {
  const canAnswer: string[] = ['container status', 'equipment details', 'basic timeline'];
  const needsMoreDataFor: string[] = [];

  // What can we answer based on what's loaded?
  if (includes.includes('shipment')) {
    canAnswer.push('routing information', 'shipping line details', 'reference numbers');
  }

  if (includes.includes('pod_terminal')) {
    canAnswer.push('availability status', 'demurrage/LFD', 'holds and fees', 'terminal location');
  }

  if (includes.includes('transport_events')) {
    canAnswer.push('full journey timeline', 'milestone analysis', 'rail tracking details', 'event history');
  } else {
    needsMoreDataFor.push(
      "journey timeline → include: ['transport_events']",
      "milestone analysis → include: ['transport_events']",
      "rail movement details → include: ['transport_events']"
    );
  }

  // Generate contextual suggestions based on state
  const suggestions = generateSuggestions(container, state, includes);

  // Generate lifecycle-specific guidance
  const relevantFields = getRelevantFieldsForState(state, container);
  const presentationGuidance = getPresentationGuidance(state, container);

  return {
    container_state: state,
    includes_loaded: includes,
    can_answer: canAnswer,
    needs_more_data_for: needsMoreDataFor,
    relevant_for_current_state: relevantFields,
    presentation_guidance: presentationGuidance,
    suggestions,
  };
}

/**
 * Generate contextual suggestions for LLM based on container state
 */
function generateSuggestions(container: any, state: string, includes: string[]): any {
  let message: string | undefined;
  let recommendedFollowUp: string | null = null;

  // State-specific suggestions
  switch (state) {
    case 'in_transit':
      message = 'Container is still in transit. User may ask about vessel ETA or shipping route.';
      break;

    case 'arrived':
      message = 'Container has arrived but not yet discharged. User may ask about discharge timing.';
      break;

    case 'at_terminal':
    case 'available_for_pickup':
      if (Array.isArray(container.holds_at_pod_terminal) && container.holds_at_pod_terminal.length > 0) {
        const holdTypes = container.holds_at_pod_terminal.map((h: any) => h.name).join(', ');
        message = `Container has holds: ${holdTypes}. User may ask about hold details or clearance timeline.`;
      } else if (container.holds_at_pod_terminal == null && includes.includes('pod_terminal')) {
        message =
          'Hold/fee/LFD data is not available for this container/terminal via the API response. ' +
          'User may need to check terminal portal or customs/broker docs.';
      } else if (container.pickup_lfd) {
        const lfdDate = new Date(container.pickup_lfd);
        const now = new Date();
        const daysUntilLFD = Math.ceil((lfdDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilLFD < 0) {
          message = `Container is ${Math.abs(daysUntilLFD)} days past LFD. User may ask about demurrage charges.`;
        } else if (daysUntilLFD <= 3) {
          message = `LFD is in ${daysUntilLFD} days. Urgent pickup needed to avoid demurrage.`;
        } else {
          message = `Container available for pickup. LFD is in ${daysUntilLFD} days.`;
        }
      }
      break;

    case 'on_rail':
      message = 'Container is on rail transport. User may ask about rail carrier, destination ETA, or inland movement.';
      if (!includes.includes('transport_events')) {
        recommendedFollowUp = 'transport_events';
      }
      break;

    case 'delivered':
      message = 'Container has been delivered. User may ask about delivery details or empty return.';
      if (!includes.includes('transport_events')) {
        recommendedFollowUp = 'transport_events';
      }
      break;
  }

  return {
    message,
    recommended_follow_up: recommendedFollowUp,
  };
}

/**
 * Get relevant fields/attributes for current lifecycle state
 * Helps LLM know what to focus on in the response
 */
function getRelevantFieldsForState(state: string, container: any): string[] {
  switch (state) {
    case 'in_transit':
      return [
        'shipment.pod_eta_at - When arriving at destination',
        'shipment.pod_vessel_name - Current vessel',
        'shipment.port_of_discharge_name - Destination port',
        'shipment.pol_atd_at - When departed origin',
      ];

    case 'arrived':
      return [
        'location.pod_arrived_at - When vessel docked',
        'location.pod_discharged_at - Discharge status (null = still on vessel)',
        'pod_terminal.name - Which terminal',
      ];

    case 'at_terminal':
    case 'available_for_pickup':
      const fields = [
        'location.available_for_pickup - Ready to pick up?',
        'demurrage.pickup_lfd - Last Free Day (avoid demurrage)',
        'demurrage.holds_at_pod_terminal - Blocks pickup if present',
        'location.current_location - Where in terminal yard',
      ];
      if (container.fees_at_pod_terminal?.length > 0) {
        fields.push('demurrage.fees_at_pod_terminal - Storage/handling charges');
      }
      if (container.pickup_appointment_at) {
        fields.push('demurrage.pickup_appointment_at - Scheduled pickup time');
      }
      return fields;

    case 'on_rail':
      return [
        'rail.pod_rail_carrier - Rail carrier SCAC code',
        'rail.destination_eta - When arriving inland destination',
        'rail.pod_rail_departed_at - When left port',
        'shipment.destination_name - Inland city',
        'events - Rail milestones (if transport_events included)',
      ];

    case 'delivered':
      return [
        'location.pod_full_out_at - When picked up from terminal',
        'Complete journey timeline - Helpful for delivered containers',
        'empty_terminated_at - Empty return status (if applicable)',
      ];

    default:
      return ['status', 'location', 'equipment'];
  }
}

/**
 * Get presentation guidance for formatting output based on state
 * Tells LLM how to prioritize and structure the response
 */
function getPresentationGuidance(state: string, container: any): string {
  switch (state) {
    case 'in_transit':
      return 'Focus on ETA and vessel information. User wants to know WHEN it will arrive and WHERE it is now.';

    case 'arrived':
      return 'Explain vessel arrived but container not yet discharged. User wants to know WHEN discharge will happen.';

    case 'at_terminal':
    case 'available_for_pickup':
      // Check for urgent situations
      if (container.holds_at_pod_terminal?.length > 0) {
        const holdTypes = container.holds_at_pod_terminal.map((h: any) => h.name).join(', ');
        return `URGENT: Lead with holds (${holdTypes}) - they BLOCK pickup. Explain what each hold means and how to clear. Then mention LFD and location.`;
      }

      const lfdDate = container.pickup_lfd ? new Date(container.pickup_lfd) : null;
      const now = new Date();

      if (lfdDate && lfdDate < now) {
        const daysOverdue = Math.ceil((now.getTime() - lfdDate.getTime()) / (1000 * 60 * 60 * 24));
        return `URGENT: Container is ${daysOverdue} days past LFD. Demurrage is accruing daily (~$75-150/day typical). Emphasize urgency of pickup.`;
      }

      if (lfdDate) {
        const daysRemaining = Math.ceil((lfdDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining <= 2) {
          return `URGENT: Only ${daysRemaining} days until LFD. Pickup needed ASAP to avoid demurrage charges.`;
        }
        return `Lead with availability status. Mention LFD date and days remaining (${daysRemaining}). Include location if user picking up.`;
      }

      return 'State availability clearly. Mention location in terminal. Note any fees.';

    case 'on_rail':
      return 'Explain rail journey: Departed [port] on [date] via [carrier], heading to [city]. ETA: [date]. Emphasize destination and timing.';

    case 'delivered':
      return 'Confirm delivery completed with date/time. Optionally summarize full journey from origin to delivery.';

    default:
      return 'Present information clearly based on container lifecycle stage. Prioritize actionable details.';
  }
}
