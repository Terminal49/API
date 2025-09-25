// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import * as ShipmentsAPI from './shipments';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class ShippingLines extends APIResource {
  /**
   * Return the details of a single shipping line.
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<ShippingLineRetrieveResponse> {
    return this._client.get(path`/shipping_lines/${id}`, options);
  }

  /**
   * Return a list of shipping lines supported by Terminal49. N.B. There is no
   * pagination for this endpoint.
   */
  list(options?: RequestOptions): APIPromise<ShippingLineListResponse> {
    return this._client.get('/shipping_lines', options);
  }
}

export interface ShippingLine {
  id: string;

  attributes: ShippingLine.Attributes;

  type: 'shipping_line';
}

export namespace ShippingLine {
  export interface Attributes {
    /**
     * Additional SCACs which will be accepted in tracking requests
     */
    alternative_scacs: Array<string>;

    bill_of_lading_tracking_support: boolean;

    booking_number_tracking_support: boolean;

    container_number_tracking_support: boolean;

    name: string;

    scac: string;

    short_name: string;
  }
}

export interface ShippingLineRetrieveResponse {
  data?: ShippingLine;
}

export interface ShippingLineListResponse {
  data?: Array<ShippingLine>;

  links?: ShipmentsAPI.Links;
}

export declare namespace ShippingLines {
  export {
    type ShippingLine as ShippingLine,
    type ShippingLineRetrieveResponse as ShippingLineRetrieveResponse,
    type ShippingLineListResponse as ShippingLineListResponse,
  };
}
