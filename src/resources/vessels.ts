// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class Vessels extends APIResource {
  /**
   * Returns a vessel by it's given identifier
   */
  retrieveByID(id: string, options?: RequestOptions): APIPromise<VesselRetrieveByIDResponse> {
    return this._client.get(path`/vessels/${id}`, options);
  }

  /**
   * Returns a vessel by the given IMO number.
   */
  retrieveByImo(imo: string, options?: RequestOptions): APIPromise<VesselRetrieveByImoResponse> {
    return this._client.get(path`/vessels/${imo}`, options);
  }
}

export interface Vessel {
  id?: string;

  attributes?: Vessel.Attributes;

  type?: 'vessel';
}

export namespace Vessel {
  export interface Attributes {
    /**
     * International Maritime Organization (IMO) number
     */
    imo?: string | null;

    /**
     * The current latitude position of the vessel
     */
    latitude?: number | null;

    /**
     * The current longitude position of the vessel
     */
    longitude?: number | null;

    /**
     * Maritime Mobile Service Identity (MMSI)
     */
    mmsi?: string | null;

    /**
     * The name of the ship or vessel
     */
    name?: string;

    /**
     * The current speed of the ship in knots (nautical miles per hour)
     */
    nautical_speed_knots?: number | null;

    /**
     * The current heading of the ship in degrees, where 0 is North, 90 is East, 180 is
     * South, and 270 is West
     */
    navigational_heading_degrees?: number | null;

    /**
     * The timestamp of when the ship's position was last recorded, in ISO 8601 date
     * and time format
     */
    position_timestamp?: string | null;
  }
}

export interface VesselRetrieveByIDResponse {
  data?: Vessel;
}

export interface VesselRetrieveByImoResponse {
  data?: Vessel;
}

export declare namespace Vessels {
  export {
    type Vessel as Vessel,
    type VesselRetrieveByIDResponse as VesselRetrieveByIDResponse,
    type VesselRetrieveByImoResponse as VesselRetrieveByImoResponse,
  };
}
