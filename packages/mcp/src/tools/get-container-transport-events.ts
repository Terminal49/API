/**
 * get_container_transport_events tool
 * Retrieves transport event timeline for a container
 */

import { Terminal49Client } from '@terminal49/sdk';

export interface GetContainerTransportEventsArgs {
  id: string;
}

export const getContainerTransportEventsTool = {
  name: 'get_container_transport_events',
  description:
    'Get detailed transport event timeline for a container. Returns all milestones and movements ' +
    '(vessel loaded, departed, arrived, discharged, rail movements, delivery). ' +
    'Use this for questions about journey history, "what happened", timeline analysis, rail tracking. ' +
    'More efficient than get_container with transport_events when you only need event data.',
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

export async function executeGetContainerTransportEvents(
  args: GetContainerTransportEventsArgs,
  client: Terminal49Client
): Promise<any> {
  if (!args.id || args.id.trim() === '') {
    throw new Error('Container ID is required');
  }

  const startTime = Date.now();
  console.log(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'get_container_transport_events',
      container_id: args.id,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const result = await client.containers.events(args.id, { format: 'both' });
    const raw = (result as any)?.raw ?? result;
    const mapped = (result as any)?.mapped;
    const duration = Date.now() - startTime;

    console.log(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'get_container_transport_events',
        container_id: args.id,
        event_count: raw?.data?.length || (Array.isArray(mapped) ? mapped.length : 0) || 0,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    const summary = formatTransportEventsResponse(raw);
    return mapped ? { mapped, summary } : summary;
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'get_container_transport_events',
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

function formatTransportEventsResponse(apiResponse: any): any {
  const events = apiResponse.data || [];
  const included = apiResponse.included || [];

  // Sort events chronologically
  const sortedEvents = [...events].sort((a: any, b: any) => {
    const timeA = new Date(a.attributes?.timestamp || 0).getTime();
    const timeB = new Date(b.attributes?.timestamp || 0).getTime();
    return timeA - timeB;
  });

  // Categorize events
  const categorized = categorizeEvents(sortedEvents);

  // Format events with location context
  const formattedEvents = sortedEvents.map((event: any) => {
    const attrs = event.attributes || {};
    const relationships = event.relationships || {};

    // Find location info from included data
    const locationId = relationships.location?.data?.id;
    const location = included.find((item: any) => item.id === locationId);

    return {
      event: attrs.event,
      timestamp: attrs.timestamp,
      timezone: attrs.timezone,
      voyage_number: attrs.voyage_number,
      location: location
        ? {
            name: location.attributes?.name,
            code: location.attributes?.code || location.attributes?.locode,
            type: location.type,
          }
        : null,
    };
  });

  return {
    total_events: events.length,
    event_categories: categorized,
    timeline: formattedEvents,
    milestones: extractKeyMilestones(sortedEvents),
    _metadata: {
      presentation_guidance:
        'Present events chronologically as a journey timeline. ' +
        'Highlight key milestones: vessel loaded, departed, arrived, discharged, delivery. ' +
        'For rail containers, emphasize rail movements.',
    },
  };
}

function categorizeEvents(events: any[]): any {
  const categories = {
    vessel: [] as any[],
    rail: [] as any[],
    truck: [] as any[],
    terminal: [] as any[],
    other: [] as any[],
  };

  events.forEach((event: any) => {
    const eventType = event.attributes?.event || '';

    if (eventType.includes('vessel') || eventType.includes('ship')) {
      categories.vessel.push(eventType);
    } else if (eventType.includes('rail')) {
      categories.rail.push(eventType);
    } else if (eventType.includes('truck') || eventType.includes('trucking')) {
      categories.truck.push(eventType);
    } else if (
      eventType.includes('gate') ||
      eventType.includes('terminal') ||
      eventType.includes('discharged')
    ) {
      categories.terminal.push(eventType);
    } else {
      categories.other.push(eventType);
    }
  });

  return {
    vessel_events: categories.vessel.length,
    rail_events: categories.rail.length,
    truck_events: categories.truck.length,
    terminal_events: categories.terminal.length,
    other_events: categories.other.length,
  };
}

function extractKeyMilestones(events: any[]): any {
  const milestones: any = {};

  events.forEach((event: any) => {
    const eventType = event.attributes?.event || '';
    const timestamp = event.attributes?.timestamp;

    // Map common milestone events
    if (eventType.includes('vessel.loaded') || eventType === 'container.transport.vessel_loaded') {
      milestones.vessel_loaded_at = timestamp;
    } else if (
      eventType.includes('vessel.departed') ||
      eventType === 'container.transport.vessel_departed'
    ) {
      milestones.vessel_departed_at = timestamp;
    } else if (
      eventType.includes('vessel.arrived') ||
      eventType === 'container.transport.vessel_arrived'
    ) {
      milestones.vessel_arrived_at = timestamp;
    } else if (eventType.includes('discharged') || eventType === 'container.transport.discharged') {
      milestones.discharged_at = timestamp;
    } else if (eventType.includes('rail.loaded') || eventType === 'container.transport.rail_loaded') {
      milestones.rail_loaded_at = timestamp;
    } else if (
      eventType.includes('rail.departed') ||
      eventType === 'container.transport.rail_departed'
    ) {
      milestones.rail_departed_at = timestamp;
    } else if (
      eventType.includes('rail.arrived') ||
      eventType === 'container.transport.rail_arrived'
    ) {
      milestones.rail_arrived_at = timestamp;
    } else if (eventType.includes('full_out') || eventType === 'container.transport.full_out') {
      milestones.delivered_at = timestamp;
    }
  });

  return milestones;
}
