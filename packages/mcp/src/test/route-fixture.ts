import { readFileSync } from 'node:fs';
import type { RouteSummary } from '../tools/get-container-route.js';

export const routeFixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../sdks/typescript-sdk/src/fixtures/containers.map_geojson.json',
      import.meta.url,
    ),
    'utf8',
  ),
);

export const EXPECTED_ROUTE_SUMMARY: RouteSummary = {
  total_ports: 3,
  ports: [
    {
      sequence: 1,
      label: 'POL',
      name: 'Laem Chabang',
      country_code: 'TH',
      inbound: { eta: null, ata: null },
      outbound: { etd: null, atd: '2025-11-08T00:44:52Z' },
    },
    {
      sequence: 2,
      label: 'TS1',
      name: 'Xiamen',
      country_code: 'CN',
      inbound: { eta: null, ata: '2025-11-15T16:00:00Z' },
      outbound: { etd: null, atd: '2025-11-19T16:00:00Z' },
    },
    {
      sequence: 3,
      label: 'POD',
      name: 'Savannah',
      country_code: 'US',
      inbound: { eta: '2025-12-31T05:00:00Z', ata: null },
      outbound: { etd: null, atd: null },
    },
  ],
  current_vessel: {
    name: 'ZIM BANGKOK',
    imo: '9936525',
    voyage: '13E',
    latitude: 31.023033333,
    longitude: -131.128473333,
    heading: 108,
    speed_knots: 21,
    departure_port: { name: 'Xiamen', label: 'TS1' },
    arrival_port: { name: 'Savannah', label: 'POD' },
  },
};
