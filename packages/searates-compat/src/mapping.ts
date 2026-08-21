import type {
  JsonApiDocument,
  JsonApiResource,
  JsonObject,
  SeaRatesEnvelope,
  SeaRatesEvent,
  SeaRatesEventCode,
  TrackingPayload,
} from './types.js';

type Conveyance = 'BARGE' | 'RAIL' | 'TRUCK' | 'VESSEL';

interface EventIds {
  facilities: Map<string, number>;
  locations: Map<string, number>;
  locationsByLocode: Map<string, number>;
  vessels: Map<string, number>;
}

interface EventDraft {
  actual: boolean;
  code: SeaRatesEventCode | null;
  description: string;
  eventType: 'EQUIPMENT' | 'TRANSPORT' | null;
  explicitConveyance: boolean;
  facility: number | null;
  instant: number | null;
  instantKey: string;
  location: number | null;
  name: string;
  order: number;
  status: string;
  transport: Conveyance | null;
  type: 'land' | 'sea';
  vessel: number | null;
  voyage: string | null;
  date: string | null;
}

const SEA_OPERATION_CODES = new Set<SeaRatesEventCode>([
  'ARRI',
  'DEPA',
  'DISC',
  'LOAD',
]);

function attrs(resource: JsonApiResource): JsonObject {
  return resource.attributes || {};
}

function relatedId(
  resource: JsonApiResource,
  relationship: string,
): string | null {
  const data = resource.relationships?.[relationship]?.data;
  return data && !Array.isArray(data) ? data.id : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function normalizeNumber(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, '').toUpperCase()
    : '';
}

function formatParts(date: Date, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      timeZone,
      year: 'numeric',
    }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    return `${values.get('year')}-${values.get('month')}-${values.get('day')} ${values.get('hour')}:${values.get('minute')}:${values.get('second')}`;
  } catch {
    return null;
  }
}

function formatDate(value: unknown, timeZone?: string | null): string | null {
  if (typeof value !== 'string' || !value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    return match ? `${match[1]} ${match[2]}` : null;
  }
  if (timeZone) {
    const local = formatParts(parsed, timeZone);
    if (local) return local;
  }
  const offsetMatch = value.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?[+-]\d{2}:\d{2}$/,
  );
  if (offsetMatch) return `${offsetMatch[1]} ${offsetMatch[2]}`;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function timestamp(value: unknown): { instant: number | null; key: string } {
  if (typeof value !== 'string' || !value) {
    return { instant: null, key: '' };
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed)
    ? { instant: null, key: value }
    : { instant: parsed, key: String(parsed) };
}

function resourceIndex(
  resources: JsonApiResource[],
): Map<string, JsonApiResource> {
  return new Map(resources.map((resource) => [resource.id, resource]));
}

function collectResources(payload: TrackingPayload): JsonApiResource[] {
  const resources = [payload.shipment, ...payload.included];
  for (const document of payload.eventsByContainerId.values()) {
    if (Array.isArray(document.data)) resources.push(...document.data);
    resources.push(...(document.included || []));
  }
  const unique = new Map<string, JsonApiResource>();
  for (const resource of resources) {
    const key = `${resource.type}:${resource.id}`;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, resource);
      continue;
    }
    unique.set(key, {
      ...existing,
      ...resource,
      attributes: {
        ...existing.attributes,
        ...resource.attributes,
      },
      relationships: {
        ...existing.relationships,
        ...resource.relationships,
      },
    });
  }
  return [...unique.values()];
}

function equipment(attributes: JsonObject): {
  isoCode: string | null;
  sizeType: string | null;
} {
  const length = numberValue(attributes.equipment_length);
  const height = stringValue(attributes.equipment_height);
  const type = stringValue(attributes.equipment_type)
    ?.toLowerCase()
    .replaceAll('_', ' ');
  if (!length || !height || !type) return { isoCode: null, sizeType: null };

  const lengthCode = new Map([
    [10, '1'],
    [20, '2'],
    [40, '4'],
    [45, 'L'],
  ]).get(length);
  const typeCode = new Map([
    ['dry', 'G1'],
    ['flat rack', 'P1'],
    ['open top', 'U1'],
    ['reefer', 'R1'],
    ['tank', 'T1'],
  ]).get(type);
  const label = new Map([
    ['bulk', 'Bulk'],
    ['dry', 'Dry'],
    ['flat rack', 'Flat Rack'],
    ['open top', 'Open Top'],
    ['reefer', 'Reefer'],
    ['tank', 'Tank'],
  ]).get(type);
  const heightCode = height === 'high_cube' ? '5' : '2';
  const heightLabel = height === 'high_cube' ? ' High Cube' : '';
  return {
    isoCode:
      lengthCode && typeCode ? `${lengthCode}${heightCode}${typeCode}` : null,
    sizeType: label ? `${length}'${heightLabel} ${label}` : null,
  };
}

function seaRatesStatus(value: unknown, events: EventDraft[]): string {
  const normalized =
    typeof value === 'string' ? value.toLowerCase().replaceAll(' ', '_') : '';
  if (['delivered', 'empty_returned'].includes(normalized)) return 'DELIVERED';
  if (
    [
      'available',
      'awaiting_inland_transfer',
      'departed',
      'discharged',
      'dropped',
      'grounded',
      'hold',
      'in_transit',
      'loaded',
      'not_available',
      'off_dock',
      'on_rail',
      'on_ship',
      'picked_up',
    ].includes(normalized)
  ) {
    return 'IN_TRANSIT';
  }
  if (events.some((event) => ['CDC', 'CER'].includes(event.status))) {
    return 'DELIVERED';
  }
  if (
    events.some((event) =>
      [
        'CDD',
        'CDT',
        'CGI',
        'CGO',
        'CLL',
        'CLT',
        'LTS',
        'VAD',
        'VAT',
        'VDL',
        'VDT',
      ].includes(event.status),
    )
  ) {
    return 'IN_TRANSIT';
  }
  if (['booked', 'created', 'new', 'planned'].includes(normalized)) {
    return 'PLANNED';
  }
  return events.length > 0 ? 'PLANNED' : 'UNKNOWN';
}

function eventDescription(name: string, attributes: JsonObject): string {
  const supplied =
    stringValue(attributes.description) ||
    stringValue(attributes.original_event);
  if (supplied) return supplied;
  const label = name.split('.').at(-1)?.replaceAll('_', ' ') || 'Unknown event';
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classifyCode(
  name: string,
  description: string,
): SeaRatesEventCode | null {
  const text = `${name} ${description}`.toLowerCase();
  if (/\b(customs).*(release|released)\b/.test(text)) return 'CUSR';
  if (/\b(customs).*(inspect|inspection)\b/.test(text)) return 'CUSI';
  if (/\b(stuff|stuffing|stuffed)\b/.test(text)) return 'STUF';
  if (/\b(strip|stripping|stripped)\b/.test(text)) return 'STRP';
  if (/\b(receive|received)\b/.test(text)) return 'RECE';
  if (/\b(confirm|confirmed|booking_confirmed)\b/.test(text)) return 'CONF';
  if (/\b(issue|issued)\b/.test(text)) return 'ISSU';
  if (/\b(inspect|inspected)\b/.test(text)) return 'INSP';
  if (/\b(release|released)\b/.test(text)) return 'RELS';
  if (/\b(pickup|picked up|picked_up)\b/.test(text)) return 'PICK';
  if (/\b(full_out|empty_out|gate out|gate_out)\b/.test(text)) return 'GTOT';
  if (/\b(full_in|empty_in|gate in|gate_in|drop)\b/.test(text)) return 'GTIN';
  if (/\b(discharg|unload)\w*\b/.test(text)) return 'DISC';
  if (/\b(load|loaded)\w*\b/.test(text)) return 'LOAD';
  if (/\b(depart|departure)\w*\b/.test(text)) return 'DEPA';
  if (/\b(arriv|arrival)\w*\b/.test(text)) return 'ARRI';
  return null;
}

function conveyance(
  resource: JsonApiResource,
  name: string,
  description: string,
  code: SeaRatesEventCode | null,
): { explicit: boolean; transport: Conveyance | null } {
  const attributes = attrs(resource);
  const supplied =
    stringValue(attributes.transport_type) || stringValue(attributes.mode);
  const text = `${supplied || ''} ${name} ${description}`.toLowerCase();
  if (/\b(rail|train)\b/.test(text)) {
    return {
      explicit: Boolean(supplied) || /rail/.test(name),
      transport: 'RAIL',
    };
  }
  if (/\b(barge|feeder|waterway)\b/.test(text)) {
    return { explicit: true, transport: 'BARGE' };
  }
  if (/\b(truck|road)\b/.test(text)) {
    return { explicit: Boolean(supplied), transport: 'TRUCK' };
  }
  if (/\binland\b/.test(text)) {
    return { explicit: true, transport: 'TRUCK' };
  }
  if (
    /\b(vessel|ocean|ship|transshipment)\b/.test(text) ||
    relatedId(resource, 'vessel') ||
    (code && SEA_OPERATION_CODES.has(code))
  ) {
    return { explicit: Boolean(supplied), transport: 'VESSEL' };
  }
  return { explicit: false, transport: 'TRUCK' };
}

function eventLocation(
  resource: JsonApiResource,
  ids: EventIds,
): number | null {
  const relationshipId = relatedId(resource, 'location');
  if (relationshipId) return ids.locations.get(relationshipId) ?? null;
  const locode = stringValue(attrs(resource).location_locode);
  return locode ? (ids.locationsByLocode.get(locode) ?? null) : null;
}

function eventTimeZone(
  resource: JsonApiResource,
  locationByNumber: Map<number, JsonApiResource>,
  location: number | null,
): string | null {
  return (
    stringValue(attrs(resource).timezone) ||
    (location
      ? stringValue(
          attrs(locationByNumber.get(location) || { id: '', type: '' })
            .time_zone,
        )
      : null)
  );
}

function draftEvents(
  resources: JsonApiResource[],
  ids: EventIds,
  locationByNumber: Map<number, JsonApiResource>,
): EventDraft[] {
  return resources
    .map((resource, order): EventDraft | null => {
      const attributes = attrs(resource);
      const rawName = stringValue(attributes.event);
      if (!rawName) return null;
      const name = rawName.replace('.estimated.', '.');
      const description = eventDescription(name, attributes);
      const code = classifyCode(name, description);
      const isDelay = /\b(delay|delayed|transshipment delay)\b/i.test(
        `${name} ${description}`,
      );
      const mode = isDelay
        ? { explicit: false, transport: null }
        : conveyance(resource, name, description, code);
      const location = eventLocation(resource, ids);
      const eventTimestamp = attributes.timestamp;
      const parsed = timestamp(eventTimestamp);
      const isLand = mode.transport === 'RAIL' || mode.transport === 'TRUCK';
      return {
        actual:
          !rawName.includes('.estimated.') && attributes.estimated !== true,
        code,
        date: formatDate(
          eventTimestamp,
          eventTimeZone(resource, locationByNumber, location),
        ),
        description,
        eventType: isDelay
          ? null
          : code === 'ARRI' || code === 'DEPA'
            ? 'TRANSPORT'
            : 'EQUIPMENT',
        explicitConveyance: mode.explicit,
        facility: relatedId(resource, 'terminal')
          ? (ids.facilities.get(relatedId(resource, 'terminal') || '') ?? null)
          : null,
        instant: parsed.instant,
        instantKey: parsed.key,
        location,
        name,
        order,
        status: isDelay ? 'TSD' : 'UNKN',
        transport: mode.transport,
        type: isDelay || !isLand ? 'sea' : 'land',
        vessel:
          isLand || !relatedId(resource, 'vessel')
            ? null
            : (ids.vessels.get(relatedId(resource, 'vessel') || '') ?? null),
        voyage: isLand ? null : stringValue(attributes.voyage_number),
      };
    })
    .filter((event): event is EventDraft => event !== null)
    .sort((left, right) => {
      if (left.instant === null && right.instant === null) {
        return left.order - right.order;
      }
      if (left.instant === null) return 1;
      if (right.instant === null) return -1;
      return left.instant - right.instant || left.order - right.order;
    });
}

function isSea(event: EventDraft): boolean {
  return event.transport === 'VESSEL' || event.transport === 'BARGE';
}

function assignStatuses(events: EventDraft[]): void {
  const seaEvents = events.filter(isSea);
  const originLoad = seaEvents.find(
    (event, index) =>
      event.code === 'LOAD' &&
      !/transshipment/.test(event.name) &&
      !seaEvents
        .slice(0, index)
        .some((earlier) =>
          ['ARRI', 'DEPA', 'DISC', 'LOAD'].includes(earlier.code || ''),
        ),
  );
  const originDeparture = seaEvents.find(
    (event, index) =>
      event.code === 'DEPA' &&
      !/transshipment/.test(event.name) &&
      !seaEvents
        .slice(0, index)
        .some((earlier) =>
          ['ARRI', 'DEPA', 'DISC'].includes(earlier.code || ''),
        ) &&
      !seaEvents
        .slice(0, index)
        .some((earlier) => earlier.code === 'LOAD' && earlier !== originLoad),
  );
  const firstSeaBoundary = [originLoad, originDeparture]
    .filter((event): event is EventDraft => Boolean(event))
    .sort(
      (left, right) => (left.instant ?? Infinity) - (right.instant ?? Infinity),
    )[0];
  const lastSeaArrival = [...events]
    .reverse()
    .find(
      (event) =>
        event.code === 'ARRI' &&
        isSea(event) &&
        !/transshipment/.test(event.name),
    );
  const finalSeaDischarge = [...events]
    .reverse()
    .find(
      (event) =>
        event.code === 'DISC' &&
        isSea(event) &&
        !/transshipment/.test(event.name) &&
        !events.some(
          (later) =>
            later.order !== event.order &&
            (later.instant ?? -Infinity) > (event.instant ?? -Infinity) &&
            isSea(later) &&
            (later.code === 'LOAD' || later.code === 'DEPA'),
        ),
    );

  for (const event of events) {
    if (event.status === 'TSD') continue;
    const text = `${event.name} ${event.description}`.toLowerCase();
    const isExplicitInland =
      event.transport === 'RAIL' ||
      (event.transport === 'TRUCK' && event.explicitConveyance);
    const afterPod =
      finalSeaDischarge?.instant !== null &&
      finalSeaDischarge?.instant !== undefined &&
      event.instant !== null &&
      event.instant >= finalSeaDischarge.instant;
    const empty = /\bempty\b/.test(text);

    if (
      isExplicitInland &&
      event.code &&
      ['ARRI', 'DEPA', 'DISC', 'GTIN', 'GTOT', 'LOAD', 'PICK'].includes(
        event.code,
      )
    ) {
      event.status = 'LTS';
    } else if (event.name.endsWith('.delivered')) {
      event.status = 'CDC';
    } else if (event.code === 'LOAD') {
      event.status =
        event === originLoad && !/transshipment/.test(event.name)
          ? 'CLL'
          : isSea(event)
            ? 'CLT'
            : 'LTS';
    } else if (event.code === 'DEPA') {
      event.status =
        event === originDeparture && !/transshipment/.test(event.name)
          ? 'VDL'
          : isSea(event)
            ? 'VDT'
            : 'LTS';
    } else if (event.code === 'ARRI') {
      const laterSailing = events.some(
        (later) =>
          later.instant !== null &&
          event.instant !== null &&
          later.instant > event.instant &&
          isSea(later) &&
          (later.code === 'LOAD' || later.code === 'DEPA'),
      );
      event.status =
        !isSea(event) ||
        (firstSeaBoundary?.instant !== null &&
          event.instant !== null &&
          firstSeaBoundary?.instant !== undefined &&
          event.instant < firstSeaBoundary.instant)
          ? 'LTS'
          : event === lastSeaArrival &&
              !laterSailing &&
              !/transshipment/.test(event.name)
            ? 'VAD'
            : 'VAT';
    } else if (event.code === 'DISC') {
      const laterSailing = events.some(
        (later) =>
          later.instant !== null &&
          event.instant !== null &&
          later.instant > event.instant &&
          isSea(later) &&
          (later.code === 'LOAD' || later.code === 'DEPA'),
      );
      event.status = !isSea(event)
        ? 'LTS'
        : event !== finalSeaDischarge ||
            laterSailing ||
            /transshipment/.test(event.name)
          ? 'CDT'
          : 'CDD';
    } else if (event.code === 'GTOT') {
      event.status =
        empty || event.name.endsWith('.empty_out')
          ? 'CEP'
          : afterPod || event.name.endsWith('.full_out')
            ? 'CGO'
            : firstSeaBoundary &&
                event.instant !== null &&
                firstSeaBoundary.instant !== null &&
                event.instant < firstSeaBoundary.instant
              ? 'CEP'
              : 'UNKN';
    } else if (event.code === 'GTIN') {
      event.status =
        empty || event.name.endsWith('.empty_in')
          ? 'CER'
          : event.name.endsWith('.full_in') && !afterPod
            ? 'CGI'
            : afterPod
              ? 'CER'
              : 'UNKN';
    } else if (event.code === 'PICK') {
      event.status = isExplicitInland
        ? 'LTS'
        : afterPod
          ? 'CGO'
          : empty && /merchant haul/.test(text)
            ? 'CEP'
            : 'CPS';
    } else {
      event.status = 'UNKN';
    }
  }
}

function samePlace(left: EventDraft, right: EventDraft): boolean {
  const leftLocated = left.location !== null || left.facility !== null;
  const rightLocated = right.location !== null || right.facility !== null;
  if (!leftLocated || !rightLocated) return true;
  if (
    left.location !== null &&
    right.location !== null &&
    left.location !== right.location
  ) {
    return false;
  }
  if (
    left.facility !== null &&
    right.facility !== null &&
    left.facility !== right.facility
  ) {
    return false;
  }
  return (
    (left.location !== null && right.location !== null) ||
    (left.facility !== null && right.facility !== null)
  );
}

function preferEvent(existing: EventDraft, event: EventDraft): EventDraft {
  const eventLocated = event.location !== null || event.facility !== null;
  const existingLocated =
    existing.location !== null || existing.facility !== null;
  if (
    (eventLocated && !existingLocated) ||
    (eventLocated === existingLocated && event.actual && !existing.actual) ||
    (eventLocated === existingLocated &&
      event.actual === existing.actual &&
      event.order > existing.order)
  ) {
    return event;
  }
  return existing;
}

function deduplicateRaw(events: EventDraft[]): EventDraft[] {
  const kept: EventDraft[] = [];
  for (const event of events) {
    const isExplicitLand =
      event.transport === 'RAIL' ||
      (event.transport === 'TRUCK' && event.explicitConveyance);
    if (!event.code || isExplicitLand || !event.instantKey) {
      kept.push(event);
      continue;
    }
    const duplicateIndex = kept.findIndex(
      (candidate) =>
        candidate.code === event.code &&
        candidate.transport === event.transport &&
        candidate.instantKey === event.instantKey &&
        samePlace(candidate, event),
    );
    if (duplicateIndex < 0) {
      kept.push(event);
    } else {
      kept[duplicateIndex] = preferEvent(kept[duplicateIndex], event);
    }
  }
  return kept;
}

function deduplicateMilestones(events: EventDraft[]): EventDraft[] {
  const kept: EventDraft[] = [];
  for (const event of events) {
    if (event.status === 'LTS' || event.status === 'UNKN') {
      kept.push(event);
      continue;
    }
    const duplicateIndex = kept.findIndex(
      (candidate) =>
        event.instantKey.length > 0 &&
        candidate.instantKey === event.instantKey &&
        candidate.status === event.status &&
        samePlace(candidate, event),
    );
    if (duplicateIndex < 0) {
      kept.push(event);
      continue;
    }
    kept[duplicateIndex] = preferEvent(kept[duplicateIndex], event);
  }
  return kept.sort((left, right) => {
    if (left.instant === null && right.instant === null) {
      return left.order - right.order;
    }
    if (left.instant === null) return 1;
    if (right.instant === null) return -1;
    return left.instant - right.instant || left.order - right.order;
  });
}

function publicEvent(event: EventDraft, order: number): SeaRatesEvent {
  return {
    actual: event.actual,
    date: event.date,
    description: event.description,
    event_code: event.code,
    event_type: event.eventType,
    facility: event.facility,
    is_additional_event: false,
    is_date_from_sealine: true,
    location: event.location,
    order_id: order,
    status: event.status,
    transport_type: event.transport,
    type: event.type,
    vessel: event.type === 'land' ? null : event.vessel,
    voyage: event.type === 'land' ? null : event.voyage,
  };
}

function buildTimeline(
  resources: JsonApiResource[],
  ids: EventIds,
  locationByNumber: Map<number, JsonApiResource>,
): EventDraft[] {
  const drafts = deduplicateRaw(draftEvents(resources, ids, locationByNumber));
  assignStatuses(drafts);
  return deduplicateMilestones(drafts);
}

function routePoint(event: EventDraft | undefined): {
  actual: boolean | null;
  date: string | null;
  location: number | null;
} {
  return event
    ? { actual: event.actual, date: event.date, location: event.location }
    : { actual: null, date: null, location: null };
}

export function mapTrackingPayload(payload: TrackingPayload): SeaRatesEnvelope {
  const resources = collectResources(payload);
  const byId = resourceIndex(resources);
  const locationResources = resources.filter((resource) =>
    ['metro_area', 'port'].includes(resource.type),
  );
  const facilityResources = resources.filter((resource) =>
    ['rail_terminal', 'terminal'].includes(resource.type),
  );
  const vesselResources = resources.filter(
    (resource) => resource.type === 'vessel',
  );
  const locations = new Map(
    locationResources.map((resource, index) => [resource.id, index + 1]),
  );
  const locationsByLocode = new Map(
    locationResources.flatMap((resource, index) => {
      const code = stringValue(attrs(resource).code);
      return code ? [[code, index + 1] as const] : [];
    }),
  );
  const locationByNumber = new Map(
    locationResources.map((resource, index) => [index + 1, resource]),
  );
  const facilities = new Map(
    facilityResources.map((resource, index) => [resource.id, index + 1]),
  );
  const vessels = new Map(
    vesselResources.map((resource, index) => [resource.id, index + 1]),
  );
  const ids: EventIds = {
    facilities,
    locations,
    locationsByLocode,
    vessels,
  };
  const shipmentAttributes = attrs(payload.shipment);
  const allContainerResources = payload.included.filter(
    (resource) => resource.type === 'container',
  );
  const containerResources =
    payload.requestedType === 'CT'
      ? allContainerResources.filter(
          (resource) =>
            normalizeNumber(attrs(resource).number) ===
            normalizeNumber(payload.requestedNumber),
        )
      : allContainerResources;
  const timelines = new Map<string, EventDraft[]>();
  const statuses: string[] = [];

  const containers = containerResources.map((resource) => {
    const attributes = attrs(resource);
    const eventDocument = payload.eventsByContainerId.get(resource.id);
    const eventResources = Array.isArray(eventDocument?.data)
      ? eventDocument.data
      : [];
    const timeline = buildTimeline(eventResources, ids, locationByNumber);
    timelines.set(resource.id, timeline);
    const status = seaRatesStatus(attributes.current_status, timeline);
    statuses.push(status);
    const details = equipment(attributes);
    return {
      number: stringValue(attributes.number),
      iso_code: details.isoCode,
      size_type: details.sizeType,
      status,
      is_status_from_sealine: false,
      events_mirrored: false,
      events: timeline.map(publicEvent),
    };
  });

  const allEvents = [...timelines.values()]
    .flat()
    .sort(
      (left, right) => (left.instant ?? Infinity) - (right.instant ?? Infinity),
    );
  const polEvent =
    allEvents.find(
      (event) =>
        event.code === 'DEPA' && event.status === 'VDL' && isSea(event),
    ) ||
    allEvents.find(
      (event) =>
        event.code === 'LOAD' && event.status === 'CLL' && isSea(event),
    );
  const podEvent = [...allEvents]
    .reverse()
    .find((event) => event.code === 'DISC' && event.status === 'CDD');
  const prepolEvent = allEvents.find(
    (event) =>
      ['GTIN', 'GTOT', 'PICK'].includes(event.code || '') &&
      (polEvent?.instant === null ||
        polEvent?.instant === undefined ||
        (event.instant !== null && event.instant < polEvent.instant)),
  );
  const postpodEvent = [...allEvents]
    .reverse()
    .find(
      (event) =>
        (['CDC', 'CER', 'CGO'].includes(event.status) ||
          ['GTIN', 'GTOT', 'PICK'].includes(event.code || '') ||
          /\.not_available$|\.available$/.test(event.name)) &&
        (podEvent?.instant === null ||
          podEvent?.instant === undefined ||
          (event.instant !== null && event.instant > podEvent.instant)),
    );

  const polLocationId = relatedId(payload.shipment, 'port_of_lading');
  const podLocationId = relatedId(payload.shipment, 'port_of_discharge');
  const fallbackPol = {
    actual: Boolean(shipmentAttributes.pol_atd_at),
    date: formatDate(
      shipmentAttributes.pol_atd_at || shipmentAttributes.pol_etd_at,
      stringValue(shipmentAttributes.pol_timezone),
    ),
    location: polLocationId ? (locations.get(polLocationId) ?? null) : null,
  };
  const fallbackPod = {
    actual: Boolean(shipmentAttributes.pod_ata_at),
    date: formatDate(
      shipmentAttributes.pod_ata_at || shipmentAttributes.pod_eta_at,
      stringValue(shipmentAttributes.pod_timezone),
    ),
    location: podLocationId ? (locations.get(podLocationId) ?? null) : null,
  };
  const pol = polEvent ? routePoint(polEvent) : fallbackPol;
  const pod = podEvent ? routePoint(podEvent) : fallbackPod;
  const prepol = prepolEvent
    ? routePoint(prepolEvent)
    : { actual: null, date: null, location: pol.location };
  const postpod = postpodEvent ? routePoint(postpodEvent) : { ...pod };
  const metadataStatus = statuses.includes('IN_TRANSIT')
    ? 'IN_TRANSIT'
    : statuses.length > 0 && statuses.every((status) => status === 'DELIVERED')
      ? 'DELIVERED'
      : statuses.includes('PLANNED')
        ? 'PLANNED'
        : 'UNKNOWN';

  const locationList = locationResources.map((resource) => {
    const attributes = attrs(resource);
    return {
      id: locations.get(resource.id) || 0,
      name: stringValue(attributes.name),
      state: stringValue(attributes.state_abbr),
      country: null,
      country_code: stringValue(attributes.country_code),
      locode: stringValue(attributes.code),
      lat: numberValue(attributes.latitude),
      lng: numberValue(attributes.longitude),
      timezone: stringValue(attributes.time_zone),
    };
  });
  const facilityList = facilityResources.map((resource) => {
    const attributes = attrs(resource);
    const port = byId.get(relatedId(resource, 'port') || '');
    const portAttributes = port ? attrs(port) : {};
    return {
      id: facilities.get(resource.id) || 0,
      name: stringValue(attributes.name),
      country_code: stringValue(portAttributes.country_code),
      locode: stringValue(portAttributes.code),
      bic_code: stringValue(
        attributes.bic_facility_code || attributes.bic_code,
      ),
      smdg_code: stringValue(attributes.smdg_code),
      lat: null,
      lng: null,
    };
  });
  const vesselList = vesselResources.map((resource) => {
    const attributes = attrs(resource);
    return {
      id: vessels.get(resource.id) || 0,
      name: stringValue(attributes.name),
      imo: stringValue(attributes.imo),
      call_sign: null,
      mmsi: stringValue(attributes.mmsi),
      flag: null,
    };
  });
  if (
    vesselList.length === 0 &&
    stringValue(shipmentAttributes.pod_vessel_name)
  ) {
    vesselList.push({
      id: 1,
      name: stringValue(shipmentAttributes.pod_vessel_name),
      imo: stringValue(shipmentAttributes.pod_vessel_imo),
      call_sign: null,
      mmsi: null,
      flag: null,
    });
  }

  return {
    status: 'success',
    message: 'OK',
    data: {
      metadata: {
        type: payload.requestedType,
        number: payload.requestedNumber,
        sealine: stringValue(shipmentAttributes.shipping_line_scac),
        sealine_name: stringValue(shipmentAttributes.shipping_line_name),
        status: metadataStatus,
        is_status_from_sealine: false,
        from_cache: true,
        updated_at: formatDate(
          shipmentAttributes.line_tracking_last_succeeded_at,
        ),
        cache_expires: null,
        api_calls: null,
        unique_shipments: null,
      },
      locations: locationList,
      facilities: facilityList,
      route: {
        prepol,
        pol,
        pod: {
          ...pod,
          predictive_eta: formatDate(
            shipmentAttributes.pod_eta_at,
            stringValue(shipmentAttributes.pod_timezone),
          ),
        },
        postpod,
      },
      vessels: vesselList,
      containers,
    },
  };
}

export function noTrackingInfoEnvelope(): SeaRatesEnvelope {
  return { status: 'error', message: 'NO_TRACKING_INFO', data: {} };
}

export function toContainerEnvelope(
  envelope: SeaRatesEnvelope,
): SeaRatesEnvelope {
  if (
    envelope.status !== 'success' ||
    !envelope.data ||
    typeof envelope.data !== 'object' ||
    Array.isArray(envelope.data)
  ) {
    return envelope;
  }
  const data = envelope.data;
  const containers = Array.isArray(data.containers) ? data.containers : [];
  const singular: JsonObject = {
    ...data,
    container: containers[0] ?? null,
  };
  delete singular.containers;
  return { ...envelope, data: singular };
}

export function mapShippingLines(document: JsonApiDocument): SeaRatesEnvelope {
  const resources = Array.isArray(document.data) ? document.data : [];
  return {
    status: 'success',
    message: 'OK',
    data: resources.map((resource) => {
      const attributes = attrs(resource);
      const primary = stringValue(attributes.scac);
      const alternatives = Array.isArray(attributes.alternative_scacs)
        ? attributes.alternative_scacs.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
      const scacCodes = primary
        ? [primary, ...alternatives.filter((value) => value !== primary)]
        : alternatives;
      return {
        name: stringValue(attributes.name),
        short_name: stringValue(attributes.short_name),
        active: true,
        active_types: {
          ct: attributes.container_number_tracking_support === true,
          bl: attributes.bill_of_lading_tracking_support === true,
          bk: attributes.booking_number_tracking_support === true,
          bl_ct: false,
          bk_ct: false,
        },
        maintenance: false,
        scac_codes: scacCodes,
        prefixes: scacCodes.map((scac) => scac.slice(0, 3)),
      };
    }),
  };
}
