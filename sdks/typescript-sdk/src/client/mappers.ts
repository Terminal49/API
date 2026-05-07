import { JsonApiDocument } from './jsonapi.js';
import type {
  Container,
  Route,
  Shipment,
  ShippingLine,
  TrackingRequest,
} from '../types/models.js';

export function mapTransportEvents(doc: any) {
  const apiDoc = new JsonApiDocument(doc);
  const events = Array.isArray(apiDoc.data) ? apiDoc.data : [];

  return events.map((item: any) => {
    const attributes = apiDoc.getAttributes(item);
    const location = apiDoc.getRelationship(item, 'location');
    const terminal = apiDoc.getRelationship(item, 'terminal');

    return {
      id: item.id,
      ...attributes,
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
  const apiDoc = new JsonApiDocument(doc);
  const route = apiDoc.getAttributes(apiDoc.data, false);
  const routeLocations = apiDoc.getRelationship(apiDoc.data, 'route_locations') || [];

  const locations = (Array.isArray(routeLocations) ? routeLocations : [routeLocations])
    .map((location: any) => {
      if (!location) return null;

      const attrs = location.attributes || {};
      const port = apiDoc.getRelationship(location, 'port');
      const inboundVessel = apiDoc.getRelationship(location, 'inbound_vessel');
      const outboundVessel = apiDoc.getRelationship(location, 'outbound_vessel');

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
    id: apiDoc.data?.id,
    totalLegs: locations.length,
    locations: locations as any,
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
  const apiDoc = new JsonApiDocument(doc);
  const data = apiDoc.data;
  const attrs = data?.attributes || {};
  const attrCamel = apiDoc.getAttributes(data);

  const shipment = apiDoc.getRelationship(data, 'shipment');
  const podTerminal = apiDoc.getRelationship(data, 'pod_terminal');
  const destTerminal = apiDoc.getRelationship(data, 'destination_terminal');

  const transportEvents = apiDoc.included
    .filter((item: any) => item.type === 'transport_event')
    .map((item: any) => {
      const attributes = apiDoc.getAttributes(item);
      const location = apiDoc.getRelationship(item, 'location');
      const terminal = apiDoc.getRelationship(item, 'terminal');
      return {
        id: item.id,
        ...attributes,
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
    id: data?.id,
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
    shipment: shipment
      ? {
          id: shipment.id,
          billOfLading:
            shipment.attributes?.bill_of_lading_number ||
            shipment.attributes?.bill_of_lading ||
            shipment.attributes?.bl_number,
          shippingLineScac: shipment.attributes?.shipping_line_scac,
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
  const apiDoc = new JsonApiDocument(doc);
  const data = apiDoc.data;
  const attrs = data?.attributes || {};
  const attrCamel = apiDoc.getAttributes(data);

  const shipment: Shipment = {
    id: data?.id,
    billOfLading:
      attrs.bill_of_lading_number ||
      attrs.bill_of_lading ||
      attrs.bl_number,
    shippingLineScac: attrs.shipping_line_scac,
    customerName: attrs.customer_name,
    containers: [],
    ...attrCamel,
  };

  const containerRelationships = apiDoc.getRelationship(data, 'containers');
  const containers = Array.isArray(containerRelationships)
    ? containerRelationships
    : containerRelationships
      ? [containerRelationships]
      : [];

  shipment.containers = containers
    .map((c: any) => {
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

  const pol = apiDoc.getRelationship(data, 'port_of_lading');
  const pod = apiDoc.getRelationship(data, 'port_of_discharge');
  const destTerminal = apiDoc.getRelationship(data, 'destination_terminal');
  const podTerminal = apiDoc.getRelationship(data, 'pod_terminal');

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
  const apiDoc = new JsonApiDocument(doc);
  const data = apiDoc.data;
  const attrs = data?.attributes || {};

  const shipment = apiDoc.getRelationship(data, 'shipment');
  const container = apiDoc.getRelationship(data, 'container');

  return {
    id: data?.id,
    requestType: attrs.request_type,
    requestNumber: attrs.request_number,
    status: attrs.status,
    scac: attrs.scac,
    refNumbers: attrs.ref_numbers,
    shipment: shipment
      ? {
          id: shipment.id,
          billOfLading:
            shipment.attributes?.bill_of_lading_number ||
            shipment.attributes?.bill_of_lading ||
            shipment.attributes?.bl_number,
          shippingLineScac: shipment.attributes?.shipping_line_scac,
        }
      : null,
    container: container
      ? {
          id: container.id,
          number:
            container.attributes?.number ||
            container.attributes?.container_number,
          status: container.attributes?.status,
        }
      : null,
    ...apiDoc.getAttributes(data),
  };
}

export function mapTrackingRequestList(doc: any): TrackingRequest[] {
  if (!Array.isArray(doc?.data)) return [];
  return doc.data.map((item: any) =>
    mapTrackingRequest({ data: item, included: doc.included || [] }),
  );
}
