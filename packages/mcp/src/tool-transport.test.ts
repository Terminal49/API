import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const sdk = vi.hoisted(() => ({
  search: vi.fn(),
  createTrackingRequestFromInfer: vi.fn(),
  createTrackingRequest: vi.fn(),
  containersGet: vi.fn(),
  containersEvents: vi.fn(),
  containersRoute: vi.fn(),
  containersList: vi.fn(),
  shipmentsGet: vi.fn(),
  shipmentsList: vi.fn(),
  shippingLinesList: vi.fn(),
  trackingRequestsList: vi.fn(),
}));

vi.mock('@terminal49/sdk', () => ({
  Terminal49Client: class Terminal49Client {
    search = sdk.search;
    createTrackingRequestFromInfer = sdk.createTrackingRequestFromInfer;
    createTrackingRequest = sdk.createTrackingRequest;
    getContainer = sdk.containersGet;
    containers = {
      get: sdk.containersGet,
      events: sdk.containersEvents,
      route: sdk.containersRoute,
      list: sdk.containersList,
    };
    shipments = {
      get: sdk.shipmentsGet,
      list: sdk.shipmentsList,
    };
    shippingLines = { list: sdk.shippingLinesList };
    trackingRequests = { list: sdk.trackingRequestsList };
  },
  FeatureNotEnabledError: class FeatureNotEnabledError extends Error {},
  NotFoundError: class NotFoundError extends Error {},
}));

const CONTAINER_ID = '11111111-1111-4111-8111-111111111111';
const SHIPMENT_ID = '22222222-2222-4222-8222-222222222222';
const TOOL_NAMES = [
  'search_container',
  'track_container',
  'get_container',
  'get_shipment_details',
  'get_container_transport_events',
  'get_supported_shipping_lines',
  'get_container_route',
  'list_shipments',
  'list_containers',
  'list_tracking_requests',
] as const;
type ToolName = (typeof TOOL_NAMES)[number];

function containerRaw() {
  return {
    data: {
      id: CONTAINER_ID,
      type: 'container',
      attributes: {
        number: 'CAIU1234567',
        current_status: 'available_for_pickup',
        available_for_pickup: true,
        equipment_type: 'dry',
        equipment_length: 40,
        equipment_height: 'high_cube',
        location_at_pod_terminal: 'Yard 4',
        pod_arrived_at: '2026-08-18T10:00:00Z',
        pod_discharged_at: '2026-08-19T14:00:00Z',
        pickup_lfd: '2026-08-24',
        pod_timezone: 'America/Los_Angeles',
        terminal_checked_at: '2026-08-21T05:00:00Z',
        holds_at_pod_terminal: [],
        fees_at_pod_terminal: [],
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
          ref_numbers: ['PO-2048'],
          shipping_line_scac: 'MAEU',
          shipping_line_name: 'Maersk',
          bill_of_lading_number: 'MAEU123456789',
        },
      },
      {
        id: 'terminal-1',
        type: 'terminal',
        attributes: {
          name: 'APM Terminals Pier 400',
          firms_code: 'W185',
        },
      },
    ],
  };
}

function shipmentRaw() {
  return {
    data: {
      id: SHIPMENT_ID,
      type: 'shipment',
      attributes: {
        bill_of_lading_number: 'MAEU123456789',
        shipping_line_scac: 'MAEU',
        shipping_line_name: 'Maersk',
        ref_numbers: ['PO-2048'],
        pol_atd_at: '2026-07-25T08:00:00Z',
        pod_eta_at: '2026-08-18T10:00:00Z',
        port_of_lading_locode: 'CNSHA',
        port_of_lading_name: 'Shanghai',
        port_of_discharge_locode: 'USLAX',
        port_of_discharge_name: 'Los Angeles',
        pod_vessel_name: 'MAERSK ESSEN',
        pod_voyage_number: '628E',
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-08-21T05:00:00Z',
      },
      relationships: {
        containers: { data: [{ id: CONTAINER_ID, type: 'container' }] },
      },
    },
    included: [
      {
        id: CONTAINER_ID,
        type: 'container',
        attributes: {
          number: 'CAIU1234567',
          equipment_type: 'dry',
          equipment_length: 40,
          available_for_pickup: true,
          pod_discharged_at: '2026-08-19T14:00:00Z',
          pickup_lfd: '2026-08-24',
        },
      },
    ],
  };
}

function eventsRaw() {
  return {
    data: [
      {
        id: 'event-1',
        type: 'transport_event',
        attributes: {
          event: 'container.transport.vessel_departed',
          timestamp: '2026-07-25T08:00:00Z',
          timezone: 'Asia/Shanghai',
        },
      },
      {
        id: 'event-2',
        type: 'transport_event',
        attributes: {
          event: 'container.transport.discharged',
          timestamp: '2026-08-19T14:00:00Z',
          timezone: 'America/Los_Angeles',
        },
      },
    ],
    included: [],
  };
}

function routeRaw() {
  return {
    data: {
      id: 'route-1',
      type: 'route',
      attributes: {
        created_at: '2026-07-01T00:00:00Z',
        updated_at: '2026-08-21T05:00:00Z',
      },
      relationships: {
        route_locations: {
          data: [{ id: 'route-location-1', type: 'route_location' }],
        },
      },
    },
    included: [
      {
        id: 'route-location-1',
        type: 'route_location',
        attributes: {
          inbound_mode: 'vessel',
          inbound_scac: 'MAEU',
          inbound_eta_at: '2026-08-18T10:00:00Z',
          outbound_mode: 'truck',
        },
        relationships: {
          port: { data: { id: 'port-1', type: 'port' } },
        },
      },
      {
        id: 'port-1',
        type: 'port',
        attributes: {
          code: 'USLAX',
          name: 'Los Angeles',
          city: 'Los Angeles',
          country_code: 'US',
        },
      },
    ],
  };
}

async function connectClient() {
  const handler = createMcpHandler(
    () => createTerminal49McpServer('fixture-token', 'https://api.test'),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client(
    { name: 'terminal49-all-tools-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.test/mcp'),
    {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    },
  );
  await client.connect(transport);
  return { client, handler };
}

function configureHappyPath(toolName: ToolName): void {
  switch (toolName) {
    case 'search_container':
      sdk.search.mockResolvedValue({
        data: [
          {
            id: CONTAINER_ID,
            type: 'search_result',
            attributes: {
              entity_type: 'container',
              number: 'CAIU1234567',
              status: 'available_for_pickup',
              scac: 'MAEU',
              port_of_discharge_name: 'Los Angeles',
            },
          },
        ],
      });
      return;
    case 'track_container':
      sdk.search.mockResolvedValue({ data: [] });
      sdk.createTrackingRequestFromInfer.mockResolvedValue({
        infer: { inferred_type: 'container', selected_scac: 'MAEU' },
        trackingRequest: {
          included: [{ id: CONTAINER_ID, type: 'container' }],
        },
      });
      sdk.containersGet.mockResolvedValue({ raw: containerRaw() });
      return;
    case 'get_container':
      sdk.containersGet.mockResolvedValue({ raw: containerRaw() });
      return;
    case 'get_shipment_details':
      sdk.shipmentsGet.mockResolvedValue({ raw: shipmentRaw() });
      return;
    case 'get_container_transport_events':
      sdk.containersEvents.mockResolvedValue({ raw: eventsRaw() });
      return;
    case 'get_supported_shipping_lines':
      sdk.shippingLinesList.mockResolvedValue([
        { scac: 'MAEU', name: 'Maersk', shortName: 'Maersk' },
        {
          scac: 'MSCU',
          name: 'Mediterranean Shipping Company',
          shortName: 'MSC',
        },
      ]);
      return;
    case 'get_container_route':
      sdk.containersRoute.mockResolvedValue({ raw: routeRaw() });
      return;
    case 'list_shipments':
      sdk.shipmentsList.mockResolvedValue({
        items: [
          {
            id: SHIPMENT_ID,
            billOfLading: 'MAEU123456789',
            shippingLineScac: 'MAEU',
            podVesselName: 'MAERSK ESSEN',
            portOfDischargeName: 'Los Angeles',
            podEtaAt: '2026-08-18T10:00:00Z',
          },
        ],
        links: { self: 'https://api.test/shipments?page[number]=1' },
        meta: { total: 1 },
        unsupportedFilters: [],
      });
      return;
    case 'list_containers':
      sdk.containersList.mockResolvedValue({
        items: [
          {
            id: CONTAINER_ID,
            number: 'CAIU1234567',
            currentStatus: 'available_for_pickup',
            podDischargedAt: '2026-08-19T14:00:00Z',
            availableForPickup: true,
            pickupLfd: '2026-08-24',
            holdsAtPodTerminal: [],
            terminals: {
              podTerminal: { name: 'APM Terminals Pier 400' },
            },
          },
        ],
        links: { self: 'https://api.test/containers?page[number]=1' },
        meta: { total: 1 },
        unsupportedFilters: [],
      });
      return;
    case 'list_tracking_requests':
      sdk.trackingRequestsList.mockResolvedValue({
        items: [
          {
            id: 'tracking-request-1',
            requestNumber: 'CAIU1234567',
            requestType: 'container',
            status: 'succeeded',
            scac: 'MAEU',
            createdAt: '2026-08-20T12:00:00Z',
            updatedAt: '2026-08-20T12:05:00Z',
          },
        ],
        links: { self: 'https://api.test/tracking_requests?page[number]=1' },
        meta: { total: 1 },
      });
      return;
    default: {
      const exhaustive: never = toolName;
      throw new Error(`Unhandled tool ${exhaustive}`);
    }
  }
}

function argumentsFor(toolName: ToolName): Record<string, unknown> {
  switch (toolName) {
    case 'search_container':
      return { query: 'CAIU1234567' };
    case 'track_container':
      return { number: 'CAIU1234567', scac: 'MAEU' };
    case 'get_container':
    case 'get_container_transport_events':
    case 'get_container_route':
      return { id: CONTAINER_ID };
    case 'get_shipment_details':
      return { id: SHIPMENT_ID, include_containers: true };
    case 'get_supported_shipping_lines':
      return { search: 'ma' };
    case 'list_shipments':
      return { carrier: 'MAEU', page: 1, page_size: 10 };
    case 'list_containers':
      return { status: 'available_for_pickup', page: 1, page_size: 10 };
    case 'list_tracking_requests':
      return { status: 'succeeded', page: 1, page_size: 10 };
    default: {
      const exhaustive: never = toolName;
      throw new Error(`Unhandled tool ${exhaustive}`);
    }
  }
}

function configureFailure(toolName: ToolName, error: Error): void {
  switch (toolName) {
    case 'search_container':
      sdk.search.mockRejectedValue(error);
      return;
    case 'track_container':
      sdk.search.mockResolvedValue({ data: [] });
      sdk.createTrackingRequestFromInfer.mockRejectedValue(error);
      return;
    case 'get_container':
      sdk.containersGet.mockRejectedValue(error);
      return;
    case 'get_shipment_details':
      sdk.shipmentsGet.mockRejectedValue(error);
      return;
    case 'get_container_transport_events':
      sdk.containersEvents.mockRejectedValue(error);
      return;
    case 'get_supported_shipping_lines':
      sdk.shippingLinesList.mockRejectedValue(error);
      return;
    case 'get_container_route':
      sdk.containersRoute.mockRejectedValue(error);
      return;
    case 'list_shipments':
      sdk.shipmentsList.mockRejectedValue(error);
      return;
    case 'list_containers':
      sdk.containersList.mockRejectedValue(error);
      return;
    case 'list_tracking_requests':
      sdk.trackingRequestsList.mockRejectedValue(error);
      return;
    default: {
      const exhaustive: never = toolName;
      throw new Error(`Unhandled tool ${exhaustive}`);
    }
  }
}

beforeEach(() => {
  for (const mock of Object.values(sdk)) {
    mock.mockReset();
  }
});

describe('all public tools over MCP client transport', () => {
  it.each(TOOL_NAMES)(
    '%s returns realistic structured content that validates its output schema',
    async (toolName) => {
      configureHappyPath(toolName);
      const { client, handler } = await connectClient();

      try {
        const result = await client.callTool({
          name: toolName,
          arguments: argumentsFor(toolName),
        });

        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toMatchObject({
          _response_contract: {
            purpose: expect.any(String),
            presentation_guidance: expect.any(String),
            suggested_tools: expect.any(Array),
          },
        });
        expect(
          result.content.some(
            (block) =>
              block.type === 'text' &&
              block.annotations?.audience?.includes('assistant') &&
              block.text.includes('_agent_steering'),
          ),
        ).toBe(true);
      } finally {
        await client.close();
        await handler.close();
      }
    },
  );

  it('track_container returns a validated uncreated state for a not-found response', async () => {
    sdk.search.mockResolvedValue({ data: [] });
    const notFound = new Error('internal route not found');
    notFound.name = 'NotFoundError';
    sdk.createTrackingRequestFromInfer.mockRejectedValue(notFound);
    const { client, handler } = await connectClient();

    try {
      const result = await client.callTool({
        name: 'track_container',
        arguments: { number: 'CAIU1234567', scac: 'MAEU' },
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        error: 'NotFound',
        tracking_request_created: false,
        message: expect.stringContaining('could not create a tracking request'),
        _response_contract: {
          requires_more_data: ['a verified identifier and carrier SCAC'],
          presentation_guidance: expect.stringContaining(
            'No tracking request was created',
          ),
        },
      });
      expect(JSON.stringify(result)).not.toContain('internal route');
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it.each(TOOL_NAMES)(
    '%s redacts upstream failure details over MCP client transport',
    async (toolName) => {
      const leakedUrl = 'https://internal.example/v2?token=secret-token';
      configureFailure(toolName, new Error(`upstream failed at ${leakedUrl}`));
      const { client, handler } = await connectClient();

      try {
        const result = await client.callTool({
          name: toolName,
          arguments: argumentsFor(toolName),
        });
        const text = result.content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        expect(result.isError).toBe(true);
        expect(result.structuredContent).toBeUndefined();
        expect(text).toContain('could not be completed');
        expect(text).not.toContain('internal.example');
        expect(text).not.toContain('secret-token');
      } finally {
        await client.close();
        await handler.close();
      }
    },
  );
});

describe('prompts and resources over MCP client transport', () => {
  it('renders all prompts with realistic arguments', async () => {
    const { client, handler } = await connectClient();

    try {
      const track = await client.getPrompt({
        name: 'track-shipment',
        arguments: {
          container_number: 'CAIU1234567',
          carrier: 'MAEU',
        },
      });
      const demurrage = await client.getPrompt({
        name: 'check-demurrage',
        arguments: { container_id: CONTAINER_ID },
      });
      const delays = await client.getPrompt({
        name: 'analyze-delays',
        arguments: { container_id: CONTAINER_ID },
      });

      expect(JSON.stringify(track.messages)).toContain('CAIU1234567');
      expect(JSON.stringify(track.messages)).toContain('MAEU');
      expect(JSON.stringify(demurrage.messages)).toContain('Last Free Day');
      expect(JSON.stringify(delays.messages)).toContain('journey timeline');
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('reads all static resources and the container resource', async () => {
    sdk.containersGet.mockResolvedValue({ raw: containerRaw() });
    const { client, handler } = await connectClient();

    try {
      const uris = [
        'terminal49://docs/milestone-glossary',
        'terminal49://docs/mcp-query-guidance',
        'terminal49://docs/list-display-columns',
        `terminal49://container/${CONTAINER_ID}`,
      ];
      const results = await Promise.all(
        uris.map((uri) => client.readResource({ uri })),
      );

      for (const [index, result] of results.entries()) {
        expect(result.contents[0]?.uri).toBe(uris[index]);
        expect(result.contents[0]).toMatchObject({
          text: expect.any(String),
        });
      }
      expect(JSON.stringify(results[3]?.contents)).toContain('CAIU1234567');
    } finally {
      await client.close();
      await handler.close();
    }
  });
});
