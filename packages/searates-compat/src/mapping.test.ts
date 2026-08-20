import { describe, expect, it } from 'vite-plus/test';
import {
  eventsFixture,
  shipmentFixture,
  shippingLinesFixture,
} from './__fixtures__/t49.js';
import { mapEvent, mapShippingLines, mapTrackingPayload } from './mapping.js';
import type { JsonApiResource, TrackingPayload } from './types.js';

describe('SeaRates response mapping', () => {
  it('matches the documented tracking envelope and event fields', () => {
    if (!shipmentFixture.data || Array.isArray(shipmentFixture.data)) {
      throw new Error('Shipment fixture must contain one resource');
    }
    const payload: TrackingPayload = {
      eventsByContainerId: new Map([['container-1', eventsFixture]]),
      shipment: shipmentFixture.data,
      included: shipmentFixture.included || [],
      requestedNumber: 'MEDUFR030802',
      requestedType: 'BL',
    };

    const result = mapTrackingPayload(payload);
    expect(result.status).toBe('success');
    expect(result.message).toBe('OK');
    expect(result.data).toMatchObject({
      metadata: {
        type: 'BL',
        number: 'MEDUFR030802',
        sealine: 'MSCU',
        status: 'IN_TRANSIT',
      },
      locations: [
        { id: 1, locode: 'FRLEH' },
        { id: 2, locode: 'USNYC' },
      ],
      route: {
        pol: { location: 1, actual: true },
        pod: { location: 2, actual: false },
      },
      containers: [
        {
          number: 'MSCU1234567',
          iso_code: '45G1',
          size_type: "40' High Cube Dry",
          events: [
            {
              event_code: 'GTIN',
              status: 'CGI',
              actual: true,
              transport_type: 'TRUCK',
            },
            {
              event_code: 'DEPA',
              status: 'VDL',
              actual: true,
              transport_type: 'VESSEL',
              voyage: '421A',
            },
          ],
        },
      ],
    });
  });

  it.each([
    ['container.transport.empty_out', 'GTOT', 'CEP'],
    ['container.transport.full_in', 'GTIN', 'CGI'],
    ['container.transport.vessel_loaded', 'LOAD', 'CLL'],
    ['container.transport.vessel_departed', 'DEPA', 'VDL'],
    ['container.transport.transshipment_arrived', 'ARRI', 'VAT'],
    ['container.transport.transshipment_discharged', 'DISC', 'CDT'],
    ['container.transport.transshipment_loaded', 'LOAD', 'CLT'],
    ['container.transport.transshipment_departed', 'DEPA', 'VDT'],
    ['container.transport.vessel_arrived', 'ARRI', 'VAD'],
    ['container.transport.full_out', 'GTOT', 'CGO'],
    ['container.transport.delivered', 'DLVY', 'CDC'],
    ['container.transport.empty_in', 'GTIN', 'CER'],
    ['container.transport.rail_departed', 'DEPA', 'LTS'],
  ])('maps %s to %s / %s', (event, code, status) => {
    const resource: JsonApiResource = {
      id: 'event',
      type: 'transport_event',
      attributes: { event, timestamp: '2026-08-01T10:00:00Z' },
    };
    expect(
      mapEvent(resource, 1, {
        facilities: new Map(),
        locations: new Map(),
        vessels: new Map(),
      }),
    ).toMatchObject({ event_code: code, status });
  });

  it('maps every public T49 shipping line instead of using a sample list', () => {
    expect(mapShippingLines(shippingLinesFixture)).toEqual({
      status: 'success',
      message: 'OK',
      data: [
        {
          name: 'Mediterranean Shipping Company',
          active: true,
          active_types: {
            ct: true,
            bl: true,
            bk: true,
            bl_ct: false,
            bk_ct: false,
          },
          maintenance: false,
          scac_codes: ['MSCU', 'MEDU'],
          prefixes: ['MSC', 'MED'],
        },
      ],
    });
  });
});
