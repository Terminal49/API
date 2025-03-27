// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import * as ContainersAPI from './containers';
import * as PortsAPI from './ports';
import * as TerminalsAPI from './terminals';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class Shipments extends APIResource {
  /**
   * Retrieves the details of an existing shipment. You need only supply the unique
   * shipment `id` that was returned upon `tracking_request` creation.
   */
  retrieve(
    id: string,
    query: ShipmentRetrieveParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ShipmentRetrieveResponse> {
    return this._client.get(path`/shipments/${id}`, { query, ...options });
  }

  /**
   * Update a shipment
   */
  update(
    id: string,
    body: ShipmentUpdateParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ShipmentUpdateResponse> {
    return this._client.patch(path`/shipments/${id}`, { body, ...options });
  }

  /**
   * Returns a list of your shipments. The shipments are returned sorted by creation
   * date, with the most recent shipments appearing first.
   *
   * This api will return all shipments associated with the account. Shipments
   * created via the `tracking_request` API aswell as the ones added via the
   * dashboard will be retuned via this endpoint.
   */
  list(
    query: ShipmentListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ShipmentListResponse> {
    return this._client.get('/shipments', { query, ...options });
  }

  /**
   * Resume tracking a shipment. Keep in mind that some information is only made
   * available by our data sources at specific times, so a stopped and resumed
   * shipment may have some information missing.
   */
  resumeTracking(id: string, options?: RequestOptions): APIPromise<ShipmentResumeTrackingResponse> {
    return this._client.patch(path`/shipments/${id}/resume_tracking`, options);
  }

  /**
   * We'll stop tracking the shipment, which means that there will be no more
   * updates. You can still access the shipment's previously-collected information
   * via the API or dashboard.
   *
   * You can resume tracking a shipment by calling the `resume_tracking` endpoint,
   * but keep in mind that some information is only made available by our data
   * sources at specific times, so a stopped and resumed shipment may have some
   * information missing.
   */
  stopTracking(id: string, options?: RequestOptions): APIPromise<ShipmentStopTrackingResponse> {
    return this._client.patch(path`/shipments/${id}/stop_tracking`, options);
  }
}

export interface Links {
  first?: string;

  last?: string;

  next?: string;

  prev?: string;

  self?: string;
}

export interface Meta {
  size?: number;

  total?: number;
}

export interface Shipment {
  id: string;

  attributes: Shipment.Attributes;

  links: Shipment.Links;

  relationships: Shipment.Relationships;

  type: 'shipment';
}

export namespace Shipment {
  export interface Attributes {
    bill_of_lading_number: string;

    created_at?: string;

    customer_name?: string | null;

    destination_ata_at?: string | null;

    destination_eta_at?: string | null;

    /**
     * UN/LOCODE
     */
    destination_locode?: string | null;

    destination_name?: string | null;

    /**
     * IANA tz
     */
    destination_timezone?: string | null;

    /**
     * When Terminal49 last tried to update the shipment status from the shipping line
     */
    line_tracking_last_attempted_at?: string | null;

    /**
     * When Terminal49 last successfully updated the shipment status from the shipping
     * line
     */
    line_tracking_last_succeeded_at?: string | null;

    /**
     * When Terminal49 stopped checking at the shipping line
     */
    line_tracking_stopped_at?: string | null;

    /**
     * The reason Terminal49 stopped checking
     */
    line_tracking_stopped_reason?:
      | 'all_containers_terminated'
      | 'past_arrival_window'
      | 'no_updates_at_line'
      | 'cancelled_by_user'
      | 'booking_cancelled'
      | null;

    /**
     * The normalized version of the shipment number used for querying the carrier
     */
    normalized_number?: string;

    pod_ata_at?: string | null;

    pod_eta_at?: string | null;

    pod_original_eta_at?: string | null;

    /**
     * IANA tz
     */
    pod_timezone?: string | null;

    pod_vessel_imo?: string | null;

    pod_vessel_name?: string | null;

    pod_voyage_number?: string | null;

    pol_atd_at?: string | null;

    pol_etd_at?: string | null;

    /**
     * IANA tz
     */
    pol_timezone?: string | null;

    /**
     * UN/LOCODE
     */
    port_of_discharge_locode?: string | null;

    port_of_discharge_name?: string | null;

    /**
     * UN/LOCODE
     */
    port_of_lading_locode?: string | null;

    port_of_lading_name?: string | null;

    ref_numbers?: Array<string> | null;

    shipping_line_name?: string;

    shipping_line_scac?: string;

    shipping_line_short_name?: string;

    tags?: Array<string>;
  }

  export interface Links {
    self: string;
  }

  export interface Relationships {
    containers?: Relationships.Containers;

    destination?: Relationships.Destination;

    destination_terminal?: Relationships.DestinationTerminal;

    line_tracking_stopped_by_user?: Relationships.LineTrackingStoppedByUser;

    pod_terminal?: Relationships.PodTerminal;

    port_of_discharge?: Relationships.PortOfDischarge;

    port_of_lading?: Relationships.PortOfLading;
  }

  export namespace Relationships {
    export interface Containers {
      data?: Array<Containers.Data>;
    }

    export namespace Containers {
      export interface Data {
        id: string;

        type: 'container';
      }
    }

    export interface Destination {
      data?: Destination.Data | null;
    }

    export namespace Destination {
      export interface Data {
        id: string;

        type: 'port' | 'metro_area';
      }
    }

    export interface DestinationTerminal {
      data?: DestinationTerminal.Data;
    }

    export namespace DestinationTerminal {
      export interface Data {
        id: string;

        type: 'terminal' | 'rail_terminal';
      }
    }

    export interface LineTrackingStoppedByUser {
      data?: LineTrackingStoppedByUser.Data;
    }

    export namespace LineTrackingStoppedByUser {
      export interface Data {
        id: string;

        type: 'user';
      }
    }

    export interface PodTerminal {
      data?: PodTerminal.Data;
    }

    export namespace PodTerminal {
      export interface Data {
        id: string;

        type: 'terminal';
      }
    }

    export interface PortOfDischarge {
      data?: PortOfDischarge.Data | null;
    }

    export namespace PortOfDischarge {
      export interface Data {
        id: string;

        type: 'port';
      }
    }

    export interface PortOfLading {
      data?: PortOfLading.Data | null;
    }

    export namespace PortOfLading {
      export interface Data {
        id: string;

        type: 'port';
      }
    }
  }
}

export interface ShipmentRetrieveResponse {
  data?: Shipment;

  included?: Array<ContainersAPI.Container | PortsAPI.Port | TerminalsAPI.Terminal>;
}

export interface ShipmentUpdateResponse {
  data?: Shipment;
}

export interface ShipmentListResponse {
  data?: Array<Shipment>;

  included?: Array<ContainersAPI.Container | PortsAPI.Port | TerminalsAPI.Terminal>;

  links?: Links;

  meta?: Meta;
}

export interface ShipmentResumeTrackingResponse {
  data?: Shipment;
}

export interface ShipmentStopTrackingResponse {
  data?: Shipment;
}

export interface ShipmentRetrieveParams {
  /**
   * Comma delimited list of relations to include
   */
  include?: string;
}

export interface ShipmentUpdateParams {
  data?: ShipmentUpdateParams.Data;
}

export namespace ShipmentUpdateParams {
  export interface Data {
    attributes: Data.Attributes;
  }

  export namespace Data {
    export interface Attributes {
      /**
       * Shipment ref numbers.
       */
      ref_numbers?: Array<string>;

      /**
       * Tags related to a shipment
       */
      shipment_tags?: Array<string>;
    }
  }
}

export interface ShipmentListParams {
  /**
   * Comma delimited list of relations to include
   */
  include?: string;

  /**
   * Search shipments by the original request tracking `request_number`
   */
  number?: string;

  'page[number]'?: number;

  'page[size]'?: number;

  /**
   * Search shipments by master bill of lading, reference number, or container
   * number.
   */
  q?: string;
}

export declare namespace Shipments {
  export {
    type Links as Links,
    type Meta as Meta,
    type Shipment as Shipment,
    type ShipmentRetrieveResponse as ShipmentRetrieveResponse,
    type ShipmentUpdateResponse as ShipmentUpdateResponse,
    type ShipmentListResponse as ShipmentListResponse,
    type ShipmentResumeTrackingResponse as ShipmentResumeTrackingResponse,
    type ShipmentStopTrackingResponse as ShipmentStopTrackingResponse,
    type ShipmentRetrieveParams as ShipmentRetrieveParams,
    type ShipmentUpdateParams as ShipmentUpdateParams,
    type ShipmentListParams as ShipmentListParams,
  };
}
