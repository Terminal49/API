import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { createTerminal49McpServer } from '../server.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const sdk = vi.hoisted(() => ({
  containersGet: vi.fn(),
  containersEvents: vi.fn(),
  containersCustomFields: vi.fn(),
  containersPartyRoles: vi.fn(),
  shipmentsGet: vi.fn(),
  shipmentsCustomFields: vi.fn(),
  shipmentsPartyRoles: vi.fn(),
}));

vi.mock('@terminal49/sdk', () => {
  class NotFoundError extends Error {
    override name = 'NotFoundError';
  }
  return {
    Terminal49Client: class Terminal49Client {
      containers = {
        get: sdk.containersGet,
        events: sdk.containersEvents,
        customFields: sdk.containersCustomFields,
        partyRoles: sdk.containersPartyRoles,
      };
      shipments = {
        get: sdk.shipmentsGet,
        customFields: sdk.shipmentsCustomFields,
        partyRoles: sdk.shipmentsPartyRoles,
      };
    },
    AuthenticationError: class AuthenticationError extends Error {},
    AuthorizationError: class AuthorizationError extends Error {},
    FeatureNotEnabledError: class FeatureNotEnabledError extends Error {},
    NotFoundError,
  };
});

const CONTAINER_ID = '11111111-1111-4111-8111-111111111111';
const SHIPMENT_ID = '22222222-2222-4222-8222-222222222222';

const CUSTOM_FIELDS = [
  {
    slug: 'po_number',
    name: 'PO number',
    value: 'PO-2048',
    displayValue: 'PO-2048',
    dataType: 'text',
  },
];

const PARTY_ROLES_RAW = {
  data: [
    {
      id: 'party-role-1',
      type: 'party_role',
      attributes: { role: 'customer' },
      relationships: { party: { data: { id: 'party-1', type: 'party' } } },
    },
  ],
  included: [
    {
      id: 'party-1',
      type: 'party',
      attributes: { company_name: 'Acme Imports' },
    },
  ],
};

const PARTY_ROLES = [
  {
    id: 'party-role-1',
    role: 'customer',
    party_id: 'party-1',
    party_name: 'Acme Imports',
  },
];

type DetailTool =
  | 'get_container'
  | 'get_shipment_details'
  | 'get_container_transport_events';

async function callTool(name: DetailTool, args: Record<string, unknown>) {
  const server = createTerminal49McpServer('fixture-token', 'https://api.test');
  const tool = (server as any)._registeredTools[name];
  const result = await tool.handler(args, {});
  return { tool, result };
}

/**
 * Clients validate structured content against the advertised JSON Schema,
 * which rejects keys the schema does not list. Zod strips undeclared keys on
 * parse, so a parse that round-trips to the same JSON proves every emitted key
 * is declared and every value has the declared type.
 */
function expectOutputMatchesSchema(tool: any, result: any) {
  expect(result.isError).toBeUndefined();
  const json = JSON.parse(JSON.stringify(result.structuredContent));
  expect(tool.outputSchema.parse(json)).toEqual(json);
}

beforeEach(() => {
  for (const mock of Object.values(sdk)) mock.mockReset();
});

describe('detail tool output schemas', () => {
  it.each([
    'get_container',
    'get_shipment_details',
    'get_container_transport_events',
  ] as const)('%s advertises a closed object schema', (name) => {
    const server = createTerminal49McpServer('fixture-token');
    const schema = (server as any)._registeredTools[name].outputSchema;
    const jsonSchema = z.toJSONSchema(schema, { io: 'output' }) as any;

    expect(jsonSchema.additionalProperties).toBe(false);
    expect(Object.keys(jsonSchema.properties).length).toBeGreaterThan(3);
  });

  it('get_container matches its schema with a sparse container', async () => {
    sdk.containersGet.mockResolvedValue({
      raw: {
        data: { id: CONTAINER_ID, attributes: { number: 'CAIU1234567' } },
      },
    });

    const { tool, result } = await callTool('get_container', {
      id: CONTAINER_ID,
    });

    expectOutputMatchesSchema(tool, result);
    expect(result.structuredContent).toMatchObject({
      shipment: null,
      pod_terminal: null,
      custom_fields: null,
    });
  });

  it('get_container matches its schema with every include loaded', async () => {
    sdk.containersGet.mockResolvedValue({
      raw: {
        data: {
          id: CONTAINER_ID,
          attributes: {
            number: 'CAIU1234567',
            current_status: 'available_for_pickup',
            available_for_pickup: true,
            availability_known: true,
            equipment_type: 'dry',
            equipment_length: 40,
            equipment_height: 'high_cube',
            weight_in_lbs: 41000,
            location_at_pod_terminal: 'Yard 4',
            pod_arrived_at: '2026-08-18T10:00:00Z',
            pod_discharged_at: '2026-08-19T14:00:00Z',
            pickup_lfd: '2026-08-24',
            pickup_appointment_at: '2026-08-22T16:00:00Z',
            pod_timezone: 'America/Los_Angeles',
            terminal_checked_at: '2026-08-21T05:00:00Z',
            import_deadlines: { pickup_lfd_terminal: '2026-08-24' },
            holds_at_pod_terminal: [
              { name: 'customs', status: 'hold', description: null },
            ],
            // Terminals report amounts as strings and add their own keys.
            fees_at_pod_terminal: [
              {
                type: 'demurrage',
                amount: '150.00',
                currency_code: 'USD',
                description: 'Storage',
              },
            ],
            pod_rail_carrier_scac: 'UPRR',
            pod_rail_loaded_at: '2026-08-23T09:00:00Z',
            ind_eta_at: '2026-08-27T09:00:00Z',
            created_at: '2026-07-01T00:00:00Z',
          },
          relationships: {
            shipment: { data: { id: SHIPMENT_ID, type: 'shipment' } },
            pod_terminal: { data: { id: 'terminal-1', type: 'terminal' } },
          },
        },
        included: [
          {
            id: SHIPMENT_ID,
            type: 'shipment',
            attributes: {
              ref_numbers: ['PO-2048', null],
              shipping_line_scac: 'MAEU',
              shipping_line_name: 'Maersk',
              port_of_lading_name: 'Shanghai',
              port_of_discharge_name: 'Los Angeles',
              destination_name: 'Chicago',
            },
          },
          {
            id: 'terminal-1',
            type: 'terminal',
            attributes: { name: 'APM Terminals Pier 400', firms_code: 'W185' },
          },
          {
            id: 'event-1',
            type: 'transport_event',
            attributes: {
              event: 'container.transport.rail_loaded',
              timestamp: '2026-08-23T09:00:00Z',
              data_source: 'shipping_line',
              location_name: 'Los Angeles',
            },
          },
        ],
      },
    });
    sdk.containersCustomFields.mockResolvedValue(CUSTOM_FIELDS);
    sdk.containersPartyRoles.mockResolvedValue(PARTY_ROLES_RAW);

    const { tool, result } = await callTool('get_container', {
      id: CONTAINER_ID,
      include: [
        'shipment',
        'pod_terminal',
        'transport_events',
        'custom_fields',
        'party_roles',
      ],
    });

    expectOutputMatchesSchema(tool, result);
    expect(result.structuredContent).toMatchObject({
      demurrage: {
        fees_at_pod_terminal: [{ amount: '150.00', description: 'Storage' }],
      },
      shipment: { ref_numbers: ['PO-2048', null] },
      events: { count: 1, rail_events_count: 1 },
      custom_fields: [{ slug: 'po_number', display_value: 'PO-2048' }],
      party_roles: PARTY_ROLES,
    });
  });

  it('get_shipment_details matches its schema with a sparse shipment', async () => {
    sdk.shipmentsGet.mockResolvedValue({
      raw: { data: { id: SHIPMENT_ID, attributes: {} } },
    });

    const { tool, result } = await callTool('get_shipment_details', {
      id: SHIPMENT_ID,
    });

    expectOutputMatchesSchema(tool, result);
    expect(result.structuredContent).toMatchObject({
      status: 'pending',
      containers: { count: 0, containers: [] },
      routing: { destination: null },
    });
  });

  it('get_shipment_details matches its schema with ports, terminals, and custom fields', async () => {
    sdk.shipmentsGet.mockResolvedValue({
      raw: {
        data: {
          id: SHIPMENT_ID,
          attributes: {
            bill_of_lading_number: 'MAEU123456789',
            normalized_number: 'MAEU123456789',
            shipping_line_scac: 'MAEU',
            shipping_line_name: 'Maersk',
            shipping_line_short_name: 'Maersk',
            customer_name: 'Acme',
            ref_numbers: ['PO-2048', null],
            tags: ['priority'],
            pol_etd_at: '2026-07-24T08:00:00Z',
            pol_atd_at: '2026-07-25T08:00:00Z',
            pol_timezone: 'Asia/Shanghai',
            pod_eta_at: '2026-08-18T10:00:00Z',
            pod_original_eta_at: '2026-08-16T10:00:00Z',
            pod_timezone: 'America/Los_Angeles',
            destination_locode: 'USCHI',
            destination_name: 'Chicago',
            destination_eta_at: '2026-08-27T09:00:00Z',
            destination_timezone: 'America/Chicago',
            pod_vessel_name: 'MAERSK ESSEN',
            pod_vessel_imo: '9632179',
            pod_voyage_number: '628E',
            line_tracking_last_attempted_at: '2026-08-21T05:00:00Z',
            line_tracking_last_succeeded_at: '2026-08-21T05:00:00Z',
            line_tracking_stopped_at: null,
            line_tracking_stopped_reason: null,
            created_at: '2026-07-01T00:00:00Z',
            updated_at: '2026-08-21T05:00:00Z',
          },
          relationships: {
            port_of_lading: { data: { id: 'port-1', type: 'port' } },
            port_of_discharge: { data: { id: 'port-2', type: 'port' } },
            pod_terminal: { data: { id: 'terminal-1', type: 'terminal' } },
            destination_terminal: {
              data: { id: 'terminal-2', type: 'terminal' },
            },
            containers: { data: [{ id: CONTAINER_ID, type: 'container' }] },
          },
        },
        included: [
          {
            id: 'port-1',
            type: 'port',
            attributes: { code: 'CNSHA', country_code: 'CN' },
          },
          {
            id: 'port-2',
            type: 'port',
            attributes: { code: 'USLAX', country_code: 'US' },
          },
          {
            id: 'terminal-1',
            type: 'terminal',
            attributes: {
              name: 'APM Terminals Pier 400',
              nickname: 'APM',
              firms_code: 'W185',
            },
          },
          {
            id: 'terminal-2',
            type: 'terminal',
            attributes: { name: 'Joliet Rail Ramp', firms_code: null },
          },
          {
            id: CONTAINER_ID,
            type: 'container',
            attributes: {
              number: 'CAIU1234567',
              equipment_type: 'dry',
              equipment_length: 40,
              available_for_pickup: null,
              pickup_lfd: '2026-08-24',
            },
          },
        ],
      },
    });
    sdk.shipmentsCustomFields.mockResolvedValue(CUSTOM_FIELDS);
    sdk.shipmentsPartyRoles.mockResolvedValue(PARTY_ROLES_RAW);

    const { tool, result } = await callTool('get_shipment_details', {
      id: SHIPMENT_ID,
      include_containers: true,
      include_custom_fields: true,
      include_party_roles: true,
    });

    expectOutputMatchesSchema(tool, result);
    expect(result.structuredContent).toMatchObject({
      status: 'in_transit',
      reference_numbers: ['PO-2048', null],
      routing: {
        port_of_discharge: { terminal: { firms_code: 'W185' } },
        destination: {
          locode: 'USCHI',
          terminal: { name: 'Joliet Rail Ramp' },
        },
      },
      containers: { count: 1 },
      custom_fields: [{ slug: 'po_number' }],
      party_roles: PARTY_ROLES,
    });
  });

  it('get_container_transport_events matches its schema from the sub-resource', async () => {
    sdk.containersEvents.mockResolvedValue({
      raw: {
        data: [
          {
            id: 'event-1',
            type: 'transport_event',
            attributes: {
              event: 'container.transport.vessel_departed',
              timestamp: '2026-07-25T08:00:00Z',
              timezone: 'Asia/Shanghai',
              voyage_number: '628E',
              data_source: 'shipping_line',
            },
            relationships: {
              location: { data: { id: 'port-1' } },
              vessel: { data: { id: 'vessel-1', type: 'vessel' } },
            },
          },
          {
            id: 'event-2',
            type: 'transport_event',
            attributes: {
              event: 'container.pickup_lfd.changed',
              timestamp: '2026-08-20T10:00:00Z',
              value: '2026-08-24',
              invalidated_at: '2026-08-21T10:00:00Z',
            },
          },
        ],
        included: [
          {
            id: 'port-1',
            type: 'port',
            attributes: { name: 'Shanghai', code: 'CNSHA' },
          },
        ],
      },
    });

    const { tool, result } = await callTool('get_container_transport_events', {
      id: CONTAINER_ID,
    });

    expectOutputMatchesSchema(tool, result);
    expect(result.structuredContent).toMatchObject({
      total_events: 2,
      timeline: [
        {
          vessel_id: 'vessel-1',
          location: { name: 'Shanghai', code: 'CNSHA', type: 'port' },
        },
        { vessel_id: null, value: '2026-08-24', location: null },
      ],
      milestones: { vessel_departed_at: '2026-07-25T08:00:00.000Z' },
      _metadata: {
        source: 'transport_events_subresource',
        container_found: true,
      },
    });
  });

  it('get_container_transport_events matches its schema on the include fallback', async () => {
    const { NotFoundError } = await import('@terminal49/sdk');
    sdk.containersEvents.mockRejectedValue(new NotFoundError('Not Found'));
    sdk.containersGet.mockResolvedValue({
      raw: {
        data: { id: CONTAINER_ID, attributes: {} },
        included: [
          {
            id: 'event-1',
            type: 'transport_event',
            attributes: {
              event: 'container.transport.discharged',
              timestamp: '2026-08-19T14:00:00Z',
              location_locode: 'USLAX',
            },
          },
        ],
      },
    });

    const { tool, result } = await callTool('get_container_transport_events', {
      id: CONTAINER_ID,
    });

    expectOutputMatchesSchema(tool, result);
    expect(result.structuredContent).toMatchObject({
      timeline: [{ location: { code: 'USLAX' } }],
      _metadata: { source: 'container_include_fallback' },
    });
  });
});
