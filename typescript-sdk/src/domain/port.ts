/**
 * Port domain model
 */

import type { BaseModel } from './common.js';

export interface Port extends BaseModel {
  type: 'port';

  // Identifiers
  name?: string;
  locode?: string;
  countryCode?: string;

  // Location
  timezone?: string;
  latitude?: number;
  longitude?: number;

  // Details
  city?: string;
  state?: string;
  country?: string;

  // Metadata
  raw?: unknown;
}
