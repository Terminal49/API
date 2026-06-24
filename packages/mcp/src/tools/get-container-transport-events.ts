/**
 * get_container_transport_events tool
 * Retrieves transport event timeline for a container
 */

import { NotFoundError, Terminal49Client } from '@terminal49/sdk';

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
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'get_container_transport_events',
      container_id: args.id,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const result = await client.containers.events(args.id, { format: 'raw' });
    const raw = (result as any)?.raw ?? result;

    logComplete(args.id, eventCount(raw), startTime, 'transport_events_subresource');

    return formatTransportEventsResponse(raw, { source: 'transport_events_subresource' });
  } catch (error) {
    if (!isNotFound(error)) {
      logError(args.id, error, startTime);
      throw error;
    }

    // The dedicated /containers/{id}/transport_events sub-resource can 404 even
    // when the container exists and has events (it is not enabled/populated for
    // every container). Fall back to the container's include path before
    // concluding there is nothing to show — never present a success-shaped empty
    // timeline that secretly carries a "Not Found" error.
    return fallbackToContainerInclude(args.id, client, startTime);
  }
}

async function fallbackToContainerInclude(
  id: string,
  client: Terminal49Client,
  startTime: number
): Promise<any> {
  let raw: any;
  try {
    const fallbackResult = await client.containers.get(id, ['transport_events'], {
      format: 'raw',
    });
    raw = (fallbackResult as any)?.raw ?? fallbackResult;
  } catch (fallbackError) {
    // A genuinely-missing container surfaces as a real tool error, distinct
    // from an empty-but-valid timeline.
    logError(id, fallbackError, startTime);
    throw fallbackError;
  }

  const events = extractIncludedTransportEvents(raw);

  logComplete(id, events.length, startTime, 'container_include_fallback');

  return formatTransportEventsResponse(
    { data: events, included: raw?.included || [] },
    { source: 'container_include_fallback', containerFound: true }
  );
}

function eventCount(raw: any): number {
  if (Array.isArray(raw)) return raw.length;
  if (Array.isArray(raw?.data)) return raw.data.length;
  return 0;
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof NotFoundError ||
    (error as any)?.status === 404 ||
    (error as any)?.name === 'NotFoundError'
  );
}

function logComplete(id: string, count: number, startTime: number, source: string): void {
  console.error(
    JSON.stringify({
      event: 'tool.execute.complete',
      tool: 'get_container_transport_events',
      container_id: id,
      event_count: count,
      source,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    })
  );
}

function logError(id: string, error: unknown, startTime: number): void {
  console.error(
    JSON.stringify({
      event: 'tool.execute.error',
      tool: 'get_container_transport_events',
      container_id: id,
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    })
  );
}

function extractIncludedTransportEvents(raw: any): any[] {
  const included = Array.isArray(raw?.included) ? raw.included : [];
  return included.filter((item: any) => item?.type === 'transport_event');
}

interface FormatOptions {
  source: 'transport_events_subresource' | 'container_include_fallback';
  containerFound?: boolean;
}

function formatTransportEventsResponse(apiResponse: any, options: FormatOptions): any {
  const events = Array.isArray(apiResponse)
    ? apiResponse
    : Array.isArray(apiResponse?.data)
      ? apiResponse.data
      : [];
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
    const eventType = normalizeText(attrs.event);
    const timestamp = normalizeTimestamp(attrs.timestamp);

    return {
      event: eventType,
      timestamp,
      timezone: normalizeText(attrs.timezone),
      voyage_number: normalizeText(attrs.voyage_number),
      location: resolveLocation(attrs, relationships, included),
    };
  });

  const metadata: Record<string, unknown> = {
    source: options.source,
    presentation_guidance:
      events.length > 0
        ? 'Present events chronologically as a journey timeline. ' +
          'Highlight key milestones: vessel loaded, departed, arrived, discharged, delivery. ' +
          'For rail containers, emphasize rail movements.'
        : 'This container exists but has no transport events yet. ' +
          'Report an empty timeline (not an error) and use get_container for current status.',
  };

  if (options.containerFound !== undefined) {
    metadata.container_found = options.containerFound;
  }

  return {
    total_events: events.length,
    event_categories: categorized,
    timeline: formattedEvents,
    milestones: extractKeyMilestones(sortedEvents),
    _metadata: metadata,
  };
}

function resolveLocation(attrs: any, relationships: any, included: any[]): any {
  // Dedicated sub-resource: location is a related resource in `included`.
  const locationId = relationships.location?.data?.id;
  const includedLocation = locationId
    ? included.find((item: any) => item.id === locationId)
    : undefined;
  if (includedLocation) {
    return {
      name: normalizeText(includedLocation.attributes?.name),
      code:
        normalizeText(includedLocation.attributes?.code) ||
        normalizeText(includedLocation.attributes?.locode),
      type: normalizeText(includedLocation.type),
    };
  }

  // Container-include fallback: events embed location on their own attributes.
  const embeddedName = normalizeText(attrs.location_name);
  if (embeddedName) {
    return {
      name: embeddedName,
      code: normalizeText(attrs.location_locode) || normalizeText(attrs.port_locode),
      type: undefined,
    };
  }

  return null;
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
    const eventType = normalizeText(event.attributes?.event) || '';

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
    const eventType = normalizeText(event.attributes?.event) || '';
    const timestamp = normalizeTimestamp(event.attributes?.timestamp);

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

function normalizeText(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function normalizeTimestamp(value: unknown): string {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) {
    return text;
  }

  return new Date(parsed).toISOString();
}
