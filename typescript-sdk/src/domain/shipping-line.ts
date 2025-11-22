/**
 * Shipping Line domain model
 */

import type { BaseModel } from './common.js';

export interface ShippingLine extends BaseModel {
  type: 'shipping_line';

  // Identifiers
  name?: string;
  shortName?: string;
  scac?: string;

  // Details
  website?: string;
  trackingUrl?: string;
  apiSupported?: boolean;

  // Coverage
  supportedRegions?: string[];

  // Metadata
  raw?: unknown;
}
