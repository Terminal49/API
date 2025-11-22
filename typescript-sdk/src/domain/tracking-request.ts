/**
 * Tracking Request domain model
 */

import type { BaseModel } from './common.js';

export interface TrackingRequest extends BaseModel {
  type: 'tracking_request';

  // Request details
  requestNumber?: string;
  requestType?: string;
  shippingLineScac?: string;
  shippingLineName?: string;

  // Status
  status?: string;
  failureReason?: string | null;

  // Timestamps
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;

  // Associated shipment
  shipmentId?: string | null;

  // Metadata
  raw?: unknown;
}
