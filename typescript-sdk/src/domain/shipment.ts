/**
 * Shipment domain model
 */

import type { BaseModel } from './common.js';
import type { Container } from './container.js';
import type { Port } from './port.js';

export interface Shipment extends BaseModel {
  type: 'shipment';

  // Identifiers
  billOfLadingNumber?: string;
  normalizedNumber?: string;
  refNumbers?: string[];

  // Shipping line
  shippingLineScac?: string;
  shippingLineName?: string;
  shippingLineShortName?: string;

  // Customer
  customerName?: string;

  // Port of Lading
  portOfLadingLocode?: string;
  portOfLadingName?: string;
  polEtdAt?: string | null;
  polAtdAt?: string | null;
  polTimezone?: string;

  // Port of Discharge
  portOfDischargeLocode?: string;
  portOfDischargeName?: string;
  podEtaAt?: string | null;
  podOriginalEtaAt?: string | null;
  podAtaAt?: string | null;
  podTimezone?: string;

  // Vessel (at POD)
  podVesselName?: string;
  podVesselImo?: string;
  podVoyageNumber?: string;

  // Destination
  destinationLocode?: string;
  destinationName?: string;
  destinationTimezone?: string;
  destinationEtaAt?: string | null;
  destinationAtaAt?: string | null;

  // Tracking
  trackingStatus?: string;
  trackingStoppedReason?: string | null;
  trackingStoppedAt?: string | null;

  // Metadata
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;

  // Relationships
  containers?: Container[];
  portOfLading?: Port | null;
  portOfDischarge?: Port | null;
}
