import { describe, expect, it } from 'vite-plus/test';
import { renderTable } from '../src/output/table.js';

describe('renderTable', () => {
  it('prints useful search columns and normalized result info', () => {
    const output = renderTable('search', [
      {
        type: 'search_result',
        id: '22f754cd-0979-45ea-9da6-f14da90ea218',
        resourceType: 'shipment',
        resourceId: 'shp-123',
        score: 0.97,
        billOfLading: 'ABC123',
        shippingLineScac: 'HLCU',
        containersCount: 2,
        origin: 'Itajai',
        destination: 'Ad Dammam',
      },
    ]);

    expect(output).toContain('Match');
    expect(output).toContain('Result Type');
    expect(output).toContain('Result ID');
    expect(output).toContain('Details');
    expect(output).toContain('Score');
    expect(output).toContain('shipment');
    expect(output).toContain('shp-123');
    expect(output).toContain('ABC123');
    expect(output).toContain('SCAC HLCU');
    expect(output).toContain('2 containers');
    expect(output).toContain('Itajai -> Ad Dammam');
    expect(output).toContain('0.97');
  });

  it('reads search results from hits envelope', () => {
    const output = renderTable('search', {
      hits: [
        {
          type: 'search_result',
          id: '22f754cd-0979-45ea-9da6-f14da90ea218',
          score: 0.74,
          requestNumber: 'HAMU4017834',
        },
      ],
    });

    expect(output).toContain('HAMU4017834');
    expect(output).toContain('0.74');
  });

  it('extracts nested search fields when top-level keys are missing', () => {
    const output = renderTable('search', {
      hits: [
        {
          type: 'search_result',
          _id: 'deep-id-1',
          data: {
            referenceNumber: 'BL987654321',
            status: 'open',
            _score: 0.91,
          },
          nested: {
            attributes: {
              title: 'Container HLCUIT1251213429',
            },
          },
        },
      ],
    });

    expect(output).toContain('0.91');
    expect(output).toContain('Container HLCUIT1251213429');
    expect(output).toContain('open');
  });

  it('does not use wrapper id as result id when result type is unknown', () => {
    const output = renderTable('search', {
      hits: [
        {
          _id: 'deep-id-2',
          type: 'search_result',
          _score: 0.55,
          reference: 'CONTAINER-2',
        },
      ],
    });

    expect(output).toContain('CONTAINER-2');
    expect(output).toContain('0.55');
    expect(output).toContain('unknown');
  });

  it('supports elasticsearch-style hit envelopes', () => {
    const output = renderTable('search', {
      hits: {
        hits: [
          {
            _id: 'es-id-100',
            _score: 0.44,
            _source: {
              type: 'search_result',
              request_number: 'REQ-9001',
              container_number: 'MSC123',
              status: 'in_transit',
              title: 'REQ-9001',
            },
          },
        ],
      },
    });

    expect(output).toContain('REQ-9001');
    expect(output).toContain('0.44');
    expect(output).toContain('in_transit');
    expect(output).toContain('unknown');
  });

  const route = {
    ports: [
      {
        sequence: 1,
        label: 'POL',
        name: 'Laem Chabang',
        countryCode: 'TH',
        inbound: { eta: null, ata: null },
        outbound: { etd: null, atd: '2025-11-08T00:44:52Z' },
      },
      {
        sequence: 2,
        label: 'TS1',
        name: 'Xiamen',
        countryCode: 'CN',
        inbound: { eta: '2025-11-20T00:00:00Z', ata: '2025-11-21T00:00:00Z' },
        outbound: { etd: '2025-11-22T00:00:00Z', atd: '2025-11-23T00:00:00Z' },
      },
      {
        sequence: 3,
        label: 'POD',
        name: 'Savannah',
        countryCode: 'US',
        inbound: { eta: '2025-12-31T05:00:00Z', ata: null },
        outbound: { etd: null, atd: null },
      },
    ],
    currentVessel: null,
    totalPorts: 3,
  };

  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [100.88, 13.08] },
        properties: { feature_type: 'port', name: 'Laem Chabang' },
      },
    ],
  };

  it.each([
    ['mapped', route],
    ['both', { raw: geojson, mapped: route }],
  ])('renders containers route ports from %s output', (_format, data) => {
    expect(renderTable('containers.route', data)).toBe(
      [
        '┌─────┬───────┬──────────────┬─────────┬──────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐',
        '│ Seq │ Label │ Port         │ Country │ Inbound ETA          │ Inbound ATA          │ Outbound ETD         │ Outbound ATD         │',
        '├─────┼───────┼──────────────┼─────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤',
        '│ 1   │ POL   │ Laem Chabang │ TH      │                      │                      │                      │ 2025-11-08T00:44:52Z │',
        '├─────┼───────┼──────────────┼─────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤',
        '│ 2   │ TS1   │ Xiamen       │ CN      │ 2025-11-20T00:00:00Z │ 2025-11-21T00:00:00Z │ 2025-11-22T00:00:00Z │ 2025-11-23T00:00:00Z │',
        '├─────┼───────┼──────────────┼─────────┼──────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤',
        '│ 3   │ POD   │ Savannah     │ US      │ 2025-12-31T05:00:00Z │                      │                      │                      │',
        '└─────┴───────┴──────────────┴─────────┴──────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘',
        '',
      ].join('\n'),
    );
  });

  it('renders the current vessel under the route ports', () => {
    const table = renderTable('containers.route', {
      ...route,
      currentVessel: {
        name: 'ZIM BANGKOK',
        imo: '9936525',
        voyage: '13E',
        coordinates: { longitude: -131.128473333, latitude: 31.023033333 },
        heading: 108,
        speed: 21,
        positionAt: '2025-12-11T11:46:03Z',
        departurePort: { locationId: null, name: null, label: null },
        arrivalPort: { locationId: null, name: null, label: null },
      },
    });
    const lines = table.split('\n');
    const title = lines.indexOf('Current vessel');
    expect(title).toBeGreaterThan(
      lines.findIndex((line) => line.includes('Savannah')),
    );
    expect(lines[title + 2]).toMatch(
      /Vessel.*IMO.*Voyage.*Latitude.*Longitude.*Heading.*Speed \(kn\).*Position At/,
    );
    expect(lines[title + 4]).toMatch(
      /ZIM BANGKOK.*9936525.*13E.*31\.023033333.*-131\.128473333.*108.*21.*2025-12-11T11:46:03Z/,
    );
  });

  it('renders raw containers route GeoJSON like containers map', () => {
    const table = renderTable('containers.route', geojson);
    expect(table).toBe(renderTable('containers.map', geojson));
    expect(table).toMatch(/│ FeatureCollection │/);
  });

  it('does not render containers map GeoJSON as route ports', () => {
    const table = renderTable('containers.map', geojson);
    expect(table).toMatch(/│ FeatureCollection │/);
    expect(table).not.toMatch(/Seq.*Label/);
  });
});

describe('terminal controls in human output', () => {
  const marker = 'safe\x1b[2J\x07\r\n\t\x7f\x85\u202evalue';
  it('encodes cells, detail keys, projected headers, and vessel headings', () => {
    for (const output of [
      renderTable('shipments.list', [{ id: marker }]),
      renderTable('shipments.get', { [marker]: marker }),
      renderTable('shipments.list', [{ [marker]: marker }], {
        fields: [marker],
      }),
      renderTable('vessels.future-positions', {
        name: marker,
        positions: [{}],
      }),
    ]) {
      expect(output).not.toMatch(/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202e]/);
      expect(output).toContain('\\u001b');
    }
  });
});
