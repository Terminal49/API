/**
 * The transport-event timeline get_container returns: every event oldest
 * first, with vessel, voyage, location and when it was reported.
 */

import { z } from 'zod';

/** One event in get_container's events.timeline. */
export const timelineEventSchema = z.object({
  event: z.string().optional(),
  timestamp: z.string(),
  // When Terminal49 recorded the event. For competing estimates of the same
  // milestone, the latest reported_at is the current one.
  reported_at: z.string().optional(),
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
});

export type TimelineEvent = z.input<typeof timelineEventSchema>;

/**
 * Formats events oldest first, keeping withdrawn events (invalidated_at set) so
 * the full reporting history stays visible.
 */
export function formatTimeline(
  events: any[],
  included: any[],
): TimelineEvent[] {
  return [...events]
    .sort(
      (a: any, b: any) =>
        new Date(a.attributes?.timestamp || 0).getTime() -
        new Date(b.attributes?.timestamp || 0).getTime(),
    )
    .map((event: any) => {
      const attrs = event.attributes || {};
      const relationships = event.relationships || {};
      const eventType = normalizeText(attrs.event);
      const timestamp = normalizeTimestamp(attrs.timestamp);

      return {
        event: eventType,
        // Keep the reported value separate from the event timestamp: deadline
        // changes carry the actual deadline in value, not timestamp.
        timestamp,
        reported_at: normalizeText(attrs.created_at)
          ? normalizeTimestamp(attrs.created_at)
          : undefined,
        value: attrs.value ?? null,
        data_source: attrs.data_source ?? null,
        invalidated_at: attrs.invalidated_at ?? null,
        timezone: normalizeText(attrs.timezone),
        voyage_number: normalizeText(attrs.voyage_number),
        vessel_id: relationships.vessel?.data?.id ?? null,
        location: resolveLocation(attrs, relationships, included),
      };
    });
}

function resolveLocation(
  attrs: any,
  relationships: any,
  included: any[],
): TimelineEvent['location'] {
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
