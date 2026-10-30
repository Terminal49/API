/**
 * get_container_transport_events tool
 * Retrieves transport event timeline for a container
 */

import { NotFoundError, Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { logMcpEvent } from '../logging.js';

export interface GetContainerTransportEventsArgs {
  id: string;
}

export const getContainerTransportEventsTool = {
  name: 'get_container_transport_events',
  description:
    'Get detailed transport event timeline for a container. Returns all milestones and movements ' +
    '(vessel loaded, departed, arrived, discharged, rail movements, delivery). ' +
    'Use this for questions about journey history, "what happened", timeline analysis, rail tracking. ' +
    'For deadline changes, value is the reported deadline; timestamp is when it was reported. ' +
    'Vessel events carry vessel_id for get_vessel. ' +
    'More efficient than get_container with transport_events when you only need event data. The result has total_events, event_categories, timeline (each event with timestamp, location, vessel and voyage), and milestones (the vessel loaded, departed, arrived, discharged, rail, and delivered times).',
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description:
          'Terminal49 container ID, from search_container or list_containers.',
      },
    },
    required: ['id'],
  },
};

const milestoneTimestamp = z.string().optional();

/**
 * Output contract for get_container_transport_events. Agents that script tool
 * calls read field names from this schema, so every key
 * `formatTransportEventsResponse` emits is listed.
 */
export const transportEventsSchema = z.object({
  total_events: z.number(),
  event_categories: z.object({
    vessel_events: z.number(),
    rail_events: z.number(),
    truck_events: z.number(),
    terminal_events: z.number(),
    other_events: z.number(),
  }),
  timeline: z.array(
    z.object({
      event: z.string().optional(),
      timestamp: z.string(),
      // The reported value is opaque; deadline events carry the deadline here.
      value: z.unknown(),
      data_source: z.string().nullable(),
      invalidated_at: z.string().nullable(),
      timezone: z.string().optional(),
      voyage_number: z.string().optional(),
      vessel_id: z.string().nullable(),
      location: z
        .object({
          name: z.string().optional(),
          code: z.string().optional(),
          type: z.string().optional(),
        })
        .nullable(),
    }),
  ),
  milestones: z.object({
    vessel_loaded_at: milestoneTimestamp,
    vessel_departed_at: milestoneTimestamp,
    vessel_arrived_at: milestoneTimestamp,
    discharged_at: milestoneTimestamp,
    rail_loaded_at: milestoneTimestamp,
    rail_departed_at: milestoneTimestamp,
    rail_arrived_at: milestoneTimestamp,
    delivered_at: milestoneTimestamp,
  }),
  _metadata: z.object({
    source: z.enum([
      'transport_events_subresource',
      'container_include_fallback',
    ]),
    container_found: z.boolean().optional(),
  }),
});

type TransportEvents = z.input<typeof transportEventsSchema>;

export async function executeGetContainerTransportEvents(
  args: GetContainerTransportEventsArgs,
  client: Terminal49Client,
): Promise<TransportEvents> {
  if (!args.id || args.id.trim() === '') {
    throw new Error('Container ID is required');
  }

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'get_container_transport_events',
    container_id: args.id,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await client.containers.events(args.id, { format: 'raw' });
    const raw = (result as any)?.raw ?? result;

    logComplete(
      args.id,
      eventCount(raw),
      startTime,
      'transport_events_subresource',
    );

    // A 200 from the dedicated sub-resource means the container exists, even
    // when it carries zero events. Surface `container_found` consistently with
    // the fallback path so an empty-but-valid primary timeline is never
    // mistaken for a missing container.
    return formatTransportEventsResponse(raw, {
      source: 'transport_events_subresource',
      containerFound: true,
    });
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
    logFallback(args.id, error);
    return fallbackToContainerInclude(args.id, client, startTime);
  }
}

async function fallbackToContainerInclude(
  id: string,
  client: Terminal49Client,
  startTime: number,
): Promise<TransportEvents> {
  let raw: any;
  try {
    const fallbackResult = await client.containers.get(
      id,
      ['transport_events'],
      {
        format: 'raw',
      },
    );
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
    { source: 'container_include_fallback', containerFound: true },
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

function logComplete(
  id: string,
  count: number,
  startTime: number,
  source: string,
): void {
  logMcpEvent({
    event: 'tool.execute.complete',
    tool: 'get_container_transport_events',
    container_id: id,
    event_count: count,
    source,
    duration_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });
}

function logFallback(id: string, error: unknown): void {
  // The primary 404 is expected (the sub-resource is not enabled for every
  // container), so it is not surfaced as an error — but operators
  // investigating fallback traffic need a signal to correlate against.
  logMcpEvent({
    event: 'tool.execute.fallback',
    tool: 'get_container_transport_events',
    container_id: id,
    reason: 'transport_events_subresource_not_found',
    error: (error as Error).name,
    message: (error as Error).message,
    timestamp: new Date().toISOString(),
  });
}

function logError(id: string, error: unknown, startTime: number): void {
  logMcpEvent({
    event: 'tool.execute.error',
    tool: 'get_container_transport_events',
    container_id: id,
    error: (error as Error).name,
    message: (error as Error).message,
    duration_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  });
}

function extractIncludedTransportEvents(raw: any): any[] {
  const included = Array.isArray(raw?.included) ? raw.included : [];
  return included.filter((item: any) => item?.type === 'transport_event');
}

interface FormatOptions {
  source: 'transport_events_subresource' | 'container_include_fallback';
  containerFound?: boolean;
}

function formatTransportEventsResponse(
  apiResponse: any,
  options: FormatOptions,
): TransportEvents {
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
  const activeEvents = sortedEvents.filter(
    (event: any) => !event.attributes?.invalidated_at,
  );
  const categorized = categorizeEvents(activeEvents);

  // Format events with location context
  const formattedEvents = sortedEvents.map((event: any) => {
    const attrs = event.attributes || {};
    const relationships = event.relationships || {};
    const eventType = normalizeText(attrs.event);
    const timestamp = normalizeTimestamp(attrs.timestamp);

    return {
      event: eventType,
      // Keep the reported value separate from the event timestamp: deadline
      // changes carry the actual deadline in value, not timestamp.
      timestamp,
      value: attrs.value ?? null,
      data_source: attrs.data_source ?? null,
      invalidated_at: attrs.invalidated_at ?? null,
      timezone: normalizeText(attrs.timezone),
      voyage_number: normalizeText(attrs.voyage_number),
      vessel_id: relationships.vessel?.data?.id ?? null,
      location: resolveLocation(attrs, relationships, included),
    };
  });

  const metadata: TransportEvents['_metadata'] = {
    source: options.source,
  };

  if (options.containerFound !== undefined) {
    metadata.container_found = options.containerFound;
  }

  return {
    total_events: events.length,
    event_categories: categorized,
    timeline: formattedEvents,
    milestones: extractKeyMilestones(activeEvents),
    _metadata: metadata,
  };
}

function resolveLocation(
  attrs: any,
  relationships: any,
  included: any[],
): TransportEvents['timeline'][number]['location'] {
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

  // Container-include fallback: the related port/metro_area resource is not
  // side-loaded, so resolve from the event's own attributes. Canonical
  // transport_event payloads carry `location_locode` (and usually no
  // `location_name`), so surface a location whenever either is present rather
  // than dropping the movement location entirely.
  const embeddedName = normalizeText(attrs.location_name);
  const embeddedCode =
    normalizeText(attrs.location_locode) || normalizeText(attrs.port_locode);
  if (embeddedName || embeddedCode) {
    return {
      name: embeddedName,
      code: embeddedCode,
      type: undefined,
    };
  }

  return null;
}

function categorizeEvents(events: any[]): TransportEvents['event_categories'] {
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

function extractKeyMilestones(events: any[]): TransportEvents['milestones'] {
  const milestones: TransportEvents['milestones'] = {};

  events.forEach((event: any) => {
    const eventType = normalizeText(event.attributes?.event) || '';
    const timestamp = normalizeTimestamp(event.attributes?.timestamp);

    // Map common milestone events
    if (
      eventType.includes('vessel.loaded') ||
      eventType === 'container.transport.vessel_loaded'
    ) {
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
    } else if (
      eventType.includes('discharged') ||
      eventType === 'container.transport.discharged'
    ) {
      milestones.discharged_at = timestamp;
    } else if (
      eventType.includes('rail.loaded') ||
      eventType === 'container.transport.rail_loaded'
    ) {
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
    } else if (
      eventType.includes('full_out') ||
      eventType === 'container.transport.full_out'
    ) {
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
