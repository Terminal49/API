import type {
  Container,
  Route,
  Shipment,
  ShippingLine,
  TrackingRequest,
} from '../types/models.js';

function toCamelCase(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj || {})) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

function createIncludedFinder(included: any[]) {
  return (id: string, type: string) =>
    included.find((item: any) => item.id === id && item.type === type);
}

export function mapTransportEvents(doc: any) {
  const events = doc?.data || [];
  const included = doc?.included || [];
  const findIncluded = createIncludedFinder(included);

  return events.map((item: any) => {
    const evAttrs = item.attributes || {};
    const locRef = item.relationships?.location?.data;
    const termRef = item.relationships?.terminal?.data;
    const location = locRef ? findIncluded(locRef.id, 'location') : null;
    const terminal = termRef ? findIncluded(termRef.id, 'terminal') : null;
    return {
      id: item.id,
      ...toCamelCase(evAttrs),
      location: location
        ? {
            id: location.id,
            name: location.attributes?.name,
            locode: location.attributes?.locode,
          }
        : undefined,
      terminal: terminal
        ? {
            id: terminal.id,
            name: terminal.attributes?.name,
            nickname: terminal.attributes?.nickname,
            firmsCode: terminal.attributes?.firms_code,
          }
        : undefined,
    };
  });
}

export function mapRoute(doc: any): Route {
  const route = doc.data?.attributes || {};
  const relationships = doc.data?.relationships || {};
  const included = doc.included || [];

  const routeLocationRefs = relationships.route_locations?.data || [];
  const routeLocations = routeLocationRefs
    .map((ref: any) => {
      const location = included.find(
        (item: any) => item.id === ref.id && item.type === 'route_location',
      );
      if (!location) return null;

      const attrs = location.attributes || {};
      const rels = location.relationships || {};

      const portId = rels.port?.data?.id;
      const port = included.find(
        (item: any) => item.id === portId && item.type === 'port',
      );

      const inboundVesselId = rels.inbound_vessel?.data?.id;
      const outboundVesselId = rels.outbound_vessel?.data?.id;
      const inboundVessel = included.find(
        (item: any) => item.id === inboundVesselId && item.type === 'vessel',
      );
      const outboundVessel = included.find(
        (item: any) => item.id === outboundVesselId && item.type === 'vessel',
      );

      return {
        port: port
          ? {
              code: port.attributes?.code,
              name: port.attributes?.name,
              city: port.attributes?.city,
              countryCode: port.attributes?.country_code,
            }
          : null,
        inbound: {
          mode: attrs.inbound_mode,
          carrierScac: attrs.inbound_scac,
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
          carrierScac: attrs.outbound_scac,
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
    id: doc.data?.id,
    totalLegs: routeLocations.length,
    locations: routeLocations,
    createdAt: route.created_at,
    updatedAt: route.updated_at,
  };
}

export function mapShippingLines(doc: any): ShippingLine[] {
  const data = Array.isArray(doc?.data) ? doc.data : [];
  return data
    .map((item: any) => {
      const attrs = item?.attributes || {};
      const scac = attrs.scac || item?.scac;
      if (!scac) return null;
      return {
        scac,
        name: attrs.name || attrs.full_name || scac,
        shortName: attrs.short_name || attrs.nickname || undefined,
        bolPrefix: attrs.bol_prefix || undefined,
        notes: attrs.notes || undefined,
      } as ShippingLine;
    })
    .filter(Boolean) as ShippingLine[];
}

export function mapContainer(doc: any): Container {
  const attrs = doc?.data?.attributes || {};
  const attrCamel = toCamelCase(attrs);
  const relationships = doc?.data?.relationships || {};
  const included = doc?.included || [];

  const findIncluded = createIncludedFinder(included);

  const shipmentRef = relationships.shipment?.data;
  const shipmentIncluded = shipmentRef
    ? findIncluded(shipmentRef.id, 'shipment')
    : null;

  const podTerminalRef = relationships.pod_terminal?.data;
  const destinationTerminalRef = relationships.destination_terminal?.data;
  const podTerminal = podTerminalRef
    ? findIncluded(podTerminalRef.id, 'terminal')
    : null;
  const destTerminal = destinationTerminalRef
    ? findIncluded(destinationTerminalRef.id, 'terminal')
    : null;

  const transportEvents = included
    .filter((item: any) => item.type === 'transport_event')
    .map((item: any) => {
      const evAttrs = item.attributes || {};
      const locRef = item.relationships?.location?.data;
      const termRef = item.relationships?.terminal?.data;
      const location = locRef ? findIncluded(locRef.id, 'location') : null;
      const terminal = termRef ? findIncluded(termRef.id, 'terminal') : null;
      return {
        id: item.id,
        ...toCamelCase(evAttrs),
        location: location
          ? {
              id: location.id,
              name: location.attributes?.name,
              locode: location.attributes?.locode,
            }
          : undefined,
        terminal: terminal
          ? {
              id: terminal.id,
              name: terminal.attributes?.name,
              nickname: terminal.attributes?.nickname,
              firmsCode: terminal.attributes?.firms_code,
            }
          : undefined,
      };
    });

  return {
    id: doc?.data?.id,
    ...attrCamel,
    number: attrs.number || attrs.container_number,
    status: attrs.status,
    equipment: {
      type: attrs.equipment_type,
      length: attrs.equipment_length,
      height: attrs.equipment_height,
      weightLbs: attrs.weight_in_lbs,
    },
    location: {
      currentLocation: attrs.location_at_pod_terminal,
      availableForPickup: attrs.available_for_pickup,
      podArrivedAt: attrs.pod_arrived_at,
      podDischargedAt: attrs.pod_discharged_at,
    },
    demurrage: {
      pickupLfd: attrs.pickup_lfd,
      pickupAppointmentAt: attrs.pickup_appointment_at,
      fees: attrs.fees_at_pod_terminal,
      holds: attrs.holds_at_pod_terminal,
    },
    terminals: {
      podTerminal: podTerminal
        ? {
            id: podTerminal.id,
            name: podTerminal.attributes?.name,
            nickname: podTerminal.attributes?.nickname,
            firmsCode: podTerminal.attributes?.firms_code,
          }
        : null,
      destinationTerminal: destTerminal
        ? {
            id: destTerminal.id,
            name: destTerminal.attributes?.name,
            nickname: destTerminal.attributes?.nickname,
            firmsCode: destTerminal.attributes?.firms_code,
          }
        : null,
    },
    rail: {
      podRailCarrierScac: attrs.pod_rail_carrier_scac,
      indRailCarrierScac: attrs.ind_rail_carrier_scac,
      podRailLoadedAt: attrs.pod_rail_loaded_at,
      podRailDepartedAt: attrs.pod_rail_departed_at,
      indRailArrivedAt: attrs.ind_rail_arrived_at,
      indRailUnloadedAt: attrs.ind_rail_unloaded_at,
      indEtaAt: attrs.ind_eta_at,
      indAtaAt: attrs.ind_ata_at,
    },
    events: transportEvents,
    shipment: shipmentIncluded
      ? {
          id: shipmentIncluded.id,
          billOfLading:
            shipmentIncluded.attributes?.bill_of_lading_number ||
            shipmentIncluded.attributes?.bill_of_lading ||
            shipmentIncluded.attributes?.bl_number,
          shippingLineScac: shipmentIncluded.attributes?.shipping_line_scac,
        }
      : null,
  };
}

export function mapContainerList(doc: any): Container[] {
  if (!Array.isArray(doc?.data)) return [];
  return doc.data.map((item: any) =>
    mapContainer({ data: item, included: doc.included || [] }),
  );
}

export function mapShipment(doc: any): Shipment {
  const attrs = doc?.data?.attributes || {};
  const attrCamel = toCamelCase(attrs);
  const relationships = doc?.data?.relationships || {};
  const included = doc?.included || [];

  const findIncluded = createIncludedFinder(included);

  const shipment: Shipment = {
    id: doc?.data?.id,
    billOfLading:
      attrs.bill_of_lading_number ||
      attrs.bill_of_lading ||
      attrs.bl_number ||
      attrs.bill_of_lading_number,
    shippingLineScac: attrs.shipping_line_scac,
    customerName: attrs.customer_name,
    containers: [],
    ...attrCamel,
  };

  const containerRefs = relationships.containers?.data || [];
  shipment.containers = containerRefs
    .map((ref: any) => {
      const c = findIncluded(ref.id, 'container');
      if (!c) return null;
      return {
        id: c.id,
        number: c.attributes?.number || c.attributes?.container_number,
      };
    })
    .filter(Boolean) as Array<{ id: string; number?: string }>;

  shipment.refNumbers = attrs.ref_numbers;
  shipment.tags = attrs.tags;
  shipment.vesselAtPod = {
    name: attrs.pod_vessel_name,
    imo: attrs.pod_vessel_imo,
    voyageNumber: attrs.pod_voyage_number,
  };

  const portOfLadingRef = relationships.port_of_lading?.data;
  const portOfDischargeRef = relationships.port_of_discharge?.data;
  const destinationTerminalRef = relationships.destination_terminal?.data;
  const podTerminalRef = relationships.pod_terminal?.data;

  const pol = portOfLadingRef ? findIncluded(portOfLadingRef.id, 'port') : null;
  const pod = portOfDischargeRef
    ? findIncluded(portOfDischargeRef.id, 'port')
    : null;
  const destTerminal = destinationTerminalRef
    ? findIncluded(destinationTerminalRef.id, 'terminal')
    : null;
  const podTerminal = podTerminalRef
    ? findIncluded(podTerminalRef.id, 'terminal')
    : null;

  shipment.ports = {
    portOfLading: pol
      ? {
          locode: pol.attributes?.locode,
          name: pol.attributes?.name,
          code: pol.attributes?.code,
          countryCode: pol.attributes?.country_code,
          etd: attrs.pol_etd_at,
          atd: attrs.pol_atd_at,
          timezone: attrs.pol_timezone,
        }
      : null,
    portOfDischarge: pod
      ? {
          locode: pod.attributes?.locode,
          name: pod.attributes?.name,
          code: pod.attributes?.code,
          countryCode: pod.attributes?.country_code,
          eta: attrs.pod_eta_at,
          ata: attrs.pod_ata_at,
          originalEta: attrs.pod_original_eta_at,
          timezone: attrs.pod_timezone,
          terminal: podTerminal
            ? {
                id: podTerminal.id,
                name: podTerminal.attributes?.name,
                nickname: podTerminal.attributes?.nickname,
                firmsCode: podTerminal.attributes?.firms_code,
              }
            : null,
        }
      : null,
    destination: attrs.destination_locode
      ? {
          locode: attrs.destination_locode,
          name: attrs.destination_name,
          eta: attrs.destination_eta_at,
          ata: attrs.destination_ata_at,
          timezone: attrs.destination_timezone,
          terminal: destTerminal
            ? {
                id: destTerminal.id,
                name: destTerminal.attributes?.name,
                nickname: destTerminal.attributes?.nickname,
                firmsCode: destTerminal.attributes?.firms_code,
              }
            : null,
        }
      : null,
  };

  shipment.tracking = {
    lineTrackingLastAttemptedAt: attrs.line_tracking_last_attempted_at,
    lineTrackingLastSucceededAt: attrs.line_tracking_last_succeeded_at,
    lineTrackingStoppedAt: attrs.line_tracking_stopped_at,
    lineTrackingStoppedReason: attrs.line_tracking_stopped_reason,
  };

  return shipment;
}

export function mapShipmentList(doc: any): Shipment[] {
  if (!Array.isArray(doc?.data)) return [];
  return doc.data.map((item: any) =>
    mapShipment({ data: item, included: doc.included || [] }),
  );
}

export function mapTrackingRequest(doc: any): TrackingRequest {
  const attrs = doc?.data?.attributes || {};
  const relationships = doc?.data?.relationships || {};
  const included = doc?.included || [];

  const findIncluded = createIncludedFinder(included);

  const shipmentRef = relationships.shipment?.data;
  const containerRef = relationships.container?.data;

  const shipmentIncluded = shipmentRef
    ? findIncluded(shipmentRef.id, 'shipment')
    : null;
  const containerIncluded = containerRef
    ? findIncluded(containerRef.id, 'container')
    : null;

  return {
    id: doc?.data?.id,
    requestType: attrs.request_type,
    requestNumber: attrs.request_number,
    status: attrs.status,
    scac: attrs.scac,
    refNumbers: attrs.ref_numbers,
    shipment: shipmentIncluded
      ? {
          id: shipmentIncluded.id,
          billOfLading:
            shipmentIncluded.attributes?.bill_of_lading_number ||
            shipmentIncluded.attributes?.bill_of_lading ||
            shipmentIncluded.attributes?.bl_number,
          shippingLineScac: shipmentIncluded.attributes?.shipping_line_scac,
        }
      : null,
    container: containerIncluded
      ? {
          id: containerIncluded.id,
          number:
            containerIncluded.attributes?.number ||
            containerIncluded.attributes?.container_number,
          status: containerIncluded.attributes?.status,
        }
      : null,
    ...toCamelCase(attrs),
  };
}

export function mapTrackingRequestList(doc: any): TrackingRequest[] {
  if (!Array.isArray(doc?.data)) return [];
  return doc.data.map((item: any) =>
    mapTrackingRequest({ data: item, included: doc.included || [] }),
  );
}
