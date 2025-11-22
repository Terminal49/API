/**
 * Party domain model (shipping parties like consignee, shipper, etc.)
 */

import type { BaseModel } from './common.js';

export interface Party extends BaseModel {
  type: 'party';

  // Identifiers
  name?: string;
  role?: string;

  // Contact
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  email?: string;

  // Metadata
  raw?: unknown;
}
