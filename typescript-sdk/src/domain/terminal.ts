/**
 * Terminal domain model
 */

import type { BaseModel } from './common.js';

export interface Terminal extends BaseModel {
  type: 'terminal';

  // Identifiers
  name?: string;
  nickname?: string;
  firmCode?: string;

  // Location
  portLocode?: string;
  portName?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;

  // Contact
  phone?: string;
  website?: string;
  address?: string;

  // Metadata
  raw?: unknown;
}
