// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../resource';
import { APIPromise } from '../api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class Ports extends APIResource {
  /**
   * Return the details of a single port.
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<PortRetrieveResponse> {
    return this._client.get(path`/ports/${id}`, options);
  }
}

export interface Port {
  id: string;

  type: 'port';

  attributes?: Port.Attributes;
}

export namespace Port {
  export interface Attributes {
    city?: string | null;

    /**
     * UN/LOCODE
     */
    code?: string;

    /**
     * 2 digit country code
     */
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

export interface PortRetrieveResponse {
  data?: Port;
}

export declare namespace Ports {
  export { type Port as Port, type PortRetrieveResponse as PortRetrieveResponse };
}
