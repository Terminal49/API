import type {
  JsonApiDocument,
  JsonApiResource,
  JsonObject,
  SeaRatesEnvelope,
  SeaRatesEvent,
  TrackingPayload,
  TrackingType,
} from './types.js';

interface EventMapping {
  code: string;
  description: string;
  eventType: 'EQUIPMENT' | 'TRANSPORT';
  status: string;
  transport: 'BARGE' | 'RAIL' | 'TRUCK' | 'VESSEL';
}

const EVENT_MAPPINGS: Record<string, EventMapping> = {
  'container.transport.empty_out': {
    code: 'GTOT',
    description: 'Empty Picked-up at Depot',
    eventType: 'EQUIPMENT',
    status: 'CEP',
    transport: 'TRUCK',
  },
  'container.transport.full_in': {
    code: 'GTIN',
    description: 'Gate in at Port terminal',
    eventType: 'EQUIPMENT',
    status: 'CGI',
    transport: 'TRUCK',
  },
  'container.transport.vessel_loaded': {
    code: 'LOAD',
    description: 'Loaded on board',
    eventType: 'EQUIPMENT',
    status: 'CLL',
    transport: 'VESSEL',
  },
  'container.transport.vessel_departed': {
    code: 'DEPA',
    description: 'Vessel Departure',
    eventType: 'TRANSPORT',
    status: 'VDL',
    transport: 'VESSEL',
  },
  'container.transport.vessel_arrived': {
    code: 'ARRI',
    description: 'Vessel Arrival',
    eventType: 'TRANSPORT',
    status: 'VAD',
    transport: 'VESSEL',
  },
  'container.transport.vessel_discharged': {
    code: 'DISC',
    description: 'Discharged from vessel',
    eventType: 'EQUIPMENT',
    status: 'CDD',
    transport: 'VESSEL',
  },
  'container.transport.transshipment_arrived': {
    code: 'ARRI',
    description: 'Vessel Arrival at transshipment port',
    eventType: 'TRANSPORT',
    status: 'VAT',
    transport: 'VESSEL',
  },
  'container.transport.transshipment_discharged': {
    code: 'DISC',
    description: 'Discharged in transshipment',
    eventType: 'EQUIPMENT',
    status: 'CDT',
    transport: 'VESSEL',
  },
  'container.transport.transshipment_loaded': {
    code: 'LOAD',
    description: 'Loaded at transshipment port',
    eventType: 'EQUIPMENT',
    status: 'CLT',
    transport: 'VESSEL',
  },
  'container.transport.transshipment_departed': {
    code: 'DEPA',
    description: 'Vessel Departure from transshipment port',
    eventType: 'TRANSPORT',
    status: 'VDT',
    transport: 'VESSEL',
  },
  'container.transport.full_out': {
    code: 'GTOT',
    description: 'Gate out from final port',
    eventType: 'EQUIPMENT',
    status: 'CGO',
    transport: 'TRUCK',
  },
  'container.transport.delivered': {
    code: 'DLVY',
    description: 'Container delivered to consignee',
    eventType: 'EQUIPMENT',
    status: 'CDC',
    transport: 'TRUCK',
  },
  'container.transport.empty_in': {
    code: 'GTIN',
    description: 'Empty container returned to depot',
    eventType: 'EQUIPMENT',
    status: 'CER',
    transport: 'TRUCK',
  },
  'container.transport.rail_loaded': {
    code: 'LOAD',
    description: 'Loaded on rail',
    eventType: 'EQUIPMENT',
    status: 'LTS',
    transport: 'RAIL',
  },
  'container.transport.rail_departed': {
    code: 'DEPA',
    description: 'Rail departure',
    eventType: 'TRANSPORT',
    status: 'LTS',
    transport: 'RAIL',
  },
  'container.transport.rail_arrived': {
    code: 'ARRI',
    description: 'Rail arrival',
    eventType: 'TRANSPORT',
    status: 'LTS',
    transport: 'RAIL',
  },
  'container.transport.rail_unloaded': {
    code: 'DISC',
    description: 'Discharged from rail',
    eventType: 'EQUIPMENT',
    status: 'LTS',
    transport: 'RAIL',
  },
};

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

function formatDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  return value.replace('T', ' ').replace(/(?:\.\d+)?Z$/, '');
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function resourceIndex(
  resources: JsonApiResource[],
): Map<string, JsonApiResource> {
  return new Map(resources.map((resource) => [resource.id, resource]));
}

function equipment(attributes: JsonObject): {
  isoCode: string | null;
  sizeType: string | null;
} {
  const length = numberValue(attributes.equipment_length);
  const height = stringValue(attributes.equipment_height);
  const type = stringValue(attributes.equipment_type);
  if (!length || !height || !type) return { isoCode: null, sizeType: null };

  const first = length === 20 ? '2' : length === 40 ? '4' : 'L';
  const second = height === 'high_cube' ? '5' : '2';
  const typeCode: Record<string, string> = {
    dry: 'G1',
    flat_rack: 'P1',
    hard_top: 'U1',
    open_top: 'U1',
    reefer: 'R1',
    tank: 'T1',
  };
  const label: Record<string, string> = {
    dry: 'Dry',
    flat_rack: 'Flat Rack',
    hard_top: 'Hard Top',
    open_top: 'Open Top',
    reefer: 'Reefer',
    tank: 'Tank',
  };
  const heightLabel = height === 'high_cube' ? ' High Cube' : '';
  return {
    isoCode: typeCode[type] ? `${first}${second}${typeCode[type]}` : null,
    sizeType: `${length}'${heightLabel} ${label[type] || type}`,
  };
}

function seaRatesStatus(value: unknown): string {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (['delivered', 'empty_returned', 'picked_up'].includes(value)) {
    return 'COMPLETED';
  }
  if (
    [
      'available',
      'awaiting_inland_transfer',
      'in_transit',
      'not_available',
      'on_ship',
    ].includes(value)
  ) {
    return 'IN_TRANSIT';
  }
  return 'UNKNOWN';
}

function defaultType(number: string, type?: TrackingType): TrackingType {
  return type || (/^[A-Z]{4}\d{7}$/.test(number) ? 'CT' : 'BL');
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
    if (!existing || Object.keys(attrs(resource)).length > 0) {
      unique.set(key, resource);
    }
  }
  return [...unique.values()];
}

export function mapEvent(
  resource: JsonApiResource,
  orderId: number,
  ids: {
    facilities: Map<string, number>;
    locations: Map<string, number>;
    vessels: Map<string, number>;
  },
): SeaRatesEvent | null {
  const attributes = attrs(resource);
  const eventName = stringValue(attributes.event);
  if (!eventName) return null;
  const normalizedName = eventName.replace('.estimated.', '.');
  const mapping = EVENT_MAPPINGS[normalizedName];
  if (!mapping) return null;
  const estimated = eventName.includes('.estimated.');
  const locationId = relatedId(resource, 'location');
  const facilityId = relatedId(resource, 'terminal');
  const vesselId = relatedId(resource, 'vessel');
  return {
    actual: !estimated,
    date: formatDate(attributes.timestamp),
    description: mapping.description,
    event_type: mapping.eventType,
    event_code: mapping.code,
    status: mapping.status,
    facility: facilityId ? (ids.facilities.get(facilityId) ?? null) : null,
    is_additional_event: false,
    is_date_from_sealine: attributes.data_source === 'shipping_line',
    location: locationId ? (ids.locations.get(locationId) ?? null) : null,
    order_id: orderId,
    transport_type: mapping.transport,
    type: mapping.transport === 'VESSEL' ? 'sea' : 'land',
    vessel: vesselId ? (ids.vessels.get(vesselId) ?? null) : null,
    voyage: stringValue(attributes.voyage_number),
  };
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
  const facilities = new Map(
    facilityResources.map((resource, index) => [resource.id, index + 1]),
  );
  const vessels = new Map(
    vesselResources.map((resource, index) => [resource.id, index + 1]),
  );
  const shipmentAttributes = attrs(payload.shipment);
  const containerResources = payload.included.filter(
    (resource) => resource.type === 'container',
  );
  const containerStatuses = containerResources.map((resource) =>
    seaRatesStatus(attrs(resource).current_status),
  );
  const overallStatus = containerStatuses.includes('IN_TRANSIT')
    ? 'IN_TRANSIT'
    : containerStatuses.includes('COMPLETED')
      ? 'COMPLETED'
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

  const containers = containerResources.map((resource) => {
    const attributes = attrs(resource);
    const eventDocument = payload.eventsByContainerId.get(resource.id);
    const eventResources = Array.isArray(eventDocument?.data)
      ? eventDocument.data
      : [];
    const events = eventResources
      .map((event, index) =>
        mapEvent(event, index + 1, { facilities, locations, vessels }),
      )
      .filter((event): event is SeaRatesEvent => event !== null)
      .sort((left, right) => (left.date || '').localeCompare(right.date || ''))
      .map((event, index) => ({ ...event, order_id: index + 1 }));
    const equipmentDetails = equipment(attributes);
    return {
      number: stringValue(attributes.number),
      iso_code: equipmentDetails.isoCode,
      size_type: equipmentDetails.sizeType,
      status: seaRatesStatus(attributes.current_status),
      is_status_from_sealine: true,
      events_mirrored: false,
      events,
    };
  });

  const polId = relatedId(payload.shipment, 'port_of_lading');
  const podId = relatedId(payload.shipment, 'port_of_discharge');
  const destinationId = relatedId(payload.shipment, 'destination');

  return {
    status: 'success',
    message: 'OK',
    data: {
      metadata: {
        type: payload.requestedType,
        number:
          stringValue(shipmentAttributes.bill_of_lading_number) ||
          payload.requestedNumber,
        sealine: stringValue(shipmentAttributes.shipping_line_scac),
        sealine_name: stringValue(shipmentAttributes.shipping_line_name),
        status: overallStatus,
        is_status_from_sealine: true,
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
        prepol: {
          location: polId ? (locations.get(polId) ?? null) : null,
          date: formatDate(
            shipmentAttributes.pol_atd_at || shipmentAttributes.pol_etd_at,
          ),
          actual: Boolean(shipmentAttributes.pol_atd_at),
        },
        pol: {
          location: polId ? (locations.get(polId) ?? null) : null,
          date: formatDate(
            shipmentAttributes.pol_atd_at || shipmentAttributes.pol_etd_at,
          ),
          actual: Boolean(shipmentAttributes.pol_atd_at),
        },
        pod: {
          location: podId ? (locations.get(podId) ?? null) : null,
          date: formatDate(
            shipmentAttributes.pod_ata_at || shipmentAttributes.pod_eta_at,
          ),
          actual: Boolean(shipmentAttributes.pod_ata_at),
          predictive_eta: null,
        },
        postpod: {
          location: destinationId
            ? (locations.get(destinationId) ?? null)
            : null,
          date: formatDate(
            shipmentAttributes.destination_ata_at ||
              shipmentAttributes.destination_eta_at,
          ),
          actual: shipmentAttributes.destination_ata_at
            ? true
            : shipmentAttributes.destination_eta_at
              ? false
              : null,
        },
      },
      vessels: vesselList,
      containers,
    },
  };
}

export function pendingEnvelope(
  number: string,
  type?: TrackingType,
  sealine?: string,
): SeaRatesEnvelope {
  return {
    status: 'success',
    message: 'PENDING',
    data: {
      metadata: {
        type: defaultType(number, type),
        number,
        sealine: sealine || null,
        sealine_name: null,
        status: 'UNKNOWN',
        is_status_from_sealine: false,
        from_cache: false,
        updated_at: null,
        cache_expires: null,
        api_calls: null,
        unique_shipments: null,
      },
      locations: [],
      facilities: [],
      route: {
        prepol: { location: null, date: null, actual: null },
        pol: { location: null, date: null, actual: null },
        pod: {
          location: null,
          date: null,
          actual: null,
          predictive_eta: null,
        },
        postpod: { location: null, date: null, actual: null },
      },
      vessels: [],
      containers: [],
    },
  };
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
