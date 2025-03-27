// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class Terminals extends APIResource {
  /**
   * Return the details of a single terminal.
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<TerminalRetrieveResponse> {
    return this._client.get(path`/terminals/${id}`, options);
  }
}

export interface Terminal {
  attributes: Terminal.Attributes;

  relationships: Terminal.Relationships;

  id?: string;

  type?: 'terminal';
}

export namespace Terminal {
  export interface Attributes {
    name: string;

    /**
     * BIC Facility Code
     */
    bic_facility_code?: string;

    /**
     * City part of the address
     */
    city?: string;

    /**
     * Country part of the address
     */
    country?: string;

    /**
     * CBP FIRMS Code or CBS Sublocation Code
     */
    firms_code?: string;

    nickname?: string;

    /**
     * SMDG Code
     */
    smdg_code?: string;

    /**
     * State part of the address
     */
    state?: string;

    /**
     * State abbreviation for the state
     */
    state_abbr?: string;

    /**
     * Street part of the address
     */
    street?: string;

    /**
     * ZIP code part of the address
     */
    zip?: string;
  }

  export interface Relationships {
    port: Relationships.Port;
  }

  export namespace Relationships {
    export interface Port {
      data?: Port.Data;
    }

    export namespace Port {
      export interface Data {
        id?: string;

        type?: 'port';
      }
    }
  }
}

export interface TerminalRetrieveResponse {
  data?: Terminal;
}

export declare namespace Terminals {
  export { type Terminal as Terminal, type TerminalRetrieveResponse as TerminalRetrieveResponse };
}
