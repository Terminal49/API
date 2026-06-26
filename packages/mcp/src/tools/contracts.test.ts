import { FeatureNotEnabledError, type Terminal49Client } from '@terminal49/sdk';
import { describe, expect, it, vi } from 'vitest';
import { executeGetContainer } from './get-container.js';
import { executeGetContainerRoute } from './get-container-route.js';
import { executeGetContainerTransportEvents } from './get-container-transport-events.js';
import { executeGetShipmentDetails } from './get-shipment-details.js';
import { executeListContainers } from './list-containers.js';
import { executeListShipments } from './list-shipments.js';
import { executeListTrackingRequests } from './list-tracking-requests.js';
import { executeSearchContainer } from './search-container.js';
import { executeTrackContainer } from './track-container.js';

function asClient(client: unknown): Terminal49Client {
  return client as Terminal49Client;
}

function buildContainerRaw(containerId = 'container-1') {
  return {
    data: {
      id: containerId,
      type: 'container',
      attributes: {
        number: 'CAIU1234567',
        equipment_type: 'dry',
        equipment_length: 40,
        equipment_height: 'high_cube',
        weight_in_lbs: 12000,
        location_at_pod_terminal: 'APM',
        available_for_pickup: true,
        current_status: 'available',
        pod_arrived_at: '2025-01-01T00:00:00Z',
        pod_discharged_at: '2025-01-02T00:00:00Z',
        pickup_lfd: '2099-01-10',
        pod_timezone: 'America/Los_Angeles',
        terminal_checked_at: '2099-01-05T00:00:00Z',
        import_deadlines: {
          pickup_lfd_terminal: '2099-01-10T00:00:00Z',
          pickup_lfd_rail: null,
          pickup_lfd_line: '2099-01-12T00:00:00Z',
        },
        fees_at_pod_terminal: [],
        holds_at_pod_terminal: [],
        created_at: '2025-01-01T00:00:00Z',
      },
      relationships: {
        shipment: { data: { id: 'shipment-1', type: 'shipment' } },
        pod_terminal: { data: { id: 'terminal-1', type: 'terminal' } },
      },
    },
    included: [
      {
        id: 'shipment-1',
        type: 'shipment',
        attributes: {
          ref_numbers: ['PO-1'],
          shipping_line_scac: 'MAEU',
          shipping_line_name: 'Maersk',
        },
      },
      {
        id: 'terminal-1',
        type: 'terminal',
        attributes: {
          name: 'APM Los Angeles',
          firms_code: 'Y123',
        },
      },
      {
        id: 'evt-1',
        type: 'transport_event',
        attributes: {
          event: 'container.transport.rail_departed',
          timestamp: '2025-01-03T00:00:00Z',
          location_name: 'Los Angeles',
        },
      },
    ],
  };
}

function buildShipmentRaw() {
  return {
    data: {
      id: 'shipment-1',
      type: 'shipment',
      attributes: {
        bill_of_lading_number: 'MAEU123',
        shipping_line_scac: 'MAEU',
        shipping_line_name: 'Maersk',
        ref_numbers: ['PO-1'],
        tags: ['priority'],
        updated_at: '2025-01-05T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      },
      relationships: {
        containers: { data: [{ id: 'container-1', type: 'container' }] },
      },
    },
    included: [
      {
        id: 'container-1',
        type: 'container',
        attributes: {
          number: 'CAIU1234567',
          equipment_type: '40HC',
          equipment_length: 40,
          available_for_pickup: true,
        },
      },
    ],
  };
}

async function executeSupportedShippingLines(
  args: { search?: string },
  client: Terminal49Client,
) {
  vi.resetModules();
  const { executeGetSupportedShippingLines } =
    await import('./get-supported-shipping-lines.js');

  return executeGetSupportedShippingLines(args, client);
}

describe('MCP tool contracts', () => {
  it('search_container returns normalized containers and shipments', async () => {
    const client = asClient({
      search: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'sr-1',
            type: 'search_result',
            attributes: {
              entity_type: 'container',
              number: 'CAIU1234567',
              status: 'in_transit',
              scac: 'MAEU',
            },
          },
          {
            id: 'sr-2',
            type: 'search_result',
            attributes: {
              entity_type: 'shipment',
              ref_numbers: ['PO-1'],
              scac: 'MSCU',
            },
          },
        ],
      }),
    });

    const result = await executeSearchContainer(
      { query: 'CAIU1234567' },
      client,
    );

    expect(result.total_results).toBe(2);
    expect(result.containers[0]).toMatchObject({
      id: 'sr-1',
      container_number: 'CAIU1234567',
      shipping_line: 'MAEU',
    });
    expect(result.shipments[0]).toMatchObject({
      id: 'sr-2',
      shipping_line: 'MSCU',
    });
  });

  it('search_container prioritizes full_out over discharged/arrived status', async () => {
    const client = asClient({
      search: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'container-legacy-1',
            type: 'container',
            attributes: {
              number: 'TIIU1234567',
              shipping_line_name: 'MSCU',
              pod_full_out_at: '2026-02-17T01:00:00Z',
              pod_discharged_at: '2026-02-16T01:00:00Z',
              pod_arrived_at: '2026-02-15T01:00:00Z',
            },
          },
        ],
      }),
    });

    const result = await executeSearchContainer(
      { query: 'TIIU1234567' },
      client,
    );

    expect(result.containers[0]).toMatchObject({
      id: 'container-legacy-1',
      status: 'full_out',
    });
  });

  it('track_container creates tracking request and returns enriched container summary', async () => {
    const createFromInfer = vi.fn().mockResolvedValue({
      infer: { inferred_type: 'container' },
      trackingRequest: {
        included: [{ id: 'container-1', type: 'container' }],
      },
    });

    const getContainer = vi.fn().mockResolvedValue({
      raw: buildContainerRaw('container-1'),
      mapped: { id: 'container-1' },
    });

    const client = asClient({
      createTrackingRequestFromInfer: createFromInfer,
      containers: { get: getContainer },
    });

    const result = await executeTrackContainer(
      { number: 'CAIU1234567', scac: 'MAEU' },
      client,
    );

    expect(createFromInfer).toHaveBeenCalledWith('CAIU1234567', {
      scac: 'MAEU',
      numberType: undefined,
      refNumbers: undefined,
    });
    // get_container now augments the default includes and returns the curated
    // (raw-sourced) summary only — no _mapped bloat.
    expect(getContainer).toHaveBeenCalledWith(
      'container-1',
      ['shipment', 'pod_terminal'],
      { format: 'raw' },
    );
    expect(result.tracking_request_created).toBe(true);
    expect(result.infer_result).toEqual({ inferred_type: 'container' });
    expect(result.container_number).toBe('CAIU1234567');
  });

  it('track_container bypasses infer when container is already tracked via search', async () => {
    const createFromInfer = vi.fn();
    const getContainer = vi.fn().mockResolvedValue({
      raw: buildContainerRaw('container-42'),
      mapped: { id: 'container-42' },
    });

    const client = asClient({
      search: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'container-42',
            type: 'search_result',
            attributes: {
              entity_type: 'container',
              number: 'SELU4039824',
              scac: 'CMDU',
            },
          },
        ],
      }),
      createTrackingRequestFromInfer: createFromInfer,
      containers: { get: getContainer },
    });

    const result = await executeTrackContainer(
      { number: 'SELU4039824' },
      client,
    );

    expect(createFromInfer).not.toHaveBeenCalled();
    expect(getContainer).toHaveBeenCalledWith(
      'container-42',
      ['shipment', 'pod_terminal'],
      { format: 'raw' },
    );
    expect(result.tracking_request_created).toBe(false);
    expect(result.container_number).toBe('CAIU1234567');
    expect(result.infer_result).toMatchObject({
      source: 'search_match',
      selected_scac: 'CMDU',
    });
  });

  it('track_container falls back to direct create when infer endpoint validation fails', async () => {
    const createFromInfer = vi
      .fn()
      .mockRejectedValue(
        new Error('Unprocessable Entity (/data/attributes/number)'),
      );
    const createTrackingRequest = vi.fn().mockResolvedValue({
      included: [{ id: 'container-77', type: 'container' }],
    });
    const getContainer = vi.fn().mockResolvedValue({
      raw: buildContainerRaw('container-77'),
      mapped: { id: 'container-77' },
    });

    const client = asClient({
      createTrackingRequestFromInfer: createFromInfer,
      createTrackingRequest,
      containers: { get: getContainer },
    });

    const result = await executeTrackContainer(
      { number: 'MSCU1234567', numberType: 'container', scac: 'MSCU' },
      client,
    );

    expect(createFromInfer).toHaveBeenCalledTimes(1);
    expect(createTrackingRequest).toHaveBeenCalledWith({
      requestType: 'container',
      requestNumber: 'MSCU1234567',
      scac: 'MSCU',
      refNumbers: undefined,
    });
    expect(result.tracking_request_created).toBe(true);
    expect(result.id).toBe('container-77');
  });

  it('get_container returns stable shape with metadata and events summary', async () => {
    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: buildContainerRaw('container-1'),
          mapped: { id: 'container-1' },
        }),
      },
    });

    const result = await executeGetContainer(
      {
        id: 'container-1',
        include: ['shipment', 'pod_terminal', 'transport_events'],
      },
      client,
    );

    expect(result).toMatchObject({
      id: 'container-1',
      container_number: 'CAIU1234567',
      shipment: { id: 'shipment-1', line: 'MAEU' },
      pod_terminal: { id: 'terminal-1' },
    });
    expect(result.events).toMatchObject({ count: 1, rail_events_count: 1 });
    expect(result._metadata.includes_loaded).toEqual([
      'shipment',
      'pod_terminal',
      'transport_events',
    ]);
  });

  it('get_container surfaces the API current_status as the authoritative headline', async () => {
    const rawContainer = buildContainerRaw('container-status');
    rawContainer.data.attributes.current_status = 'grounded';
    rawContainer.data.attributes.available_for_pickup = false;

    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: rawContainer,
          mapped: { id: 'container-status' },
        }),
      },
    });

    const result = await executeGetContainer(
      { id: 'container-status' },
      client,
    );

    // Headline status is the API value verbatim, not a re-derived label.
    expect(result.status).toBe('grounded');
    expect(result.status_source).toBe('current_status');
    expect(result._metadata.status_is_authoritative).toBe(true);
  });

  it('get_container derives a discharged lifecycle only as steering metadata when API status is absent', async () => {
    const rawContainer = buildContainerRaw('container-discharged');
    delete (rawContainer.data.attributes as any).current_status;
    rawContainer.data.attributes.available_for_pickup = false;
    rawContainer.data.attributes.pod_arrived_at = '2026-02-10T00:00:00Z';
    rawContainer.data.attributes.pod_discharged_at = '2026-02-11T00:00:00Z';
    (rawContainer.data.attributes as any).pod_full_out_at = null;
    (rawContainer.data.attributes as any).delivered_at = null;
    (rawContainer.data.attributes as any).final_destination_full_out_at = null;
    (rawContainer.data.attributes as any).pod_rail_loaded_at = null;

    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: rawContainer,
          mapped: { id: 'container-discharged' },
        }),
      },
    });

    const result = await executeGetContainer(
      { id: 'container-discharged' },
      client,
    );

    expect(result.status).toBe('discharged');
    expect(result.status_source).toBe('derived');
    expect(result._metadata.derived_lifecycle).toBe('discharged');
  });

  it('get_container augments the default includes instead of replacing them', async () => {
    const get = vi.fn().mockResolvedValue({
      raw: buildContainerRaw('container-augment'),
      mapped: { id: 'container-augment' },
    });
    const client = asClient({ containers: { get } });

    const result = await executeGetContainer(
      { id: 'container-augment', include: ['transport_events'] },
      client,
    );

    // shipment + pod_terminal must survive even when only transport_events is requested.
    expect(get).toHaveBeenCalledWith(
      'container-augment',
      ['shipment', 'pod_terminal', 'transport_events'],
      { format: 'raw' },
    );
    expect(result._metadata.includes_loaded).toEqual([
      'shipment',
      'pod_terminal',
      'transport_events',
    ]);
  });

  it('get_container returns real fees + currency and never fabricates a daily rate', async () => {
    const rawContainer = buildContainerRaw('container-fees');
    (rawContainer.data.attributes as any).fees_at_pod_terminal = [
      { type: 'demurrage', amount: 240, currency_code: 'USD' },
    ];

    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: rawContainer,
          mapped: { id: 'container-fees' },
        }),
      },
    });

    const result = await executeGetContainer({ id: 'container-fees' }, client);

    expect(result.demurrage.fees_at_pod_terminal).toEqual([
      { type: 'demurrage', amount: 240, currency_code: 'USD' },
    ]);
    expect(result.demurrage.fees_total_amount).toBe(240);
    expect(result.demurrage.fees_currency_code).toBe('USD');
    expect(JSON.stringify(result.demurrage)).not.toMatch(/\/day/);
    expect(JSON.stringify(result)).not.toMatch(/75-150/);
  });

  it('get_container suppresses demurrage urgency when terminal data is stale', async () => {
    const rawContainer = buildContainerRaw('container-stale');
    (rawContainer.data.attributes as any).pickup_lfd = '2020-01-01';
    (rawContainer.data.attributes as any).terminal_checked_at =
      '2019-01-01T00:00:00Z';

    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: rawContainer,
          mapped: { id: 'container-stale' },
        }),
      },
    });

    const result = await executeGetContainer({ id: 'container-stale' }, client);

    expect(result.demurrage.urgency).toBe('unknown');
    expect(result.demurrage.urgency_suppressed).toBe(true);
  });

  it('get_container suppresses demurrage urgency when the sideloaded shipment has tracking stopped', async () => {
    const rawContainer = buildContainerRaw('container-tracking-stopped');
    // Fresh terminal data + a near-future LFD would normally yield an active
    // urgency; only the shipment-level tracking-stopped flag should suppress it.
    (rawContainer.data.attributes as any).terminal_checked_at =
      new Date().toISOString();
    (rawContainer.data.attributes as any).pickup_lfd = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const shipmentInclude = rawContainer.included.find(
      (item: any) => item.type === 'shipment',
    ) as any;
    shipmentInclude.attributes.line_tracking_stopped_at =
      '2026-01-01T00:00:00Z';
    shipmentInclude.attributes.line_tracking_stopped_reason =
      'all_containers_terminated';

    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: rawContainer,
          mapped: { id: 'container-tracking-stopped' },
        }),
      },
    });

    const result = await executeGetContainer(
      { id: 'container-tracking-stopped' },
      client,
    );

    expect(result.demurrage.urgency).toBe('unknown');
    expect(result.demurrage.urgency_suppressed).toBe(true);
    expect(result.demurrage.urgency_reason).toContain('tracking is stopped');
  });

  it('get_container does NOT suppress urgency when the shipment has no tracking-stopped flag', async () => {
    const rawContainer = buildContainerRaw('container-tracking-active');
    // Same fresh-data + near-future-LFD setup, but the shipment carries no
    // line_tracking_stopped_* — urgency must remain active (not suppressed).
    (rawContainer.data.attributes as any).terminal_checked_at =
      new Date().toISOString();
    (rawContainer.data.attributes as any).pickup_lfd = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: rawContainer,
          mapped: { id: 'container-tracking-active' },
        }),
      },
    });

    const result = await executeGetContainer(
      { id: 'container-tracking-active' },
      client,
    );

    expect(result.demurrage.urgency_suppressed).toBe(false);
    expect(result.demurrage.urgency).toBe('imminent');
  });

  it('get_container does not crash when the shipment is not sideloaded (tracking treated as active)', async () => {
    const rawContainer = buildContainerRaw('container-no-shipment');
    (rawContainer.data.attributes as any).terminal_checked_at =
      new Date().toISOString();
    (rawContainer.data.attributes as any).pickup_lfd = new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    // Drop the sideloaded shipment entirely.
    rawContainer.included = rawContainer.included.filter(
      (item: any) => item.type !== 'shipment',
    );

    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: rawContainer,
          mapped: { id: 'container-no-shipment' },
        }),
      },
    });

    const result = await executeGetContainer(
      { id: 'container-no-shipment' },
      client,
    );

    expect(result.shipment).toBeNull();
    expect(result.demurrage.urgency_suppressed).toBe(false);
    expect(result.demurrage.urgency).toBe('imminent');
  });

  it('get_container surfaces pod_timezone and per-channel LFDs and drops phantom updated_at', async () => {
    const client = asClient({
      containers: {
        get: vi.fn().mockResolvedValue({
          raw: buildContainerRaw('container-tz'),
          mapped: { id: 'container-tz' },
        }),
      },
    });

    const result = await executeGetContainer({ id: 'container-tz' }, client);

    expect(result.location.pod_timezone).toBe('America/Los_Angeles');
    expect(result.demurrage.last_free_days).toEqual({
      terminal: '2099-01-10T00:00:00Z',
      rail: null,
      line: '2099-01-12T00:00:00Z',
    });
    expect(result.equipment.length).toBe(40);
    expect((result as any).updated_at).toBeUndefined();
    expect((result as any)._mapped).toBeUndefined();
  });

  it('get_shipment_details returns shipment summary and container list', async () => {
    const shipmentsGet = vi.fn().mockResolvedValue({
      raw: buildShipmentRaw(),
      mapped: { id: 'shipment-1' },
    });
    const client = asClient({ shipments: { get: shipmentsGet } });

    const result = await executeGetShipmentDetails(
      { id: 'shipment-1', include_containers: true },
      client,
    );

    // Curated summary only: no _mapped bloat, so we request raw (not both).
    expect(shipmentsGet).toHaveBeenCalledWith('shipment-1', true, {
      format: 'raw',
    });
    expect(result).toMatchObject({
      id: 'shipment-1',
      bill_of_lading: 'MAEU123',
      shipping_line: { scac: 'MAEU', name: 'Maersk' },
      containers: { count: 1 },
    });
    expect(result._mapped).toBeUndefined();
  });

  it('get_container_transport_events returns timeline and milestone summary', async () => {
    const events = vi.fn().mockResolvedValue({
      raw: {
        data: [
          {
            id: 'evt-2',
            type: 'transport_event',
            attributes: {
              event: 'container.transport.vessel_departed',
              timestamp: '2025-01-02T00:00:00Z',
            },
            relationships: {
              location: { data: { id: 'loc-1', type: 'port' } },
            },
          },
          {
            id: 'evt-1',
            type: 'transport_event',
            attributes: {
              event: 'container.transport.vessel_loaded',
              timestamp: '2025-01-01T00:00:00Z',
            },
            relationships: {
              location: { data: { id: 'loc-1', type: 'port' } },
            },
          },
        ],
        included: [
          {
            id: 'loc-1',
            type: 'port',
            attributes: { name: 'Shanghai', locode: 'CNSHA' },
          },
        ],
      },
      mapped: [{ id: 'evt-1' }, { id: 'evt-2' }],
    });

    const client = asClient({
      containers: {
        events,
      },
    });

    const result = await executeGetContainerTransportEvents(
      { id: 'container-1' },
      client,
    );

    expect(events).toHaveBeenCalledWith('container-1', { format: 'raw' });
    expect(result.summary.total_events).toBe(2);
    expect(result.summary.timeline[0]).toMatchObject({
      event: 'container.transport.vessel_loaded',
    });
    expect(result.summary.milestones).toMatchObject({
      vessel_loaded_at: '2025-01-01T00:00:00.000Z',
      vessel_departed_at: '2025-01-02T00:00:00.000Z',
    });
  });

  it('get_container_transport_events returns empty summary when events fetch fails', async () => {
    const client = asClient({
      containers: {
        events: vi.fn().mockRejectedValue(new Error('Not Found')),
      },
    });

    const result = await executeGetContainerTransportEvents(
      { id: 'container-1' },
      client,
    );

    expect(result.total_events).toBe(0);
    expect(result.timeline).toEqual([]);
    expect(result._metadata).toMatchObject({
      error: 'Not Found',
    });
  });

  it('search_container handles partially missing fields safely', async () => {
    const client = asClient({
      search: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'sr-3',
            type: 'search_result',
            attributes: {
              entity_type: 'container',
              number: null,
              shipping_line: null,
            },
          },
          {
            id: 'sr-4',
            type: 'search_result',
            attributes: {
              entity_type: 'shipment',
              ref_numbers: null,
              shipping_line: null,
              containers_count: null,
            },
          },
        ],
      }),
    });

    const result = await executeSearchContainer({ query: 'XX' }, client);

    expect(result.total_results).toBe(2);
    expect(result.containers[0]).toMatchObject({
      id: 'sr-3',
      container_number: 'Unknown',
      status: 'unknown',
      shipping_line: 'Unknown',
    });
    expect(result.shipments[0]).toMatchObject({
      id: 'sr-4',
      ref_numbers: [],
      container_count: 0,
      shipping_line: 'Unknown',
    });
  });

  it('track_container returns pending guidance when container is not yet linked', async () => {
    const createFromInfer = vi.fn().mockResolvedValue({
      infer: { inferred_type: 'container' },
      trackingRequest: {
        data: { type: 'tracking_request', id: 'tr-1' },
      },
    });

    const getContainer = vi.fn();
    const client = asClient({
      createTrackingRequestFromInfer: createFromInfer,
      containers: { get: getContainer },
    });

    const result = await executeTrackContainer(
      { number: 'TEMU8347291', scac: 'TEMU' },
      client,
    );

    expect(createFromInfer).toHaveBeenCalledWith('TEMU8347291', {
      scac: 'TEMU',
      numberType: undefined,
      refNumbers: undefined,
    });
    expect(getContainer).not.toHaveBeenCalled();
    expect(result.tracking_request_created).toBe(true);
    expect(result.tracking_request).toMatchObject({
      request_number: 'TEMU8347291',
      number_type: 'container',
      scac: 'TEMU',
    });
    expect(result._metadata).toMatchObject({
      presentation_guidance:
        'Tracking request was created, but no container is linked yet. Poll list_tracking_requests or retry in a short while.',
    });
  });

  it('get_supported_shipping_lines filters response by search term', async () => {
    const shippingList = vi.fn().mockResolvedValue([
      { scac: 'MSCU', name: 'MSC', shortName: 'MSC' },
      { scac: 'MAEU', name: 'Maersk', shortName: 'Maersk' },
    ]);

    const client = asClient({
      shippingLines: { list: shippingList },
    });

    const result = await executeSupportedShippingLines(
      { search: 'mae' },
      client,
    );

    expect(shippingList).toHaveBeenCalledWith(undefined, { format: 'mapped' });
    expect(result.total_lines).toBe(1);
    expect(result.shipping_lines[0]).toMatchObject({
      scac: 'MAEU',
      name: 'Maersk',
    });
  });

  it('get_supported_shipping_lines fails when shipping_lines API call fails', async () => {
    const shippingList = vi
      .fn()
      .mockRejectedValue(new Error('downstream failure'));

    const client = asClient({
      shippingLines: { list: shippingList },
    });

    await expect(
      executeSupportedShippingLines({ search: 'mae' }, client),
    ).rejects.toThrow('downstream failure');
  });

  it('get_supported_shipping_lines does not reuse module cache across different clients', async () => {
    vi.resetModules();
    const { executeGetSupportedShippingLines } =
      await import('./get-supported-shipping-lines.js');

    const listForClientA = vi
      .fn()
      .mockResolvedValue([{ scac: 'MSCU', name: 'MSC', shortName: 'MSC' }]);
    const listForClientB = vi
      .fn()
      .mockResolvedValue([
        { scac: 'MAEU', name: 'Maersk', shortName: 'Maersk' },
      ]);

    const clientA = asClient({ shippingLines: { list: listForClientA } });
    const clientB = asClient({ shippingLines: { list: listForClientB } });

    const resultA = await executeGetSupportedShippingLines({}, clientA);
    const resultB = await executeGetSupportedShippingLines({}, clientB);

    expect(listForClientA).toHaveBeenCalledTimes(1);
    expect(listForClientB).toHaveBeenCalledTimes(1);
    expect(resultA.shipping_lines[0]?.scac).toBe('MSCU');
    expect(resultB.shipping_lines[0]?.scac).toBe('MAEU');
  });

  it('get_container_route returns route summary when route data exists', async () => {
    const client = asClient({
      containers: {
        route: vi.fn().mockResolvedValue({
          raw: {
            data: {
              id: 'route-1',
              type: 'route',
              attributes: {
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-02T00:00:00Z',
              },
              relationships: {
                route_locations: {
                  data: [{ id: 'rl-1', type: 'route_location' }],
                },
              },
            },
            included: [
              {
                id: 'rl-1',
                type: 'route_location',
                attributes: {
                  inbound_mode: 'vessel',
                  outbound_mode: 'vessel',
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
                },
              },
            ],
          },
          mapped: { id: 'route-1' },
        }),
      },
    });

    const result = await executeGetContainerRoute(
      { id: 'container-1' },
      client,
    );

    expect(result.route_id).toBe('route-1');
    expect(result.total_legs).toBe(1);
    expect(result.route_locations[0].port).toMatchObject({ code: 'USLAX' });
  });

  it('get_container_route returns feature-not-enabled contract instead of throwing', async () => {
    const client = asClient({
      containers: {
        route: vi
          .fn()
          .mockRejectedValue(new FeatureNotEnabledError('feature not enabled')),
      },
    });

    const result = await executeGetContainerRoute(
      { id: 'container-1' },
      client,
    );

    expect(result).toMatchObject({
      error: 'FeatureNotEnabled',
      alternative: expect.stringContaining('get_container_transport_events'),
    });
  });

  it('list_shipments forwards filters and pagination to SDK', async () => {
    const list = vi.fn().mockResolvedValue({ items: [{ id: 'shipment-1' }] });
    const client = asClient({ shipments: { list } });

    const result = await executeListShipments(
      {
        status: 'in_transit',
        carrier: 'MAEU',
        page: 2,
        page_size: 25,
      },
      client,
    );

    expect(list).toHaveBeenCalledWith(
      {
        status: 'in_transit',
        port: undefined,
        carrier: 'MAEU',
        updatedAfter: undefined,
        includeContainers: undefined,
      },
      { format: 'mapped', page: 2, pageSize: 25 },
    );
    expect(result.items).toHaveLength(1);
  });

  it('list_containers forwards filters and pagination to SDK', async () => {
    const list = vi.fn().mockResolvedValue({ items: [{ id: 'container-1' }] });
    const client = asClient({ containers: { list } });

    const result = await executeListContainers(
      {
        status: 'available_for_pickup',
        include: 'shipment,pod_terminal',
        page: 1,
        page_size: 50,
      },
      client,
    );

    expect(list).toHaveBeenCalledWith(
      {
        status: 'available_for_pickup',
        port: undefined,
        carrier: undefined,
        updatedAfter: undefined,
        include: ['shipment', 'pod_terminal'],
      },
      { format: 'mapped', page: 1, pageSize: 50 },
    );
    expect(result.items).toHaveLength(1);
  });

  it('list_containers normalizes include values', async () => {
    const list = vi.fn().mockResolvedValue({ items: [{ id: 'container-2' }] });
    const client = asClient({ containers: { list } });

    const result = await executeListContainers(
      {
        include: '   ',
        page: 1,
        page_size: 10,
      },
      client,
    );

    expect(list).toHaveBeenCalledWith(
      {
        status: undefined,
        port: undefined,
        carrier: undefined,
        updatedAfter: undefined,
        include: undefined,
      },
      { format: 'mapped', page: 1, pageSize: 10 },
    );
    expect(result.items).toHaveLength(1);
  });

  it('list_tracking_requests forwards filters and pagination to SDK', async () => {
    const list = vi.fn().mockResolvedValue({ items: [{ id: 'tr-1' }] });
    const client = asClient({
      trackingRequests: { list },
    });

    const result = await executeListTrackingRequests(
      {
        filters: { 'filter[status]': 'failed' },
        status: 'succeeded',
        page: 3,
        page_size: 10,
      },
      client,
    );

    expect(list).toHaveBeenCalledWith(
      { 'filter[status]': 'succeeded' },
      { format: 'mapped', page: 3, pageSize: 10 },
    );
    expect(result.items).toHaveLength(1);
  });

  it('list_tracking_requests maps status and request_type args to filter keys', async () => {
    const list = vi.fn().mockResolvedValue({ items: [{ id: 'tr-2' }] });
    const client = asClient({
      trackingRequests: { list },
    });

    const result = await executeListTrackingRequests(
      {
        status: 'failed',
        request_type: 'manual',
      },
      client,
    );

    expect(list).toHaveBeenCalledWith(
      {
        'filter[status]': 'failed',
        'filter[request_type]': 'manual',
      },
      { format: 'mapped', page: undefined, pageSize: undefined },
    );
    expect(result.items).toHaveLength(1);
  });
});
