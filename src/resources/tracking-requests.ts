// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import * as ShipmentsAPI from './shipments';
import * as ShippingLinesAPI from './shipping-lines';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class TrackingRequests extends APIResource {
  /**
   * To track an ocean shipment, you create a new tracking request. Two attributes
   * are required to track a shipment. A `bill of lading/booking number` and a
   * shipping line `SCAC`.
   *
   * Once a tracking request is created we will attempt to fetch the shipment details
   * and it's related containers from the shipping line. If the attempt is successful
   * we will create in new shipment object including any related container objects.
   * We will send a `tracking_request.succeeded` webhook notification to your
   * webhooks.
   *
   * If the attempt to fetch fails then we will send a `tracking_request.failed`
   * webhook notification to your `webhooks`.
   *
   * A `tracking_request.succeeded` or `tracking_request.failed` webhook notificaiton
   * will only be sent if you have atleast one active webhook.
   */
  create(
    body: TrackingRequestCreateParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<TrackingRequestCreateResponse> {
    return this._client.post('/tracking_requests', { body, ...options });
  }

  /**
   * Get the details and status of an existing tracking request.
   */
  retrieve(
    id: string,
    query: TrackingRequestRetrieveParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<TrackingRequestRetrieveResponse> {
    return this._client.get(path`/tracking_requests/${id}`, { query, ...options });
  }

  /**
   * Update a tracking request
   */
  update(
    id: string,
    body: TrackingRequestUpdateParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<TrackingRequestUpdateResponse> {
    return this._client.patch(path`/tracking_requests/${id}`, { body, ...options });
  }

  /**
   * Returns a list of your tracking requests. The tracking requests are returned
   * sorted by creation date, with the most recent tracking request appearing first.
   */
  list(
    query: TrackingRequestListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<TrackingRequestListResponse> {
    return this._client.get('/tracking_requests', { query, ...options });
  }
}

export interface Account {
  id: string;

  attributes: Account.Attributes;

  type: 'container';
}

export namespace Account {
  export interface Attributes {
    company_name: string;
  }
}

export interface TrackingRequest {
  id: string;

  type: 'tracking_request';

  attributes?: TrackingRequest.Attributes;

  relationships?: TrackingRequest.Relationships;
}

export namespace TrackingRequest {
  export interface Attributes {
    created_at: string;

    request_number: string;

    request_type: 'bill_of_lading' | 'booking_number' | 'container';

    scac: string;

    status: 'pending' | 'awaiting_manifest' | 'created' | 'failed' | 'tracking_stopped';

    /**
     * If the tracking request has failed, or is currently failing, the last reason we
     * were unable to complete the request
     */
    failed_reason?:
      | 'booking_cancelled'
      | 'duplicate'
      | 'expired'
      | 'internal_processing_error'
      | 'invalid_number'
      | 'not_found'
      | 'retries_exhausted'
      | 'shipping_line_unreachable'
      | 'unrecognized_response'
      | 'data_unavailable'
      | null;

    is_retrying?: boolean;

    ref_numbers?: Array<string> | null;

    /**
     * How many times T49 has attempted to get the shipment from the shipping line
     */
    retry_count?: number | null;

    tags?: Array<string>;

    updated_at?: string;
  }

  export interface Relationships {
    customer?: Relationships.Customer;

    tracked_object?: Relationships.TrackedObject;
  }

  export namespace Relationships {
    export interface Customer {
      data?: Customer.Data;
    }

    export namespace Customer {
      export interface Data {
        id?: string;

        type?: 'party';
      }
    }

    export interface TrackedObject {
      data?: TrackedObject.Data | null;
    }

    export namespace TrackedObject {
      export interface Data {
        id?: string;

        type?: 'shipment';
      }
    }
  }
}

export interface TrackingRequestCreateResponse {
  data?: TrackingRequest;

  included?: Array<Account | ShippingLinesAPI.ShippingLine>;
}

export interface TrackingRequestRetrieveResponse {
  data?: TrackingRequest;

  included?: Array<Account | ShipmentsAPI.Shipment | ShippingLinesAPI.ShippingLine>;
}

export interface TrackingRequestUpdateResponse {
  data?: TrackingRequest;
}

export interface TrackingRequestListResponse {
  data?: Array<TrackingRequest>;

  included?: Array<Account | ShippingLinesAPI.ShippingLine | TrackingRequestListResponse.UnionMember2>;

  links?: ShipmentsAPI.Links;

  meta?: ShipmentsAPI.Meta;
}

export namespace TrackingRequestListResponse {
  export interface UnionMember2 {
    id?: string;

    links?: UnionMember2.Links;

    type?: 'shipment';
  }

  export namespace UnionMember2 {
    export interface Links {
      self?: string;
    }
  }
}

export interface TrackingRequestCreateParams {
  data?: TrackingRequestCreateParams.Data;
}

export namespace TrackingRequestCreateParams {
  export interface Data {
    type: 'tracking_request';

    attributes?: Data.Attributes;

    relationships?: Data.Relationships;
  }

  export namespace Data {
    export interface Attributes {
      request_number: string;

      /**
       * The type of document number to be supplied. Container number support is
       * currently in BETA.
       */
      request_type: 'bill_of_lading' | 'booking_number' | 'container';

      scac: string;

      /**
       * Optional list of reference numbers to be added to the shipment when tracking
       * request completes
       */
      ref_numbers?: Array<string>;

      /**
       * Optional list of tags to be added to the shipment when tracking request
       * completes
       */
      shipment_tags?: Array<string>;
    }

    export interface Relationships {
      customer?: Relationships.Customer;
    }

    export namespace Relationships {
      export interface Customer {
        data?: Customer.Data;
      }

      export namespace Customer {
        export interface Data {
          id?: string;

          type?: 'party';
        }
      }
    }
  }
}

export interface TrackingRequestRetrieveParams {
  /**
   * Comma delimited list of relations to include. 'tracked_object' is included by
   * default.
   */
  include?: string;
}

export interface TrackingRequestUpdateParams {
  data?: TrackingRequestUpdateParams.Data;
}

export namespace TrackingRequestUpdateParams {
  export interface Data {
    attributes: Data.Attributes;
  }

  export namespace Data {
    export interface Attributes {
      /**
       * Tracking request ref number.
       */
      ref_number?: string;
    }
  }
}

export interface TrackingRequestListParams {
  /**
   * filter by tracking_requests `created_at` before a certain ISO8601 timestamp
   */
  'filter[created_at][end]'?: string;

  /**
   * filter by tracking_requests `created_at` after a certain ISO8601 timestamp
   */
  'filter[created_at][start]'?: string;

  /**
   * filter by `request_number`
   */
  'filter[request_number]'?: string;

  /**
   * filter by shipping line `scac`
   */
  'filter[scac]'?: string;

  /**
   * filter by `status`
   */
  'filter[status]'?: 'created' | 'pending' | 'failed';

  /**
   * Comma delimited list of relations to include. 'tracked_object' is included by
   * default.
   */
  include?: string;

  'page[number]'?: number;

  'page[size]'?: number;

  /**
   * A search term to be applied against request_number and reference_numbers.
   */
  q?: string;
}

export declare namespace TrackingRequests {
  export {
    type Account as Account,
    type TrackingRequest as TrackingRequest,
    type TrackingRequestCreateResponse as TrackingRequestCreateResponse,
    type TrackingRequestRetrieveResponse as TrackingRequestRetrieveResponse,
    type TrackingRequestUpdateResponse as TrackingRequestUpdateResponse,
    type TrackingRequestListResponse as TrackingRequestListResponse,
    type TrackingRequestCreateParams as TrackingRequestCreateParams,
    type TrackingRequestRetrieveParams as TrackingRequestRetrieveParams,
    type TrackingRequestUpdateParams as TrackingRequestUpdateParams,
    type TrackingRequestListParams as TrackingRequestListParams,
  };
}
