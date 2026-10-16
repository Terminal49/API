import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client } from './client.js';
import { mapContainerRoute } from './client/mappers.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

function fixturePath(name: string) {
  return path.resolve(fixturesDir, `${name}.json`);
}

function loadFixture<T = any>(name: string): T {
  const raw = fs.readFileSync(fixturePath(name), 'utf-8');
  return JSON.parse(raw) as T;
}

function findIncluded(
  doc: any,
  type: string,
  id: string | undefined,
): any | null {
  if (!id) return null;
  const included = Array.isArray(doc?.included) ? doc.included : [];
  return (
    included.find((item: any) => item.type === type && item.id === id) || null
  );
}

function getShippingLineScac(item: any) {
  return item?.attributes?.scac || item?.scac;
}

function expectIfDefined(actual: unknown, expected: unknown) {
  if (expected !== undefined && expected !== null) {
    expect(actual).toBe(expected);
  }
}

describe('Terminal49Client mapping helpers', () => {
  it('maps shipping lines with optional fields', async () => {
    const fixture = loadFixture('shipping-lines.list');
    const { fetchImpl } = createMockFetch({
      '/shipping_lines': () => jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.listShippingLines(undefined, {
      format: 'mapped',
    })) as any[];

    const expectedScacs = (fixture?.data || [])
      .map(getShippingLineScac)
      .filter(Boolean);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(expectedScacs.length);

    const resultScacs = result.map((item) => item.scac);
    for (const scac of resultScacs) {
      expect(expectedScacs).toContain(scac);
    }

    const first = fixture?.data?.[0];
    const firstScac = getShippingLineScac(first);
    const firstName =
      first?.attributes?.name || first?.attributes?.full_name || firstScac;
    expectIfDefined(result[0]?.scac, firstScac);
    expectIfDefined(result[0]?.name, firstName);

    const withShort = fixture?.data?.find(
      (item: any) => item?.attributes?.short_name || item?.attributes?.nickname,
    );
    if (withShort) {
      const shortScac = getShippingLineScac(withShort);
      const mapped = result.find((item) => item.scac === shortScac);
      const expectedShort =
        withShort.attributes?.short_name || withShort.attributes?.nickname;
      expect(mapped?.shortName).toBe(expectedShort);
    }

    const withBolPrefix = fixture?.data?.find(
      (item: any) => item?.attributes?.bol_prefix,
    );
    if (withBolPrefix) {
      const bolScac = getShippingLineScac(withBolPrefix);
      const mapped = result.find((item) => item.scac === bolScac);
      expect(mapped?.bolPrefix).toBe(withBolPrefix.attributes?.bol_prefix);
    }

    const withNotes = fixture?.data?.find(
      (item: any) => item?.attributes?.notes,
    );
    if (withNotes) {
      const noteScac = getShippingLineScac(withNotes);
      const mapped = result.find((item) => item.scac === noteScac);
      expect(mapped?.notes).toBe(withNotes.attributes?.notes);
    }
  });

  it('maps the tracked_object shipment on a tracking request', async () => {
    const fixture = loadFixture('tracking-requests.get.base');
    const { fetchImpl } = createMockFetch({
      '/tracking_requests/tracking_request-1': () => jsonResponse(fixture),
    });
    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.getTrackingRequest('tracking_request-1', {
      format: 'mapped',
    })) as any;

    expect(result).toMatchObject({
      id: 'tracking_request-1',
      requestType: 'bill_of_lading',
      requestNumber: 'HLCUSEL251063157',
      status: 'created',
      scac: 'HLCU',
      refNumbers: [],
    });
    expect(result.shipment).toEqual({
      id: 'shipment-1',
      billOfLading: 'HLCUSEL251063ad5',
      shippingLineScac: 'HLCU',
    });
  });

  it('maps tracked_object shipments on each listed tracking request', async () => {
    const fixture = loadFixture('tracking-requests.list');
    const { fetchImpl } = createMockFetch({
      '/tracking_requests': () => jsonResponse(fixture),
    });
    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.listTrackingRequests(
      {},
      { format: 'mapped' },
    )) as any;

    expect(result.items.map((item: any) => item.shipment)).toEqual([
      {
        id: 'shipment-1',
        billOfLading: 'HLCUSEL251063ad5',
        shippingLineScac: 'HLCU',
      },
    ]);
  });

  it('keeps the tracked shipment id when the shipment is not included', async () => {
    const { fetchImpl } = createMockFetch({
      '/tracking_requests/tr-1': () =>
        jsonResponse({
          data: {
            id: 'tr-1',
            type: 'tracking_request',
            attributes: { request_number: 'MSCU1234567' },
            relationships: {
              tracked_object: { data: { type: 'shipment', id: 'ship-1' } },
            },
          },
        }),
      '/tracking_requests/tr-2': () =>
        jsonResponse({
          data: {
            id: 'tr-2',
            type: 'tracking_request',
            attributes: { request_number: 'MSCU7654321', status: 'pending' },
            relationships: { tracked_object: { data: null } },
          },
        }),
    });
    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const tracked = (await client.getTrackingRequest('tr-1', {
      format: 'mapped',
    })) as any;
    const pending = (await client.getTrackingRequest('tr-2', {
      format: 'mapped',
    })) as any;

    expect(tracked.shipment).toEqual({ id: 'ship-1' });
    expect(pending.shipment).toBeNull();
  });

  it('maps shipment ports, terminals, tracking, and container references', async () => {
    const fixture = loadFixture('shipments.get.include');
    const shipmentId = fixture?.data?.id || 'ship-1';
    const { fetchImpl } = createMockFetch({
      [`/shipments/${shipmentId}?include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal`]:
        () => jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.getShipment(shipmentId, true, {
      format: 'mapped',
    })) as any;

    const attrs = fixture?.data?.attributes || {};
    const relationships = fixture?.data?.relationships || {};

    const expectedBill =
      attrs.bill_of_lading_number || attrs.bill_of_lading || attrs.bl_number;
    expectIfDefined(result.billOfLading, expectedBill);
    expectIfDefined(result.shippingLineScac, attrs.shipping_line_scac);
    expectIfDefined(result.customerName, attrs.customer_name);

    if (Array.isArray(attrs.ref_numbers)) {
      expect(result.refNumbers).toEqual(attrs.ref_numbers);
    }
    if (Array.isArray(attrs.tags)) {
      expect(result.tags).toEqual(attrs.tags);
    }

    expectIfDefined(
      result.tracking?.lineTrackingLastAttemptedAt,
      attrs.line_tracking_last_attempted_at,
    );
    expectIfDefined(
      result.tracking?.lineTrackingLastSucceededAt,
      attrs.line_tracking_last_succeeded_at,
    );
    expectIfDefined(
      result.tracking?.lineTrackingStoppedAt,
      attrs.line_tracking_stopped_at,
    );
    expectIfDefined(
      result.tracking?.lineTrackingStoppedReason,
      attrs.line_tracking_stopped_reason,
    );

    expectIfDefined(result.vesselAtPod?.name, attrs.pod_vessel_name);
    expectIfDefined(result.vesselAtPod?.imo, attrs.pod_vessel_imo);
    expectIfDefined(result.vesselAtPod?.voyageNumber, attrs.pod_voyage_number);

    const polRef = relationships.port_of_lading?.data;
    const podRef = relationships.port_of_discharge?.data;
    const _destRef = relationships.destination?.data;
    const podTerminalRef = relationships.pod_terminal?.data;
    const destinationTerminalRef = relationships.destination_terminal?.data;
    const containerRef = relationships.containers?.data?.[0];

    const pol = polRef ? findIncluded(fixture, polRef.type, polRef.id) : null;
    if (pol) {
      expectIfDefined(
        result.ports?.portOfLading?.locode,
        pol.attributes?.locode,
      );
      expectIfDefined(result.ports?.portOfLading?.name, pol.attributes?.name);
      expectIfDefined(result.ports?.portOfLading?.code, pol.attributes?.code);
      expectIfDefined(
        result.ports?.portOfLading?.countryCode,
        pol.attributes?.country_code,
      );
    }
    expectIfDefined(result.ports?.portOfLading?.etd, attrs.pol_etd_at);
    expectIfDefined(result.ports?.portOfLading?.atd, attrs.pol_atd_at);
    expectIfDefined(result.ports?.portOfLading?.timezone, attrs.pol_timezone);

    const podTerminal = podTerminalRef
      ? findIncluded(fixture, podTerminalRef.type, podTerminalRef.id)
      : null;
    if (podTerminal) {
      expectIfDefined(
        result.ports?.portOfDischarge?.terminal?.id,
        podTerminal.id,
      );
      expectIfDefined(
        result.ports?.portOfDischarge?.terminal?.name,
        podTerminal.attributes?.name,
      );
      expectIfDefined(
        result.ports?.portOfDischarge?.terminal?.nickname,
        podTerminal.attributes?.nickname,
      );
      expectIfDefined(
        result.ports?.portOfDischarge?.terminal?.firmsCode,
        podTerminal.attributes?.firms_code,
      );
    }

    if (podRef) {
      const portOfDischarge = findIncluded(fixture, podRef.type, podRef.id);
      if (portOfDischarge) {
        expectIfDefined(
          result.ports?.portOfDischarge?.locode,
          portOfDischarge.attributes?.locode,
        );
        expectIfDefined(
          result.ports?.portOfDischarge?.name,
          portOfDischarge.attributes?.name,
        );
        expectIfDefined(
          result.ports?.portOfDischarge?.code,
          portOfDischarge.attributes?.code,
        );
        expectIfDefined(
          result.ports?.portOfDischarge?.countryCode,
          portOfDischarge.attributes?.country_code,
        );
      }
    }
    expectIfDefined(result.ports?.portOfDischarge?.eta, attrs.pod_eta_at);
    expectIfDefined(result.ports?.portOfDischarge?.ata, attrs.pod_ata_at);
    expectIfDefined(
      result.ports?.portOfDischarge?.originalEta,
      attrs.pod_original_eta_at,
    );
    expectIfDefined(
      result.ports?.portOfDischarge?.timezone,
      attrs.pod_timezone,
    );

    if (attrs.destination_locode) {
      expectIfDefined(
        result.ports?.destination?.locode,
        attrs.destination_locode,
      );
      expectIfDefined(result.ports?.destination?.name, attrs.destination_name);
      expectIfDefined(result.ports?.destination?.eta, attrs.destination_eta_at);
      expectIfDefined(result.ports?.destination?.ata, attrs.destination_ata_at);
      expectIfDefined(
        result.ports?.destination?.timezone,
        attrs.destination_timezone,
      );
    }

    const destinationTerminal = destinationTerminalRef
      ? findIncluded(
          fixture,
          destinationTerminalRef.type,
          destinationTerminalRef.id,
        )
      : null;
    if (destinationTerminal) {
      expectIfDefined(
        result.ports?.destination?.terminal?.id,
        destinationTerminal.id,
      );
      expectIfDefined(
        result.ports?.destination?.terminal?.name,
        destinationTerminal.attributes?.name,
      );
      expectIfDefined(
        result.ports?.destination?.terminal?.nickname,
        destinationTerminal.attributes?.nickname,
      );
      expectIfDefined(
        result.ports?.destination?.terminal?.firmsCode,
        destinationTerminal.attributes?.firms_code,
      );
    }

    const container = containerRef
      ? findIncluded(fixture, containerRef.type, containerRef.id)
      : null;
    if (container) {
      expectIfDefined(
        result.containers?.[0]?.number,
        container.attributes?.number || container.attributes?.container_number,
      );
    }
  });

  it('maps containers.get and containers.update in mapped and both formats', async () => {
    const fixture = loadFixture('containers.get.include');
    const { fetchImpl } = createMockFetch({
      '/containers/container-1?include=shipment,pod_terminal,pickup_facility':
        () => jsonResponse(fixture),
      '/containers/container-1': () => jsonResponse(fixture),
    });
    const mappedClient = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
      defaultFormat: 'mapped',
    });

    const mapped = await mappedClient.containers.get('container-1');
    const both = await mappedClient.containers.get('container-1', undefined, {
      format: 'both',
    });
    const updated = await mappedClient.containers.update('container-1', {
      ref_numbers: ['REF-1'],
    });

    const expected = {
      id: 'container-1',
      number: 'RMCU74210c6',
      currentStatus: 'picked_up',
      equipment: expect.objectContaining({ type: 'tank' }),
      shipment: expect.objectContaining({ id: 'shipment-1' }),
      terminals: expect.objectContaining({
        podTerminal: expect.objectContaining({ id: 'terminal-1' }),
        destinationTerminal: null,
      }),
    };
    expect(mapped).toMatchObject(expected);
    expect(updated).toMatchObject(expected);
    expect(both.raw).toEqual(fixture);
    expect(both.mapped).toMatchObject(expected);
  });

  it('maps container list items from base fixture', async () => {
    const fixture = loadFixture('containers.list');
    const { fetchImpl } = createMockFetch({
      '/containers?include=shipment,pod_terminal,pickup_facility': () =>
        jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.listContainers(
      {},
      { format: 'mapped' },
    )) as any;

    const firstItem = fixture?.data?.[0];
    expect(result.items.length).toBe(fixture.data.length);
    expectIfDefined(result.items[0]?.id, firstItem?.id);

    const attrs = firstItem?.attributes || {};
    expectIfDefined(
      result.items[0]?.number,
      attrs.number || attrs.container_number,
    );
    expectIfDefined(result.items[0]?.status, attrs.status);
    expectIfDefined(result.items[0]?.currentStatus, attrs.current_status);
    expectIfDefined(result.items[0]?.sealNumber, attrs.seal_number);

    expectIfDefined(result.items[0]?.equipment?.type, attrs.equipment_type);
    expectIfDefined(result.items[0]?.equipment?.length, attrs.equipment_length);
    expectIfDefined(result.items[0]?.equipment?.height, attrs.equipment_height);
    expectIfDefined(result.items[0]?.equipment?.weightLbs, attrs.weight_in_lbs);

    expectIfDefined(
      result.items[0]?.location?.currentLocation,
      attrs.location_at_pod_terminal,
    );
    expectIfDefined(
      result.items[0]?.location?.availableForPickup,
      attrs.available_for_pickup,
    );
    expectIfDefined(
      result.items[0]?.location?.podArrivedAt,
      attrs.pod_arrived_at,
    );
    expectIfDefined(
      result.items[0]?.location?.podDischargedAt,
      attrs.pod_discharged_at,
    );

    expectIfDefined(result.items[0]?.demurrage?.pickupLfd, attrs.pickup_lfd);
    expectIfDefined(
      result.items[0]?.demurrage?.pickupAppointmentAt,
      attrs.pickup_appointment_at,
    );
    if (Array.isArray(attrs.fees_at_pod_terminal)) {
      expect(result.items[0]?.demurrage?.fees).toEqual(
        attrs.fees_at_pod_terminal,
      );
    }
    if (Array.isArray(attrs.holds_at_pod_terminal)) {
      expect(result.items[0]?.demurrage?.holds).toEqual(
        attrs.holds_at_pod_terminal,
      );
    }

    expectIfDefined(
      result.items[0]?.rail?.podRailCarrierScac,
      attrs.pod_rail_carrier_scac,
    );
    expectIfDefined(
      result.items[0]?.rail?.indRailCarrierScac,
      attrs.ind_rail_carrier_scac,
    );
    expectIfDefined(
      result.items[0]?.rail?.podRailLoadedAt,
      attrs.pod_rail_loaded_at,
    );
    expectIfDefined(
      result.items[0]?.rail?.podRailDepartedAt,
      attrs.pod_rail_departed_at,
    );
    expectIfDefined(
      result.items[0]?.rail?.indRailArrivedAt,
      attrs.ind_rail_arrived_at,
    );
    expectIfDefined(
      result.items[0]?.rail?.indRailUnloadedAt,
      attrs.ind_rail_unloaded_at,
    );
    expectIfDefined(result.items[0]?.rail?.indEtaAt, attrs.ind_eta_at);
    expectIfDefined(result.items[0]?.rail?.indAtaAt, attrs.ind_ata_at);

    expect(result.items[0]?.shipment).toBeNull();
    expect(result.items[0]?.terminals?.podTerminal).toBeNull();
    expect(result.items[0]?.events).toEqual([]);
  });

  it('returns empty lists when container or shipment list data is not an array', async () => {
    const { fetchImpl } = createMockFetch({
      '/containers?include=shipment,pod_terminal,pickup_facility': () =>
        jsonResponse({ data: {} }),
      '/shipments?include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal':
        () => jsonResponse({ data: {} }),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const containers = (await client.listContainers(
      {},
      { format: 'mapped' },
    )) as any;
    const shipments = (await client.listShipments(
      {},
      { format: 'mapped' },
    )) as any;

    expect(containers.items).toEqual([]);
    expect(shipments.items).toEqual([]);
  });

  it('maps the map_geojson route into ordered ports and the current vessel', async () => {
    const fixture = loadFixture('containers.map_geojson');
    const { fetchImpl } = createMockFetch({
      '/containers/cont-1/map_geojson': () => jsonResponse(fixture),
    });
    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = await client.containers.route('cont-1', {
      format: 'mapped',
    });

    expect(result).toEqual({
      ports: [
        {
          locationId: 'c5adae24-6fd4-4720-8813-976cf206feb1',
          name: 'Laem Chabang',
          countryCode: 'TH',
          label: 'POL',
          sequence: 1,
          coordinates: { longitude: 100.896831042, latitude: 13.065302386 },
          inbound: { eta: null, ata: null },
          outbound: { etd: null, atd: '2025-11-08T00:44:52Z' },
        },
        {
          locationId: 'ed64d446-9098-420c-ab08-c127e62509fe',
          name: 'Xiamen',
          countryCode: 'CN',
          label: 'TS1',
          sequence: 2,
          coordinates: { longitude: 118.0293, latitude: 24.50318 },
          inbound: { eta: null, ata: '2025-11-15T16:00:00Z' },
          outbound: { etd: null, atd: '2025-11-19T16:00:00Z' },
        },
        {
          locationId: '6129528d-846e-4571-ae16-b5328a4285ab',
          name: 'Savannah',
          countryCode: 'US',
          label: 'POD',
          sequence: 3,
          coordinates: { longitude: -81.140998396, latitude: 32.128923976 },
          inbound: { eta: '2025-12-31T05:00:00Z', ata: null },
          outbound: { etd: null, atd: null },
        },
      ],
      currentVessel: {
        name: 'ZIM BANGKOK',
        imo: '9936525',
        voyage: '13E',
        coordinates: { longitude: -131.128473333, latitude: 31.023033333 },
        heading: 108,
        speed: 21,
        positionAt: '2025-12-11T11:46:03Z',
        departurePort: {
          locationId: 'ed64d446-9098-420c-ab08-c127e62509fe',
          name: 'Xiamen',
          label: 'TS1',
        },
        arrivalPort: {
          locationId: '6129528d-846e-4571-ae16-b5328a4285ab',
          name: 'Savannah',
          label: 'POD',
        },
      },
      totalPorts: 3,
    });
  });

  it('keeps the GeoJSON body as the raw half, and map() still returns GeoJSON', async () => {
    const fixture = loadFixture('containers.map_geojson');
    const { fetchImpl, calls } = createMockFetch({
      '/containers/cont-1/map_geojson': () => jsonResponse(fixture),
    });
    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const both = await client.containers.route('cont-1', { format: 'both' });
    const viaMap = await client.containers.map('cont-1', { format: 'mapped' });
    const viaMapBoth = await client.containers.map('cont-1', {
      format: 'both',
    });

    expect(both.raw).toEqual(fixture);
    expect(viaMap).toEqual(fixture);
    expect(viaMapBoth).toEqual({ raw: fixture, mapped: fixture });
    expect(calls.map((c) => c.url.pathname)).toEqual([
      '/v2/containers/cont-1/map_geojson',
      '/v2/containers/cont-1/map_geojson',
      '/v2/containers/cont-1/map_geojson',
    ]);
  });

  it('orders ports by sequence and maps absent properties to null', () => {
    const result = mapContainerRoute({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-81.1, 32.1] },
          properties: { feature_type: 'port', ports_sequence: 2, name: 'B' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [1, 2],
              [3, 4],
            ],
          },
          properties: { feature_type: 'port' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [] },
          properties: { feature_type: 'port', ports_sequence: 1, name: 'A' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [10, 20] },
          properties: { feature_type: 'current_vessel' },
        },
      ],
    });

    expect(result.ports.map((p) => p.name)).toEqual(['A', 'B', null]);
    expect(result.ports[0].coordinates).toBeNull();
    expect(result.ports[2]).toEqual({
      locationId: null,
      name: null,
      countryCode: null,
      label: null,
      sequence: null,
      coordinates: null,
      inbound: { eta: null, ata: null },
      outbound: { etd: null, atd: null },
    });
    expect(result.currentVessel).toEqual({
      name: null,
      imo: null,
      voyage: null,
      coordinates: { longitude: 10, latitude: 20 },
      heading: null,
      speed: null,
      positionAt: null,
      departurePort: { locationId: null, name: null, label: null },
      arrivalPort: { locationId: null, name: null, label: null },
    });
    expect(result.totalPorts).toBe(3);
  });

  it('maps an empty FeatureCollection to an empty route', () => {
    expect(
      mapContainerRoute({ type: 'FeatureCollection', features: [] }),
    ).toEqual({ ports: [], currentVessel: null, totalPorts: 0 });
  });

  it('maps port `code` into the shipment locode fields', async () => {
    const fixture = loadFixture('shipments.get.include');
    const shipmentId = fixture?.data?.id || 'ship-1';
    const { fetchImpl } = createMockFetch({
      [`/shipments/${shipmentId}?include=containers,pod_terminal,port_of_lading,port_of_discharge,destination,destination_terminal`]:
        () => jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.getShipment(shipmentId, true, {
      format: 'mapped',
    })) as any;

    const relationships = fixture?.data?.relationships || {};
    const polRef = relationships.port_of_lading?.data;
    const pol = polRef ? findIncluded(fixture, polRef.type, polRef.id) : null;

    if (pol?.attributes?.code) {
      // Port resources expose `code` (e.g. KRPUS), never `locode`.
      expect(pol.attributes.locode).toBeUndefined();
      expect(result.ports?.portOfLading?.locode).toBe(pol.attributes.code);
      expect(result.ports?.portOfLading?.code).toBe(pol.attributes.code);
    }

    const podRef = relationships.port_of_discharge?.data;
    const pod = podRef ? findIncluded(fixture, podRef.type, podRef.id) : null;
    if (pod?.attributes?.code) {
      expect(result.ports?.portOfDischarge?.locode).toBe(pod.attributes.code);
      expect(result.ports?.portOfDischarge?.code).toBe(pod.attributes.code);
    }
  });

  it('maps container current_status and pickup_facility from real paths', async () => {
    const fixture = loadFixture('containers.get.pickup');
    const { fetchImpl } = createMockFetch({
      '/containers?include=shipment,pod_terminal,pickup_facility': () =>
        jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const list = (await client.listContainers(
      { include: 'shipment,pod_terminal,pickup_facility' },
      { format: 'mapped' },
    )) as any;
    const result = list.items[0];

    const item = fixture.data[0];
    const attrs = item.attributes;

    // status must come from current_status (there is no `status` attribute).
    expect(attrs.status).toBeUndefined();
    expect(result.status).toBe(attrs.current_status);
    expect(result.currentStatus).toBe(attrs.current_status);

    // pod terminal resolves as before.
    expect(result.terminals?.podTerminal?.name).toBe('APM Terminals Pier 400');
    expect(result.terminals?.podTerminal?.firmsCode).toBe('Y258');

    // pickup_facility (the real inland/destination facility relationship) must
    // be surfaced; the legacy non-existent `destination_terminal` relationship
    // never resolves anything.
    const pickupRef = item.relationships.pickup_facility?.data;
    const pickup = findIncluded(fixture, 'terminal', pickupRef?.id);
    expect(pickup).toBeTruthy();
    expect(result.terminals?.destinationTerminal?.name).toBe(
      pickup.attributes.name,
    );
    expect(result.terminals?.destinationTerminal?.firmsCode).toBe(
      pickup.attributes.firms_code,
    );

    expect(result.equipment?.type).toBe(attrs.equipment_type);
    expect(result.location?.availableForPickup).toBe(
      attrs.available_for_pickup,
    );
    expect(result.demurrage?.pickupLfd).toBe(attrs.pickup_lfd);
  });

  it('does not let the raw-attr spread clobber curated nested fields', async () => {
    const fixture = loadFixture('containers.get.pickup');
    const { fetchImpl } = createMockFetch({
      '/containers?include=shipment,pod_terminal,pickup_facility': () =>
        jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const list = (await client.listContainers(
      { include: 'shipment,pod_terminal,pickup_facility' },
      { format: 'mapped' },
    )) as any;
    const result = list.items[0];

    // Curated nests must remain structured objects, never overwritten by the
    // flat camelCased raw attributes (e.g. an `equipment*` scalar must not
    // replace the curated `equipment` object).
    expect(typeof result.equipment).toBe('object');
    expect(result.equipment).not.toBeNull();
    expect(typeof result.location).toBe('object');
    expect(typeof result.demurrage).toBe('object');
    expect(typeof result.rail).toBe('object');
    expect(typeof result.terminals).toBe('object');

    // The flattened raw scalars that feed curated nests should not also appear
    // as top-level duplicate keys.
    expect(result).not.toHaveProperty('equipmentType');
    expect(result).not.toHaveProperty('equipmentLength');
    expect(result).not.toHaveProperty('availableForPickup');
    expect(result).not.toHaveProperty('podArrivedAt');
    expect(result).not.toHaveProperty('pickupLfd');
    expect(result).not.toHaveProperty('podRailCarrierScac');
  });

  it('restores shipping-line alternative_scacs and tracking-support flags', async () => {
    const fixture = loadFixture('shipping-lines.list');
    const { fetchImpl } = createMockFetch({
      '/shipping_lines': () => jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.listShippingLines(undefined, {
      format: 'mapped',
    })) as any[];

    const sourceWithAlt = (fixture?.data || []).find(
      (item: any) =>
        Array.isArray(item?.attributes?.alternative_scacs) &&
        item.attributes.alternative_scacs.length > 0,
    );
    expect(sourceWithAlt).toBeTruthy();
    const mappedAlt = result.find(
      (line) => line.scac === sourceWithAlt.attributes.scac,
    );
    expect(mappedAlt?.alternativeScacs).toEqual(
      sourceWithAlt.attributes.alternative_scacs,
    );

    const sourceWithFlag = (fixture?.data || []).find(
      (item: any) =>
        item?.attributes?.container_number_tracking_support === false,
    );
    expect(sourceWithFlag).toBeTruthy();
    const mappedFlag = result.find(
      (line) => line.scac === sourceWithFlag.attributes.scac,
    );
    expect(mappedFlag?.containerNumberTrackingSupport).toBe(false);
    expect(mappedFlag?.billOfLadingTrackingSupport).toBe(
      sourceWithFlag.attributes.bill_of_lading_tracking_support,
    );
    expect(mappedFlag?.bookingNumberTrackingSupport).toBe(
      sourceWithFlag.attributes.booking_number_tracking_support,
    );
  });
});
