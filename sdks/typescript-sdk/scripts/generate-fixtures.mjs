import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = fileURLToPath(new URL('../src/fixtures/', import.meta.url));
const stamp = '2026-01-10T12:00:00Z';
const ref = (type, id) => ({ type, id });
const rel = (data) => ({ data });
const resource = (type, id, attributes, relationships = {}) => ({
  type,
  id,
  attributes,
  relationships,
});
const doc = (data, included) => {
  const document = { data };
  if (included) document.included = included;
  return document;
};
const link = (name) => ({ self: `https://api.example.test/v2/${name}` });

export function buildFixtures() {
  const origin = resource('port', 'port-1', {
    id: 'port-1',
    name: 'Example Origin',
    code: 'ZZORG',
    city: 'Example City',
    country_code: 'ZZ',
    latitude: '10',
    longitude: '20',
    time_zone: 'Etc/UTC',
  });
  const destination = resource('port', 'port-2', {
    id: 'port-2',
    name: 'Example Destination',
    code: 'ZZDST',
    country_code: 'ZZ',
    latitude: '30',
    longitude: '40',
    time_zone: 'Etc/UTC',
  });
  const terminal = resource('terminal', 'terminal-1', {
    name: 'Example Ocean Terminal',
    nickname: 'Example Ocean',
    firms_code: 'EX01',
    website: 'https://terminal.example.test',
    time_zone: 'Etc/UTC',
  });
  const inland = resource('terminal', 'terminal-2', {
    name: 'Example Inland Terminal',
    nickname: 'Example Inland',
    firms_code: 'EX02',
  });
  const shipment = resource(
    'shipment',
    'shipment-1',
    {
      created_at: stamp,
      bill_of_lading_number: 'SYNTHBOL000001',
      normalized_number: 'SYNTHBOL000001',
      bill_of_lading: 'SYNTHBOL000001',
      bl_number: 'SYNTHBOL000001',
      booking_number: 'SYNTHBOOK000001',
      shipping_line_scac: 'SYNU',
      shipping_line_name: 'Example Ocean Line',
      shipping_line_short_name: 'Example',
      customer_name: 'Example Fixture Shipper',
      ref_numbers: ['SYNTHREF000001'],
      tags: ['synthetic'],
      pod_vessel_name: 'EXAMPLE VESSEL',
      pod_vessel_imo: '0000001',
      pod_voyage_number: 'SYNTH01',
      port_of_lading_locode: 'ZZORG',
      port_of_lading_name: 'Example Origin',
      port_of_discharge_locode: 'ZZDST',
      port_of_discharge_name: 'Example Destination',
      destination_locode: null,
      destination_name: null,
      destination_timezone: null,
      pol_etd_at: stamp,
      pol_atd_at: stamp,
      pol_timezone: 'Etc/UTC',
      pod_eta_at: stamp,
      pod_original_eta_at: stamp,
      pod_ata_at: stamp,
      pod_timezone: 'Etc/UTC',
      line_tracking_last_attempted_at: stamp,
      line_tracking_last_succeeded_at: stamp,
      line_tracking_stopped_at: null,
      line_tracking_stopped_reason: null,
    },
    {
      port_of_lading: rel(ref('port', 'port-1')),
      port_of_discharge: rel(ref('port', 'port-2')),
      pod_terminal: rel(ref('terminal', 'terminal-1')),
      destination: rel(null),
      destination_terminal: rel(null),
      containers: rel([ref('container', 'container-1')]),
    },
  );
  const container = resource(
    'container',
    'container-1',
    {
      number: 'SYNX0000001',
      container_number: 'SYNX0000001',
      seal_number: 'SYNTHSEAL01',
      created_at: stamp,
      current_status: 'picked_up',
      ref_numbers: ['SYNTHREF000001'],
      equipment_type: 'tank',
      equipment_length: 40,
      equipment_height: 'high_cube',
      weight_in_lbs: 10000,
      available_for_pickup: true,
      availability_known: true,
      location_at_pod_terminal: 'EXAMPLE-A1',
      pod_arrived_at: stamp,
      pod_discharged_at: stamp,
      pod_full_out_at: stamp,
      pol_full_in_at: stamp,
      pol_vessel_loaded_at: stamp,
      pol_vessel_departed_at: stamp,
      pod_timezone: 'Etc/UTC',
      pickup_lfd: '2026-01-20',
      pickup_appointment_at: stamp,
      fees_at_pod_terminal: [
        { name: 'Example fee', amount: 25, currency: 'USD' },
      ],
      holds_at_pod_terminal: [
        {
          name: 'Example hold',
          status: 'released',
          description: 'Synthetic hold',
        },
      ],
      import_deadlines: {
        pickup_lfd_terminal: '2026-01-20',
        pickup_lfd_rail: null,
        pickup_lfd_line: null,
      },
      pod_rail_carrier_scac: 'SYNR',
      ind_rail_carrier_scac: 'SYNR',
      ind_eta_at: stamp,
      delivered_at: null,
      empty_terminated_at: null,
      shipment_last_tracking_request_at: stamp,
    },
    {
      shipment: rel(ref('shipment', 'shipment-1')),
      pod_terminal: rel(ref('terminal', 'terminal-1')),
      pickup_facility: rel(null),
      transport_events: rel([ref('transport_event', 'transport_event-1')]),
      raw_events: rel([ref('raw_event', 'raw_event-1')]),
    },
  );
  const tracking = resource(
    'tracking_request',
    'tracking_request-1',
    {
      request_type: 'bill_of_lading',
      request_number: 'SYNTHBOL000001',
      status: 'created',
      scac: 'SYNU',
      ref_numbers: ['SYNTHREF000001'],
      created_at: stamp,
      updated_at: stamp,
    },
    { tracked_object: rel(ref('shipment', 'shipment-1')) },
  );
  const event = resource(
    'transport_event',
    'transport_event-1',
    {
      event: 'container.transport.vessel_arrived',
      timestamp: stamp,
      created_at: stamp,
      voyage_number: 'SYNTH01',
      data_source: 'shipping_line',
      location_locode: 'ZZDST',
      timezone: 'Etc/UTC',
      invalidated_at: null,
      value: null,
    },
    {
      shipment: rel(ref('shipment', 'shipment-1')),
      container: rel(ref('container', 'container-1')),
      location: rel(ref('port', 'port-2')),
      terminal: rel(ref('terminal', 'terminal-1')),
      vessel: rel(null),
    },
  );
  const raw = resource(
    'raw_event',
    'raw_event-1',
    {
      event: 'container.transport.vessel_arrived',
      original_event: 'Synthetic arrival',
      timestamp: stamp,
      actual_at: stamp,
      estimated_at: null,
      actual_on: null,
      estimated: false,
      index: 1,
      data_source: 'shipping_line',
      data_provider_name: 'Example Ocean Line',
      data_provider_code: 'SYNU',
      voyage_number: 'SYNTH01',
      location_name: 'Example Destination',
      location_locode: 'ZZDST',
      timezone: 'Etc/UTC',
    },
    {
      container: rel(ref('container', 'container-1')),
      location: rel(ref('port', 'port-2')),
      vessel: rel(null),
    },
  );
  const pickup = structuredClone(container);
  pickup.relationships.pickup_facility = rel(ref('terminal', 'terminal-2'));
  const lines = [
    resource('shipping_line', 'shipping_line-1', {
      scac: 'SYNU',
      name: 'Example Ocean Line',
      short_name: 'Example',
      bol_prefix: 'SYNTH',
      notes: 'Synthetic carrier',
      alternative_scacs: ['SYNA'],
      container_number_tracking_support: true,
      bill_of_lading_tracking_support: true,
      booking_number_tracking_support: false,
    }),
    resource('shipping_line', 'shipping_line-2', {
      scac: 'SYBU',
      name: 'Example Backup Line',
      short_name: 'Backup',
      alternative_scacs: [],
      container_number_tracking_support: false,
      bill_of_lading_tracking_support: true,
      booking_number_tracking_support: false,
    }),
    resource('shipping_line', 'shipping_line-3', {
      scac: 'SYCU',
      name: 'Example Coastal Line',
      short_name: 'Coastal',
      alternative_scacs: null,
    }),
  ];
  const account = resource('account', 'account-1', {
    company_name: 'Example Fixture Shipper',
    company_type: 'shipper',
    scac: null,
    abbr_name: 'Example',
    city: 'Example City',
    state_abbr: 'EX',
    country: 'ZZ',
    plan: 'free_plan',
    tracking_slots: {
      limit: 10,
      used: 4,
      active_containers: 3,
      pending_tracking_requests: 1,
      remaining: 6,
    },
  });
  const userAccount = structuredClone(account);
  Object.assign(userAccount.attributes, {
    company_type: 'freight_forwarder',
    scac: 'SYNU',
    plan: 'customer',
    tracking_slots: null,
  });
  const user = resource(
    'user',
    'user-1',
    {
      email: 'fixture@example.test',
      name: 'Example Operator',
      role: 'account_manager',
      job_role: 'forwarder',
      job_title: 'Operations lead',
      admin: false,
    },
    { accounts: rel([ref('account', 'account-1')]) },
  );
  const features = {
    data_out_api: { status: 'requires_paid_plan' },
    custom_fields: { status: 'requires_user_credential' },
  };
  const geo = {
    type: 'FeatureCollection',
    features: [
      ...['POL', 'TS1', 'POD'].map((label, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [20 + i * 10, 10 + i * 10] },
        properties: {
          feature_type: 'port',
          ports_sequence: i + 1,
          ports_total: 3,
          location_id: `route-port-${i + 1}`,
          name: `Example Route Port ${i + 1}`,
          country_code: 'ZZ',
          label,
          inbound_eta_at: i === 2 ? stamp : null,
          inbound_ata_at: i === 1 ? stamp : null,
          outbound_etd_at: null,
          outbound_atd_at: i < 2 ? stamp : null,
        },
      })),
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [35, 25] },
        properties: {
          feature_type: 'current_vessel',
          vessel_name: 'EXAMPLE VESSEL',
          vessel_imo: '0000001',
          voyage_number: 'SYNTH01',
          vessel_location_heading: 90,
          vessel_location_speed: 12,
          vessel_location_timestamp: stamp,
          departure_port_id: 'route-port-2',
          departure_port_name: 'Example Route Port 2',
          departure_port_label: 'TS1',
          arrival_port_id: 'route-port-3',
          arrival_port_name: 'Example Route Port 3',
          arrival_port_label: 'POD',
        },
      },
    ],
  };
  const fixtures = {
    'shipments.list': {
      ...doc([shipment]),
      meta: { total: 1 },
      links: link('shipments'),
    },
    'shipments.get.base': doc(shipment),
    'shipments.get.include': doc(shipment, [
      container,
      origin,
      destination,
      terminal,
    ]),
    'containers.list': {
      ...doc([container]),
      meta: { total: 1 },
      links: link('containers'),
    },
    'containers.get.base': doc(container),
    'containers.get.include': doc(container, [shipment, terminal]),
    'containers.get.pickup': doc([pickup], [shipment, terminal, inland]),
    'containers.events': doc([event], [destination, terminal]),
    'containers.raw-events': doc([raw], [destination]),
    'containers.map_geojson': geo,
    'tracking-requests.list': {
      ...doc([tracking], [shipment]),
      meta: { total: 1 },
    },
    'tracking-requests.get.base': doc(tracking, [shipment]),
    'shipping-lines.list': { ...doc(lines), links: link('shipping_lines') },
    'ports.get': doc(origin),
    'terminals.get': doc(terminal),
    'me.get.api-key': doc(
      resource(
        'credential',
        'credential-1',
        {
          kind: 'api_key',
          channel: 'api',
          name: 'Example fixture key',
          features,
        },
        { account: rel(ref('account', 'account-1')), user: rel(null) },
      ),
      [account],
    ),
    'me.get.user': doc(
      resource(
        'credential',
        'user-1',
        { kind: 'user', channel: 'mcp', name: null, features },
        {
          account: rel(ref('account', 'account-1')),
          user: rel(ref('user', 'user-1')),
        },
      ),
      [userAccount, user],
    ),
    'trade-intel.meta': {
      facts_since_month: '2022-01-01',
      dimensions: ['origin_country', 'pod'],
    },
    'trade-intel.companies.search': {
      results: [
        {
          company_name: 'EXAMPLE FIXTURE SUPPLY',
          states: ['EX'],
          containers: 12,
        },
      ],
    },
    'trade-intel.companies.profile': {
      company_name: 'EXAMPLE FIXTURE SUPPLY',
      totals: { containers: 1240 },
      suppliers: [],
      commodities: [],
    },
    'trade-intel.commodities.search': {
      results: [{ hs4: '9401', description: 'Example chairs' }],
    },
    'trade-intel.importers.top': {
      importers: [
        {
          company_name: 'EXAMPLE FIXTURE SUPPLY',
          containers: 800,
          states: null,
        },
      ],
    },
    'trade-intel.trends': {
      series: [
        {
          origin_country: 'VIETNAM',
          periods: [{ period: '2026-Q1', containers: 12 }],
        },
      ],
    },
    'trade-intel.breakdown': {
      rows: [{ level: 0, pod_coast: 'example', containers: 12 }],
    },
    'trade-intel.containers.lookup': {
      container_number: 'SYNX0000001',
      found: true,
      bills_of_lading: [
        {
          bol_number: 'SYNTHBOL000001',
          scac: 'SYNU',
          consignee: 'EXAMPLE FIXTURE SUPPLY',
        },
      ],
    },
    'trade-intel.bills-of-lading.lookup': {
      bol_number: 'SYNTHBOL000001',
      found: true,
      containers: [
        {
          container_number: 'SYNX0000001',
          consignee: 'EXAMPLE FIXTURE SUPPLY',
        },
      ],
    },
  };
  return fixtures;
}

export function writeFixtures(directory = fixturesDir) {
  fs.mkdirSync(directory, { recursive: true });
  for (const [name, fixture] of Object.entries(buildFixtures())) {
    fs.writeFileSync(
      path.join(directory, `${name}.json`),
      `${JSON.stringify(fixture, null, 2)}\n`,
    );
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  writeFixtures();
  console.log('Wrote synthetic SDK fixtures. No API key or network is used.');
}
