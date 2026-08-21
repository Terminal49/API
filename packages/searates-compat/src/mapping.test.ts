import { describe, expect, it } from 'vite-plus/test';
import { shipmentFixture, shippingLinesFixture } from './__fixtures__/t49.js';
import { mapShippingLines, mapTrackingPayload } from './mapping.js';
import type {
  JsonApiResource,
  SeaRatesEvent,
  SeaRatesEventCode,
  TrackingPayload,
  TrackingType,
} from './types.js';

const CLOSED_CODES = new Set<SeaRatesEventCode>([
  'ARRI',
  'CONF',
  'CUSI',
  'CUSR',
  'DEPA',
  'DISC',
  'GTIN',
  'GTOT',
  'INSP',
  'ISSU',
  'LOAD',
  'PICK',
  'RECE',
  'RELS',
  'STRP',
  'STUF',
]);

function event(
  id: string,
  name: string,
  timestamp: string,
  location = 'port-pol',
): JsonApiResource {
  const sea = /vessel|transshipment|feeder/.test(name);
  return {
    id,
    type: 'transport_event',
    attributes: {
      event: name,
      timestamp,
      timezone: location === 'port-pol' ? 'Europe/Paris' : 'America/New_York',
      voyage_number: sea ? `V-${id}` : null,
    },
    relationships: {
      location: { data: { id: location, type: 'port' } },
      terminal: { data: null },
      vessel: sea
        ? { data: { id: 'vessel-1', type: 'vessel' } }
        : { data: null },
    },
  };
}

function payload(
  eventResources: JsonApiResource[],
  currentStatus = 'on_ship',
  requestedType: TrackingType = 'BL',
  requestedNumber = 'MEDUFR030802',
  equipmentType = 'dry',
): TrackingPayload {
  if (!shipmentFixture.data || Array.isArray(shipmentFixture.data)) {
    throw new Error('Shipment fixture must contain one resource');
  }
  const included = (shipmentFixture.included || []).map((resource) =>
    resource.type === 'container'
      ? {
          ...resource,
          attributes: {
            ...resource.attributes,
            current_status: currentStatus,
            equipment_type: equipmentType,
          },
        }
      : resource,
  );
  return {
    eventsByContainerId: new Map([
      [
        'container-1',
        {
          data: eventResources,
          included: [
            {
              id: 'vessel-1',
              type: 'vessel',
              attributes: {
                name: 'EXAMPLE VESSEL',
                imo: '9811000',
              },
            },
          ],
        },
      ],
    ]),
    shipment: shipmentFixture.data,
    included,
    requestedNumber,
    requestedType,
  };
}

function responseData(result: ReturnType<typeof mapTrackingPayload>) {
  if (
    !result.data ||
    typeof result.data !== 'object' ||
    Array.isArray(result.data)
  ) {
    throw new Error('Expected SeaRates response data object');
  }
  return result.data;
}

function eventsFrom(
  result: ReturnType<typeof mapTrackingPayload>,
): SeaRatesEvent[] {
  const data = responseData(result);
  const containers = data.containers;
  if (!Array.isArray(containers) || !containers[0]) {
    throw new Error('Expected one mapped container');
  }
  const container = containers[0];
  if (
    !container ||
    typeof container !== 'object' ||
    Array.isArray(container) ||
    !Array.isArray(container.events)
  ) {
    throw new Error('Expected mapped event array');
  }
  // SAFETY: Every event is produced by mapTrackingPayload and the shape above
  // verifies that this value is the mapped event array.
  return container.events as SeaRatesEvent[];
}

describe('SeaRates positional event mapping', () => {
  it('maps first and later sea loads to CLL and CLT', () => {
    const result = mapTrackingPayload(
      payload([
        event(
          'load-1',
          'container.transport.vessel_loaded',
          '2026-08-01T10:00:00Z',
        ),
        event(
          'load-2',
          'container.transport.transshipment_loaded',
          '2026-08-05T10:00:00Z',
          'port-pod',
        ),
      ]),
    );
    expect(
      eventsFrom(result)
        .filter((item) => item.event_code === 'LOAD')
        .map((item) => item.status),
    ).toEqual(['CLL', 'CLT']);
  });

  it('folds duplicate first loads before assigning ordinal milestones', () => {
    const result = mapTrackingPayload(
      payload([
        event(
          'load-copy-1',
          'container.transport.vessel_loaded',
          '2026-08-01T10:00:00Z',
        ),
        event(
          'load-copy-2',
          'container.transport.vessel_loaded',
          '2026-08-01T10:00:00Z',
        ),
      ]),
    );
    expect(
      eventsFrom(result).filter((item) => item.event_code === 'LOAD'),
    ).toMatchObject([{ status: 'CLL' }]);
  });

  it('does not promote a hub load to origin when the timeline starts mid-journey', () => {
    const result = mapTrackingPayload(
      payload([
        event(
          'hub-arrival',
          'container.transport.transshipment_arrived',
          '2026-08-04T10:00:00Z',
          'port-pod',
        ),
        event(
          'hub-discharge',
          'container.transport.transshipment_discharged',
          '2026-08-04T12:00:00Z',
          'port-pod',
        ),
        event(
          'hub-load',
          'container.transport.transshipment_loaded',
          '2026-08-05T10:00:00Z',
          'port-pod',
        ),
      ]),
    );
    expect(
      eventsFrom(result).find((item) => item.event_code === 'LOAD'),
    ).toMatchObject({ status: 'CLT' });
    expect(responseData(result).route).toMatchObject({
      pol: { date: '2026-08-01 10:00:00', location: 1 },
    });
  });

  it('maps hub and last sea arrivals to VAT and VAD by order', () => {
    const result = mapTrackingPayload(
      payload([
        event(
          'depart-1',
          'container.transport.vessel_departed',
          '2026-08-01T10:00:00Z',
        ),
        event(
          'arrive-1',
          'container.transport.transshipment_arrived',
          '2026-08-05T10:00:00Z',
          'port-pod',
        ),
        event(
          'depart-2',
          'container.transport.transshipment_departed',
          '2026-08-06T10:00:00Z',
          'port-pod',
        ),
        event(
          'arrive-2',
          'container.transport.vessel_arrived',
          '2026-08-10T10:00:00Z',
          'port-pod',
        ),
      ]),
    );
    expect(
      eventsFrom(result)
        .filter((item) => item.event_code === 'ARRI')
        .map((item) => item.status),
    ).toEqual(['VAT', 'VAD']);
  });

  it('maps hub and final discharges to CDT and CDD by onward sailing', () => {
    const result = mapTrackingPayload(
      payload([
        event(
          'disc-1',
          'container.transport.transshipment_discharged',
          '2026-08-05T10:00:00Z',
          'port-pod',
        ),
        event(
          'load-2',
          'container.transport.transshipment_loaded',
          '2026-08-06T10:00:00Z',
          'port-pod',
        ),
        event(
          'depart-2',
          'container.transport.transshipment_departed',
          '2026-08-07T10:00:00Z',
          'port-pod',
        ),
        event(
          'disc-2',
          'container.transport.vessel_discharged',
          '2026-08-10T10:00:00Z',
          'port-pod',
        ),
      ]),
    );
    expect(
      eventsFrom(result)
        .filter((item) => item.event_code === 'DISC')
        .map((item) => item.status),
    ).toEqual(['CDT', 'CDD']);
  });

  it('uses cargo state for empty and laden gate-out milestones', () => {
    const result = mapTrackingPayload(
      payload([
        event(
          'empty-out',
          'container.transport.empty_out',
          '2026-07-30T10:00:00Z',
        ),
        event(
          'disc',
          'container.transport.vessel_discharged',
          '2026-08-10T10:00:00Z',
          'port-pod',
        ),
        event(
          'full-out',
          'container.transport.full_out',
          '2026-08-11T10:00:00Z',
          'port-pod',
        ),
      ]),
    );
    expect(
      eventsFrom(result)
        .filter((item) => item.event_code === 'GTOT')
        .map((item) => item.status),
    ).toEqual(['CEP', 'CGO']);
  });

  it('keeps availability and delivered rows without inventing event codes', () => {
    const result = mapTrackingPayload(
      payload([
        event(
          'available',
          'container.transport.available',
          '2026-08-10T10:00:00Z',
          'port-pod',
        ),
        event(
          'delivered',
          'container.transport.delivered',
          '2026-08-11T10:00:00Z',
          'port-pod',
        ),
      ]),
    );
    expect(eventsFrom(result)).toMatchObject([
      { event_code: null, status: 'UNKN' },
      { event_code: null, status: 'CDC' },
    ]);
    expect(
      eventsFrom(result).every(
        (item) => item.event_code === null || CLOSED_CODES.has(item.event_code),
      ),
    ).toBe(true);
  });

  it('keeps inland events as LTS with no vessel reference', () => {
    const result = mapTrackingPayload(
      payload([
        event(
          'rail-load',
          'container.transport.rail_loaded',
          '2026-08-11T10:00:00Z',
          'port-pod',
        ),
        event(
          'rail-depart',
          'container.transport.rail_departed',
          '2026-08-11T12:00:00Z',
          'port-pod',
        ),
      ]),
    );
    expect(eventsFrom(result)).toMatchObject([
      { status: 'LTS', transport_type: 'RAIL', type: 'land', vessel: null },
      { status: 'LTS', transport_type: 'RAIL', type: 'land', vessel: null },
    ]);
  });

  it('anchors prepol on an earlier gate instead of cloning pol', () => {
    const result = mapTrackingPayload(
      payload([
        event('gate', 'container.transport.full_in', '2026-07-30T10:00:00Z'),
        event(
          'load',
          'container.transport.vessel_loaded',
          '2026-07-31T10:00:00Z',
        ),
        event(
          'depart',
          'container.transport.vessel_departed',
          '2026-08-01T10:00:00Z',
        ),
      ]),
    );
    expect(responseData(result).route).toMatchObject({
      prepol: { date: '2026-07-30 12:00:00' },
      pol: { date: '2026-08-01 12:00:00' },
    });
  });

  it('keeps picked_up and active rail states in transit', () => {
    for (const status of [
      'picked_up',
      'grounded',
      'on_rail',
      'off_dock',
      'dropped',
      'loaded',
    ]) {
      const result = mapTrackingPayload(payload([], status));
      expect(responseData(result).metadata).toMatchObject({
        status: 'IN_TRANSIT',
      });
    }
  });

  it('echoes the requested CT number and maps public equipment enum values', () => {
    const result = mapTrackingPayload(
      payload([], 'new', 'CT', 'MSCU1234567', 'open top'),
    );
    expect(responseData(result)).toMatchObject({
      metadata: {
        type: 'CT',
        number: 'MSCU1234567',
        status: 'PLANNED',
      },
      containers: [
        {
          iso_code: '45U1',
          size_type: "40' High Cube Open Top",
        },
      ],
    });
  });

  it('selects the requested container rather than the first shipment sibling', () => {
    const trackingPayload = payload([], 'picked_up', 'CT', 'MSCU1234567');
    trackingPayload.included = [
      {
        id: 'sibling',
        type: 'container',
        attributes: {
          number: 'TCLU7654321',
          current_status: 'on_ship',
        },
      },
      ...trackingPayload.included,
    ];
    expect(responseData(mapTrackingPayload(trackingPayload))).toMatchObject({
      containers: [{ number: 'MSCU1234567' }],
    });
  });

  it('formats offset timestamps in the official SeaRates date shape', () => {
    const result = mapTrackingPayload(
      payload([
        {
          ...event(
            'depart',
            'container.transport.vessel_departed',
            '2026-08-01T10:00:00-07:00',
          ),
          attributes: {
            event: 'container.transport.vessel_departed',
            timestamp: '2026-08-01T10:00:00-07:00',
          },
          relationships: {
            location: { data: null },
            terminal: { data: null },
            vessel: { data: { id: 'vessel-1', type: 'vessel' } },
          },
        },
      ]),
    );
    expect(eventsFrom(result)[0]).toMatchObject({
      date: '2026-08-01 10:00:00',
    });
  });
});

describe('SeaRates shipping line mapping', () => {
  it('maps every public T49 shipping line instead of using a sample list', () => {
    expect(mapShippingLines(shippingLinesFixture)).toEqual({
      status: 'success',
      message: 'OK',
      data: [
        {
          name: 'Mediterranean Shipping Company',
          short_name: 'MSC',
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
