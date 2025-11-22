/**
 * Metro Area domain model
 */

import type { BaseModel } from './common.js';

export interface MetroArea extends BaseModel {
  type: 'metro_area';

  // Identifiers
  name?: string;
  code?: string;

  // Location
  country?: string;
  countryCode?: string;
  timezone?: string;

  // Ports in this metro area
  ports?: Array<{
    id?: string;
    name?: string;
    locode?: string;
  }>;

  // Metadata
  raw?: unknown;
}
