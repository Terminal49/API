import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtures } from '../../typescript-sdk/scripts/generate-fixtures.mjs';
import {
  mapContainer,
  mapContainerList,
  mapContainerRoute,
  mapShipment,
  mapShipmentList,
  mapShippingLines,
  mapTrackingRequest,
  mapTrackingRequestList,
  mapTransportEvents,
} from '../../typescript-sdk/src/client/mappers.ts';
import { renderTable } from '../src/output/table.ts';

const sdk = buildFixtures();
const container = sdk['containers.get.include'].data;
const containerAttributes = container.attributes;
const root = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const ok = (data) => ({ ok: true, data });
const resource = (type, id, attributes) => ({ type, id, attributes });
const party = resource('party', 'party-1', {
  company_name: 'Example Fixture Partner',
  email: 'partner@example.test',
});
const definition = resource(
  'custom_field_definition',
  'custom_field_definition-1',
  {
    entity_type: 'shipment',
    api_slug: 'example_reference',
    display_name: 'Example reference',
    data_type: 'text',
  },
);
const search = [
  {
    type: 'shipment',
    id: 'shipment-1',
    attributes: {
      number: 'SYNTHBOL000001',
      bill_of_lading_number: 'SYNTHBOL000001',
      shipping_line_scac: 'SYNU',
      scac: 'SYNU',
      customer_name: 'Example Fixture Shipper',
      status: 'in_transit',
    },
  },
];
const error = (code, message) => ({ ok: false, error: { code, message } });
const fixtures = {
  'shipments.list': ok(mapShipmentList(sdk['shipments.list'])),
  'shipments.get': ok(mapShipment(sdk['shipments.get.include'])),
  'containers.list': ok(mapContainerList(sdk['containers.list'])),
  'containers.get': ok(mapContainer(sdk['containers.get.include'])),
  'containers.events': ok(mapTransportEvents(sdk['containers.events'])),
  'containers.raw-events': ok(sdk['containers.raw-events']),
  'containers.demurrage': ok({
    container_id: container.id,
    pickup_lfd: containerAttributes.pickup_lfd,
    pickup_appointment_at: containerAttributes.pickup_appointment_at,
    available_for_pickup: containerAttributes.available_for_pickup,
    fees_at_pod_terminal: containerAttributes.fees_at_pod_terminal,
    holds_at_pod_terminal: containerAttributes.holds_at_pod_terminal,
    pod_arrived_at: containerAttributes.pod_arrived_at,
    pod_discharged_at: containerAttributes.pod_discharged_at,
  }),
  'containers.rail': ok({
    container_id: container.id,
    pod_rail_carrier_scac: containerAttributes.pod_rail_carrier_scac,
    ind_rail_carrier_scac: containerAttributes.ind_rail_carrier_scac,
    pod_rail_loaded_at: containerAttributes.pod_rail_loaded_at,
    pod_rail_departed_at: containerAttributes.pod_rail_departed_at,
    ind_rail_arrived_at: containerAttributes.ind_rail_arrived_at,
    ind_rail_unloaded_at: containerAttributes.ind_rail_unloaded_at,
    ind_eta_at: containerAttributes.ind_eta_at,
    ind_ata_at: containerAttributes.ind_ata_at,
    rail_events: [],
  }),
  'containers.route': ok(mapContainerRoute(sdk['containers.map_geojson'])),
  'containers.map.error': error('UPSTREAM_ERROR', 'Synthetic map unavailable'),
  'tracking-requests.list': ok(
    mapTrackingRequestList(sdk['tracking-requests.list']),
  ),
  'tracking-requests.get': ok(
    mapTrackingRequest(sdk['tracking-requests.get.base']),
  ),
  'shipping-lines.list': ok(mapShippingLines(sdk['shipping-lines.list'])),
  'ports.get': ok(sdk['ports.get']),
  'terminals.get': ok(sdk['terminals.get']),
  'vessels.get-by-imo': ok({
    id: 'vessel-1',
    name: 'EXAMPLE VESSEL',
    imo: '0000001',
  }),
  'parties.list': ok([party]),
  'parties.get': ok({ data: party }),
  'custom-field-definitions.list': ok([definition]),
  'custom-field-definitions.get': ok({ data: definition }),
  'custom-field-options.list': ok([
    resource('custom_field_option', 'custom_field_option-1', {
      value: 'Example option',
    }),
  ]),
  'custom-fields.list.error': error(
    'UPSTREAM_ERROR',
    'Synthetic custom fields unavailable',
  ),
  'webhooks.list': ok([
    resource('webhook', 'webhook-1', {
      url: 'https://webhooks.example.test/events',
      active: true,
    }),
  ]),
  'webhooks.ips': ok(['192.0.2.1', '2001:db8::1']),
  'webhook-notifications.list': ok([
    resource('webhook_notification', 'webhook_notification-1', {
      event: 'container.transport.vessel_arrived',
      status: 'delivered',
      url: 'https://webhooks.example.test/events',
    }),
  ]),
  'webhook-notifications.examples.error': error(
    'VALIDATION_ERROR',
    'Synthetic invalid webhook event',
  ),
  ...Object.fromEntries(
    [
      'container-number',
      'container-list-number',
      'shipment-bol',
      'tracking-number',
    ].map((name) => [`search.${name}`, ok(search)]),
  ),
};

export function writeCliFixtures(directory = root) {
  for (const subdirectory of ['api/synthetic', 'table/synthetic'])
    fs.mkdirSync(path.join(directory, subdirectory), { recursive: true });
  for (const [name, fixture] of Object.entries(fixtures)) {
    fs.writeFileSync(
      path.join(directory, 'api/synthetic', `${name}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
    if (fixture.ok) {
      const command = name.startsWith('search.') ? 'search' : name;
      fs.writeFileSync(
        path.join(directory, 'table/synthetic', `${name}.txt`),
        renderTable(command, fixture.data),
      );
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  writeCliFixtures();
  console.log(
    'Wrote synthetic CLI fixtures through the SDK mappers and CLI renderer. No network is used.',
  );
}
