/**
 * Container domain model
 */

import type { BaseModel } from './common.js';
import type { Shipment } from './shipment.js';
import type { Terminal } from './terminal.js';

export interface Container extends BaseModel {
  type: 'container';

  // Identifiers
  containerNumber?: string;

  // Container details
  sizeTypeCode?: string;
  equipmentLength?: number;
  equipmentHeight?: string;
  equipmentType?: string;

  // Status
  currentLocationName?: string;
  currentLocationLocode?: string;
  currentLocationTimezone?: string;

  // Events
  emptyReturnedAt?: string | null;
  equipmentPickupAt?: string | null;
  equipmentReturnAt?: string | null;
  availableForPickup?: boolean;
  availableForPickupAt?: string | null;

  // Last Free Day (LFD)
  lastFreeDay?: string | null;
  lastFreeLineDay?: string | null;
  pickupLfdLine?: string | null;
  pickupLfdTerminal?: string | null;
  returnLfdLine?: string | null;
  returnLfdTerminal?: string | null;

  // Fees
  feesStatus?: string;
  feesPayableAt?: string;
  feesPaymentType?: string;
  totalHolds?: number;
  totalFreightHolds?: number;
  totalCustomsHolds?: number;
  totalUSDAHolds?: number;
  totalTMFHolds?: number;
  totalOtherHolds?: number;

  // Metadata
  createdAt?: string;
  updatedAt?: string;
  lastStatusRefreshedAt?: string | null;

  // Relationships
  shipment?: Shipment | null;
  terminal?: Terminal | null;
}

/**
 * Container event
 */
export interface ContainerEvent {
  id?: string;
  event?: string;
  eventType?: string;
  location?: string;
  locationLocode?: string;
  vessel?: string;
  vesselImo?: string;
  voyageNumber?: string;
  timestamp?: string;
  timezone?: string;
  raw?: unknown;
}

/**
 * Transport event (AIS-based)
 */
export interface TransportEvent {
  id?: string;
  eventType?: string;
  location?: string;
  locationLocode?: string;
  latitude?: number;
  longitude?: number;
  vesselName?: string;
  vesselImo?: string;
  timestamp?: string;
  estimatedArrival?: string | null;
  estimatedDeparture?: string | null;
  raw?: unknown;
}

/**
 * Container route information
 */
export interface ContainerRoute {
  origin?: {
    name?: string;
    locode?: string;
  };
  destination?: {
    name?: string;
    locode?: string;
  };
  legs?: Array<{
    mode?: string;
    from?: string;
    to?: string;
    vessel?: string;
    vesselImo?: string;
    voyageNumber?: string;
    etd?: string | null;
    eta?: string | null;
  }>;
}
