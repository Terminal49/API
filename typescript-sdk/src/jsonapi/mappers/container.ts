/**
 * Container JSON:API mapper
 */

import { deserialize, deserializeCollection } from '../jsona-instance.js';
import type { Container } from '../../domain/container.js';

/**
 * Map a deserialized JSON:API container to domain model
 */
function mapContainer(data: Record<string, unknown>): Container {
  return {
    id: String(data.id),
    type: 'container',

    containerNumber: (data.containerNumber ?? data.container_number) as string | undefined,

    sizeTypeCode: (data.sizeTypeCode ?? data.size_type_code) as string | undefined,
    equipmentLength: (data.equipmentLength ?? data.equipment_length) as number | undefined,
    equipmentHeight: (data.equipmentHeight ?? data.equipment_height) as string | undefined,
    equipmentType: (data.equipmentType ?? data.equipment_type) as string | undefined,

    currentLocationName: (data.currentLocationName ?? data.current_location_name) as string | undefined,
    currentLocationLocode: (data.currentLocationLocode ?? data.current_location_locode) as string | undefined,
    currentLocationTimezone: (data.currentLocationTimezone ?? data.current_location_timezone) as string | undefined,

    emptyReturnedAt: (data.emptyReturnedAt ?? data.empty_returned_at) as string | null | undefined,
    equipmentPickupAt: (data.equipmentPickupAt ?? data.equipment_pickup_at) as string | null | undefined,
    equipmentReturnAt: (data.equipmentReturnAt ?? data.equipment_return_at) as string | null | undefined,
    availableForPickup: (data.availableForPickup ?? data.available_for_pickup) as boolean | undefined,
    availableForPickupAt: (data.availableForPickupAt ?? data.available_for_pickup_at) as string | null | undefined,

    lastFreeDay: (data.lastFreeDay ?? data.last_free_day) as string | null | undefined,
    lastFreeLineDay: (data.lastFreeLineDay ?? data.last_free_line_day) as string | null | undefined,
    pickupLfdLine: (data.pickupLfdLine ?? data.pickup_lfd_line) as string | null | undefined,
    pickupLfdTerminal: (data.pickupLfdTerminal ?? data.pickup_lfd_terminal) as string | null | undefined,
    returnLfdLine: (data.returnLfdLine ?? data.return_lfd_line) as string | null | undefined,
    returnLfdTerminal: (data.returnLfdTerminal ?? data.return_lfd_terminal) as string | null | undefined,

    feesStatus: (data.feesStatus ?? data.fees_status) as string | undefined,
    feesPayableAt: (data.feesPayableAt ?? data.fees_payable_at) as string | undefined,
    feesPaymentType: (data.feesPaymentType ?? data.fees_payment_type) as string | undefined,
    totalHolds: (data.totalHolds ?? data.total_holds) as number | undefined,
    totalFreightHolds: (data.totalFreightHolds ?? data.total_freight_holds) as number | undefined,
    totalCustomsHolds: (data.totalCustomsHolds ?? data.total_customs_holds) as number | undefined,
    totalUSDAHolds: (data.totalUSDAHolds ?? data.total_usda_holds) as number | undefined,
    totalTMFHolds: (data.totalTMFHolds ?? data.total_tmf_holds) as number | undefined,
    totalOtherHolds: (data.totalOtherHolds ?? data.total_other_holds) as number | undefined,

    createdAt: (data.createdAt ?? data.created_at) as string | undefined,
    updatedAt: (data.updatedAt ?? data.updated_at) as string | undefined,
    lastStatusRefreshedAt: (data.lastStatusRefreshedAt ?? data.last_status_refreshed_at) as string | null | undefined,

    shipment: data.shipment as Container['shipment'],
    terminal: data.terminal as Container['terminal'],

    raw: data,
  };
}

/**
 * Map a JSON:API container document to domain model
 */
export function mapContainerDocument(document: unknown): Container {
  const data = deserialize<Record<string, unknown>>(document);
  return mapContainer(data);
}

/**
 * Map a JSON:API containers collection to domain models
 */
export function mapContainersCollection(document: unknown): Container[] {
  const data = deserializeCollection<Record<string, unknown>>(document);
  return data.map(mapContainer);
}
