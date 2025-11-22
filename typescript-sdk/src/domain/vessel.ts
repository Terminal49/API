/**
 * Vessel domain model
 */

import type { BaseModel } from './common.js';

export interface Vessel extends BaseModel {
  type: 'vessel';

  // Identifiers
  name?: string;
  imo?: string;
  mmsi?: string;
  callSign?: string;

  // Details
  flag?: string;
  vesselType?: string;
  grossTonnage?: number;
  deadweightTonnage?: number;
  length?: number;
  width?: number;
  yearBuilt?: number;

  // Current position
  latitude?: number;
  longitude?: number;
  heading?: number;
  speed?: number;
  lastPositionUpdate?: string;

  // Metadata
  raw?: unknown;
}

/**
 * Vessel future position
 */
export interface VesselFuturePosition {
  portName?: string;
  portLocode?: string;
  eta?: string | null;
  etd?: string | null;
  arrivalType?: string;
  confidence?: string;
  raw?: unknown;
}

/**
 * Vessel future position with coordinates
 */
export interface VesselFuturePositionWithCoordinates extends VesselFuturePosition {
  latitude?: number;
  longitude?: number;
}
