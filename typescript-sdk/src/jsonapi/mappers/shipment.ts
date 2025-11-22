/**
 * Shipment JSON:API mapper
 */

import { deserialize, deserializeCollection } from '../jsona-instance.js';
import type { Shipment } from '../../domain/shipment.js';

/**
 * Map a deserialized JSON:API shipment to domain model
 */
function mapShipment(data: Record<string, unknown>): Shipment {
  return {
    id: String(data.id),
    type: 'shipment',

    // Map all snake_case and camelCase attributes
    billOfLadingNumber: (data.billOfLadingNumber ?? data.bill_of_lading_number) as string | undefined,
    normalizedNumber: (data.normalizedNumber ?? data.normalized_number) as string | undefined,
    refNumbers: (data.refNumbers ?? data.ref_numbers) as string[] | undefined,

    shippingLineScac: (data.shippingLineScac ?? data.shipping_line_scac) as string | undefined,
    shippingLineName: (data.shippingLineName ?? data.shipping_line_name) as string | undefined,
    shippingLineShortName: (data.shippingLineShortName ?? data.shipping_line_short_name) as string | undefined,

    customerName: (data.customerName ?? data.customer_name) as string | undefined,

    portOfLadingLocode: (data.portOfLadingLocode ?? data.port_of_lading_locode) as string | undefined,
    portOfLadingName: (data.portOfLadingName ?? data.port_of_lading_name) as string | undefined,
    polEtdAt: (data.polEtdAt ?? data.pol_etd_at) as string | null | undefined,
    polAtdAt: (data.polAtdAt ?? data.pol_atd_at) as string | null | undefined,
    polTimezone: (data.polTimezone ?? data.pol_timezone) as string | undefined,

    portOfDischargeLocode: (data.portOfDischargeLocode ?? data.port_of_discharge_locode) as string | undefined,
    portOfDischargeName: (data.portOfDischargeName ?? data.port_of_discharge_name) as string | undefined,
    podEtaAt: (data.podEtaAt ?? data.pod_eta_at) as string | null | undefined,
    podOriginalEtaAt: (data.podOriginalEtaAt ?? data.pod_original_eta_at) as string | null | undefined,
    podAtaAt: (data.podAtaAt ?? data.pod_ata_at) as string | null | undefined,
    podTimezone: (data.podTimezone ?? data.pod_timezone) as string | undefined,

    podVesselName: (data.podVesselName ?? data.pod_vessel_name) as string | undefined,
    podVesselImo: (data.podVesselImo ?? data.pod_vessel_imo) as string | undefined,
    podVoyageNumber: (data.podVoyageNumber ?? data.pod_voyage_number) as string | undefined,

    destinationLocode: (data.destinationLocode ?? data.destination_locode) as string | undefined,
    destinationName: (data.destinationName ?? data.destination_name) as string | undefined,
    destinationTimezone: (data.destinationTimezone ?? data.destination_timezone) as string | undefined,
    destinationEtaAt: (data.destinationEtaAt ?? data.destination_eta_at) as string | null | undefined,
    destinationAtaAt: (data.destinationAtaAt ?? data.destination_ata_at) as string | null | undefined,

    trackingStatus: (data.trackingStatus ?? data.tracking_status) as string | undefined,
    trackingStoppedReason: (data.trackingStoppedReason ?? data.tracking_stopped_reason) as string | null | undefined,
    trackingStoppedAt: (data.trackingStoppedAt ?? data.tracking_stopped_at) as string | null | undefined,

    tags: (data.tags) as string[] | undefined,
    createdAt: (data.createdAt ?? data.created_at) as string | undefined,
    updatedAt: (data.updatedAt ?? data.updated_at) as string | undefined,

    // Relationships are handled by JSONA
    containers: data.containers as Shipment['containers'],
    portOfLading: (data.portOfLading ?? data.port_of_lading) as Shipment['portOfLading'],
    portOfDischarge: (data.portOfDischarge ?? data.port_of_discharge) as Shipment['portOfDischarge'],

    raw: data,
  };
}

/**
 * Map a JSON:API shipment document to domain model
 */
export function mapShipmentDocument(document: unknown): Shipment {
  const data = deserialize<Record<string, unknown>>(document);
  return mapShipment(data);
}

/**
 * Map a JSON:API shipments collection to domain models
 */
export function mapShipmentsCollection(document: unknown): Shipment[] {
  const data = deserializeCollection<Record<string, unknown>>(document);
  return data.map(mapShipment);
}
