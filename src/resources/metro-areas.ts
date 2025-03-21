// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../resource';
import { APIPromise } from '../api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class MetroAreas extends APIResource {
  /**
   * Return the details of a single metro area.
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<MetroAreaRetrieveResponse> {
    return this._client.get(path`/metro_areas/${id}`, options);
  }
}

export interface MetroArea {
  id: string;

  type: 'metro_area';

  attributes?: MetroArea.Attributes;
}

export namespace MetroArea {
  export interface Attributes {
    /**
     * UN/LOCODE
     */
    code?: string;

    country_code?: string;

    latitude?: number | null;

    longitude?: number | null;

    name?: string;

    state_abbr?: string | null;

    /**
     * IANA tz
     */
    time_zone?: string;
  }
}

export interface MetroAreaRetrieveResponse {
  data?: MetroArea;
}

export declare namespace MetroAreas {
  export { type MetroArea as MetroArea, type MetroAreaRetrieveResponse as MetroAreaRetrieveResponse };
}
