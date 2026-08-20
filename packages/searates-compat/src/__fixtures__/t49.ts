import type { JsonApiDocument } from '../types.js';

export const shipmentFixture: JsonApiDocument = {
  data: {
    id: 'shipment-1',
    type: 'shipment',
    attributes: {
      bill_of_lading_number: 'MEDUFR030802',
      shipping_line_scac: 'MSCU',
      shipping_line_name: 'Mediterranean Shipping Company',
      port_of_lading_locode: 'FRLEH',
      port_of_discharge_locode: 'USNYC',
      pol_atd_at: '2026-08-01T10:00:00Z',
      pod_eta_at: '2026-08-20T14:00:00Z',
      line_tracking_last_succeeded_at: '2026-08-10T12:30:00Z',
      pod_vessel_name: 'EXAMPLE VESSEL',
      pod_vessel_imo: '9811000',
    },
    relationships: {
      containers: { data: [{ id: 'container-1', type: 'container' }] },
      port_of_lading: { data: { id: 'port-pol', type: 'port' } },
      port_of_discharge: { data: { id: 'port-pod', type: 'port' } },
    },
  },
  included: [
    {
      id: 'container-1',
      type: 'container',
      attributes: {
        number: 'MSCU1234567',
        equipment_type: 'dry',
        equipment_length: 40,
        equipment_height: 'high_cube',
        current_status: 'on_ship',
      },
      relationships: {
        shipment: { data: { id: 'shipment-1', type: 'shipment' } },
      },
    },
    {
      id: 'port-pol',
      type: 'port',
      attributes: {
        name: 'Le Havre',
        code: 'FRLEH',
        country_code: 'FR',
        time_zone: 'Europe/Paris',
        latitude: 49.49,
        longitude: 0.1,
      },
    },
    {
      id: 'port-pod',
      type: 'port',
      attributes: {
        name: 'New York / New Jersey',
        code: 'USNYC',
        country_code: 'US',
        time_zone: 'America/New_York',
        latitude: 40.67,
        longitude: -74.04,
      },
    },
  ],
};

export const eventsFixture: JsonApiDocument = {
  data: [
    {
      id: 'event-1',
      type: 'transport_event',
      attributes: {
        event: 'container.transport.full_in',
        timestamp: '2026-07-31T08:00:00Z',
        voyage_number: null,
        data_source: 'shipping_line',
      },
      relationships: {
        location: { data: { id: 'port-pol', type: 'port' } },
        terminal: { data: null },
        vessel: { data: null },
      },
    },
    {
      id: 'event-2',
      type: 'transport_event',
      attributes: {
        event: 'container.transport.vessel_departed',
        timestamp: '2026-08-01T10:00:00Z',
        voyage_number: '421A',
        data_source: 'shipping_line',
      },
      relationships: {
        location: { data: { id: 'port-pol', type: 'port' } },
        terminal: { data: null },
        vessel: { data: { id: 'vessel-1', type: 'vessel' } },
      },
    },
  ],
  included: [
    {
      id: 'port-pol',
      type: 'port',
      attributes: {
        name: 'Le Havre',
        code: 'FRLEH',
        country_code: 'FR',
        time_zone: 'Europe/Paris',
      },
    },
    {
      id: 'vessel-1',
      type: 'vessel',
      attributes: {
        name: 'EXAMPLE VESSEL',
        imo: '9811000',
        mmsi: '353136000',
      },
    },
  ],
};

export const shippingLinesFixture: JsonApiDocument = {
  data: [
    {
      id: 'line-1',
      type: 'shipping_line',
      attributes: {
        name: 'Mediterranean Shipping Company',
        short_name: 'MSC',
        scac: 'MSCU',
        alternative_scacs: ['MEDU'],
        bill_of_lading_tracking_support: true,
        booking_number_tracking_support: true,
        container_number_tracking_support: true,
      },
    },
  ],
};
