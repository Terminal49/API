import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Terminal49Client } from './client.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, 'fixtures');

const itIf = (condition: boolean) => (condition ? it : it.skip);

function fixturePath(name: string) {
  return path.resolve(fixturesDir, `${name}.json`);
}

function hasFixture(name: string) {
  return fs.existsSync(fixturePath(name));
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

  itIf(hasFixture('containers.route'))(
    'maps container route with ports and vessel legs',
    async () => {
      const fixture = loadFixture('containers.route');
      const { fetchImpl } = createMockFetch({
        '/containers/cont-1/route?include=port,vessel,route_location': () =>
          jsonResponse(fixture),
      });

      const client = new Terminal49Client({
        apiToken: 'token-123',
        apiBaseUrl: baseUrl,
        fetchImpl,
      });

      const result = (await client.getContainerRoute('cont-1', {
        format: 'mapped',
      })) as any;

      expect(result.totalLegs).toBe(result.locations.length);

      const routeLocationRef =
        fixture?.data?.relationships?.route_locations?.data?.[0];
      const routeLocation = routeLocationRef
        ? findIncluded(fixture, 'route_location', routeLocationRef.id)
        : null;
      if (!routeLocation) return;

      // The port for a route leg lives under the `location` relationship of a
      // route_location (type port|terminal), NOT a `port` relationship.
      const locationId = routeLocation?.relationships?.location?.data?.id;
      const port = locationId
        ? findIncluded(fixture, 'port', locationId)
        : null;
      if (port) {
        // Regression guard: the leg must resolve its port, not be null.
        expect(result.locations[0]?.port).toBeTruthy();
        expectIfDefined(result.locations[0]?.port?.code, port.attributes?.code);
        expectIfDefined(result.locations[0]?.port?.name, port.attributes?.name);
        expectIfDefined(result.locations[0]?.port?.city, port.attributes?.city);
        expectIfDefined(
          result.locations[0]?.port?.countryCode,
          port.attributes?.country_code,
        );
      }

      expectIfDefined(
        result.locations[0]?.inbound?.mode,
        routeLocation.attributes?.inbound_mode,
      );
      expectIfDefined(
        result.locations[0]?.inbound?.carrierScac,
        routeLocation.attributes?.inbound_scac,
      );
      expectIfDefined(
        result.locations[0]?.inbound?.eta,
        routeLocation.attributes?.inbound_eta_at,
      );
      expectIfDefined(
        result.locations[0]?.inbound?.ata,
        routeLocation.attributes?.inbound_ata_at,
      );

      expectIfDefined(
        result.locations[0]?.outbound?.mode,
        routeLocation.attributes?.outbound_mode,
      );
      expectIfDefined(
        result.locations[0]?.outbound?.carrierScac,
        routeLocation.attributes?.outbound_scac,
      );
      expectIfDefined(
        result.locations[0]?.outbound?.etd,
        routeLocation.attributes?.outbound_etd_at,
      );
      expectIfDefined(
        result.locations[0]?.outbound?.atd,
        routeLocation.attributes?.outbound_atd_at,
      );

      const inboundVesselId =
        routeLocation?.relationships?.inbound_vessel?.data?.id;
      const inboundVessel = inboundVesselId
        ? findIncluded(fixture, 'vessel', inboundVesselId)
        : null;
      if (inboundVessel) {
        expectIfDefined(
          result.locations[0]?.inbound?.vessel?.name,
          inboundVessel.attributes?.name,
        );
        expectIfDefined(
          result.locations[0]?.inbound?.vessel?.imo,
          inboundVessel.attributes?.imo,
        );
      }

      const outboundVesselId =
        routeLocation?.relationships?.outbound_vessel?.data?.id;
      const outboundVessel = outboundVesselId
        ? findIncluded(fixture, 'vessel', outboundVesselId)
        : null;
      if (outboundVessel) {
        expectIfDefined(
          result.locations[0]?.outbound?.vessel?.name,
          outboundVessel.attributes?.name,
        );
        expectIfDefined(
          result.locations[0]?.outbound?.vessel?.imo,
          outboundVessel.attributes?.imo,
        );
      }
    },
  );

  it('maps tracking request fields from base response', async () => {
    const fixture = loadFixture('tracking-requests.get.base');
    const trackingId = fixture?.data?.id || 'tr-1';
    const { fetchImpl } = createMockFetch({
      [`/tracking_requests/${trackingId}`]: () => jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.getTrackingRequest(trackingId, {
      format: 'mapped',
    })) as any;

    const attrs = fixture?.data?.attributes || {};
    expectIfDefined(result.requestType, attrs.request_type);
    expectIfDefined(result.requestNumber, attrs.request_number);
    expectIfDefined(result.status, attrs.status);
    expectIfDefined(result.scac, attrs.scac);

    if (Array.isArray(attrs.ref_numbers)) {
      expect(result.refNumbers).toEqual(attrs.ref_numbers);
    }

    if (!fixture?.included || fixture.included.length === 0) {
      expect(result.shipment).toBeNull();
      expect(result.container).toBeNull();
    }
  });

  itIf(hasFixture('tracking-requests.get.include'))(
    'maps tracking request with shipment and container',
    async () => {
      const fixture = loadFixture('tracking-requests.get.include');
      const trackingId = fixture?.data?.id || 'tr-1';
      const { fetchImpl } = createMockFetch({
        [`/tracking_requests/${trackingId}`]: () => jsonResponse(fixture),
      });

      const client = new Terminal49Client({
        apiToken: 'token-123',
        apiBaseUrl: baseUrl,
        fetchImpl,
      });

      const result = (await client.getTrackingRequest(trackingId, {
        format: 'mapped',
      })) as any;

      const shipmentRef = fixture?.data?.relationships?.shipment?.data;
      const containerRef = fixture?.data?.relationships?.container?.data;
      const shipment = shipmentRef
        ? findIncluded(fixture, 'shipment', shipmentRef.id)
        : null;
      const container = containerRef
        ? findIncluded(fixture, 'container', containerRef.id)
        : null;

      if (shipment) {
        const expectedBill =
          shipment.attributes?.bill_of_lading_number ||
          shipment.attributes?.bill_of_lading ||
          shipment.attributes?.bl_number;
        expectIfDefined(result.shipment?.billOfLading, expectedBill);
        expectIfDefined(
          result.shipment?.shippingLineScac,
          shipment.attributes?.shipping_line_scac,
        );
      }

      if (container) {
        expectIfDefined(
          result.container?.number,
          container.attributes?.number ||
            container.attributes?.container_number,
        );
        expectIfDefined(result.container?.status, container.attributes?.status);
      }
    },
  );

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

  it('maps container list items from base fixture', async () => {
    const fixture = loadFixture('containers.list');
    const { fetchImpl } = createMockFetch({
      '/containers?include=shipment,pod_terminal': () => jsonResponse(fixture),
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
      '/containers?include=shipment,pod_terminal': () =>
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

  it('resolves every route leg port from the `location` relationship', async () => {
    const fixture = loadFixture('containers.route');
    const { fetchImpl } = createMockFetch({
      '/containers/cont-1/route?include=port,vessel,route_location': () =>
        jsonResponse(fixture),
    });

    const client = new Terminal49Client({
      apiToken: 'token-123',
      apiBaseUrl: baseUrl,
      fetchImpl,
    });

    const result = (await client.getContainerRoute('cont-1', {
      format: 'mapped',
    })) as any;

    expect(result.totalLegs).toBe(2);
    expect(result.locations.length).toBe(2);

    // Each leg must carry a non-null port resolved via `location`.
    expect(result.locations[0]?.port?.code).toBe('CNSHA');
    expect(result.locations[0]?.port?.name).toBe('Shanghai');
    expect(result.locations[0]?.port?.city).toBe('Shanghai');
    expect(result.locations[0]?.port?.countryCode).toBe('CN');

    expect(result.locations[1]?.port?.code).toBe('USLAX');
    expect(result.locations[1]?.port?.name).toBe('Los Angeles');
    expect(result.locations[1]?.port?.countryCode).toBe('US');

    // Outbound leg + vessel resolution sanity.
    expect(result.locations[0]?.outbound?.carrierScac).toBe('MAEU');
    expect(result.locations[0]?.outbound?.vessel?.name).toBe(
      'MAERSK EDINBURGH',
    );
    expect(result.locations[1]?.inbound?.vessel?.imo).toBe('9456769');
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
