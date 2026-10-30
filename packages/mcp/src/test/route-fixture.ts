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
      name: 'Example Route Port 1',
      country_code: 'ZZ',
      inbound: { eta: null, ata: null },
      outbound: { etd: null, atd: '2026-01-10T12:00:00Z' },
    },
    {
      sequence: 2,
      label: 'TS1',
      name: 'Example Route Port 2',
      country_code: 'ZZ',
      inbound: { eta: null, ata: '2026-01-10T12:00:00Z' },
      outbound: { etd: null, atd: '2026-01-10T12:00:00Z' },
    },
    {
      sequence: 3,
      label: 'POD',
      name: 'Example Route Port 3',
      country_code: 'ZZ',
      inbound: { eta: '2026-01-10T12:00:00Z', ata: null },
      outbound: { etd: null, atd: null },
    },
  ],
  current_vessel: {
    name: 'EXAMPLE VESSEL',
    imo: '0000001',
    voyage: 'SYNTH01',
    latitude: 25,
    longitude: 35,
    heading: 90,
    speed_knots: 12,
    position_at: '2026-01-10T12:00:00Z',
    departure_port: { name: 'Example Route Port 2', label: 'TS1' },
    arrival_port: { name: 'Example Route Port 3', label: 'POD' },
  },
};
