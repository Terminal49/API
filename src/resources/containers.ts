// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import * as MetroAreasAPI from './metro-areas';
import * as PortsAPI from './ports';
import * as ShipmentsAPI from './shipments';
import * as TerminalsAPI from './terminals';
import * as VesselsAPI from './vessels';
import { APIPromise } from '../core/api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class Containers extends APIResource {
  /**
   * Retrieves the details of a container.
   */
  retrieve(
    id: string,
    query: ContainerRetrieveParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ContainerRetrieveResponse> {
    return this._client.get(path`/containers/${id}`, { query, ...options });
  }

  /**
   * Update a container
   */
  update(
    body: ContainerUpdateParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ContainerUpdateResponse> {
    return this._client.patch('/containers', { body, ...options });
  }

  /**
   * Returns a list of container. The containers are returned sorted by creation
   * date, with the most recently refreshed containers appearing first.
   *
   * This API will return all containers associated with the account.
   */
  list(
    query: ContainerListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ContainerListResponse> {
    return this._client.get('/containers', { query, ...options });
  }

  /**
   * #### Deprecation warning
   *
   * The `raw_events` endpoint is provided as-is.
   *
   * For past events we recommend consuming `transport_events`.
   *
   * ---
   *
   * Get a list of past and future (estimated) milestones for a container as reported
   * by the carrier. Some of the data is normalized even though the API is called
   * raw_events.
   *
   * Normalized attributes: `event` and `timestamp` timestamp. Not all of the `event`
   * values have been normalized. You can expect the the events related to container
   * movements to be normalized but there are cases where events are not normalized.
   *
   * For past historical events we recommend consuming `transport_events`. Although
   * there are fewer events here those events go through additional vetting and
   * normalization to avoid false positives and get you correct data.
   */
  getRawEvents(id: string, options?: RequestOptions): APIPromise<ContainerGetRawEventsResponse> {
    return this._client.get(path`/containers/${id}/raw_events`, options);
  }

  /**
   * Get a list of past transport events (canonical) for a container. All data has
   * been normalized across all carriers. These are a verified subset of the raw
   * events may also be sent as Webhook Notifications to a webhook endpoint.
   *
   * This does not provide any estimated future events. See
   * `container/:id/raw_events` endpoint for that.
   */
  getTransportEvents(
    id: string,
    query: ContainerGetTransportEventsParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<ContainerGetTransportEventsResponse> {
    return this._client.get(path`/containers/${id}/transport_events`, { query, ...options });
  }
}

/**
 * Represents the equipment during a specific journey.
 */
export interface Container {
  id: string;

  attributes: Container.Attributes;

  type: 'container';

  relationships?: Container.Relationships;
}

export namespace Container {
  export interface Attributes {
    /**
     * Whether Terminal 49 is receiving availability status from the terminal.
     */
    availability_known?: boolean;

    /**
     * If availability_known is true, then whether container is available to be picked
     * up at terminal.
     */
    available_for_pickup?: boolean | null;

    created_at?: string;

    /**
     * Time empty container was returned.
     */
    empty_terminated_at?: string | null;

    /**
     * IANA tz. Applies to attribute empty_terminated_at.
     */
    empty_terminated_timezone?: string | null;

    equipment_height?: 'standard' | 'high_cube' | null;

    equipment_length?: 10 | 20 | 40 | 45 | null;

    equipment_type?: 'dry' | 'reefer' | 'open top' | 'flat rack' | 'bulk' | 'tank' | null;

    fees_at_pod_terminal?: Array<Attributes.FeesAtPodTerminal>;

    /**
     * Pickup time at final destination for inland moves.
     */
    final_destination_full_out_at?: string | null;

    /**
     * IANA tz. Applies to attribute final_destination_full_out_at.
     */
    final_destination_timezone?: string | null;

    holds_at_pod_terminal?: Array<Attributes.HoldsAtPodTerminal>;

    ind_ata_at?: string | null;

    ind_eta_at?: string | null;

    ind_facility_lfd_on?: string | null;

    /**
     * The SCAC of the rail carrier for the delivery leg of the container's
     * journey.(BETA)
     */
    ind_rail_carrier_scac?: string | null;

    ind_rail_unloaded_at?: string | null;

    /**
     * Location at port of discharge terminal
     */
    location_at_pod_terminal?: string | null;

    number?: string;

    /**
     * When available the pickup appointment time at the terminal is returned.
     */
    pickup_appointment_at?: string | null;

    /**
     * The last free day for pickup before demmurage accrues. Corresponding timezone is
     * pod_timezone.
     */
    pickup_lfd?: string | null;

    /**
     * Time the vessel arrived at the POD
     */
    pod_arrived_at?: string | null;

    /**
     * Discharge time at the port of discharge
     */
    pod_discharged_at?: string | null;

    /**
     * Full Out time at port of discharge. Null for inland moves.
     */
    pod_full_out_at?: string | null;

    /**
     * The chassis number used when container was picked up at POD (if available)
     */
    pod_full_out_chassis_number?: string | null;

    pod_last_tracking_request_at?: string | null;

    /**
     * The SCAC of the rail carrier for the pickup leg of the container's
     * journey.(BETA)
     */
    pod_rail_carrier_scac?: string | null;

    pod_rail_departed_at?: string | null;

    pod_rail_loaded_at?: string | null;

    /**
     * IANA tz. Applies to attributes pod_arrived_at, pod_discharged_at,
     * pickup_appointment_at, pod_full_out_at.
     */
    pod_timezone?: string | null;

    ref_numbers?: Array<string>;

    seal_number?: string | null;

    shipment_last_tracking_request_at?: string | null;

    /**
     * When the terminal was last checked.
     */
    terminal_checked_at?: string | null;

    weight_in_lbs?: number | null;
  }

  export namespace Attributes {
    export interface FeesAtPodTerminal {
      /**
       * The fee amount in local currency
       */
      amount: number;

      type: 'demurrage' | 'exam' | 'extended_dwell_time' | 'other' | 'total';

      /**
       * The ISO 4217 currency code of the fee is charged in. E.g. USD
       */
      currency_code?: string;
    }

    export interface HoldsAtPodTerminal {
      name: string;

      status: 'pending' | 'hold';

      /**
       * Text description from the terminal (if any)
       */
      description?: string | null;
    }
  }

  export interface Relationships {
    pickup_facility?: Relationships.PickupFacility;

    pod_terminal?: Relationships.PodTerminal;

    raw_events?: Relationships.RawEvents;

    shipment?: Relationships.Shipment;

    transport_events?: Relationships.TransportEvents;
  }

  export namespace Relationships {
    export interface PickupFacility {
      data?: PickupFacility.Data;
    }

    export namespace PickupFacility {
      export interface Data {
        id?: string;

        type?: 'terminal';
      }
    }

    export interface PodTerminal {
      data?: PodTerminal.Data;
    }

    export namespace PodTerminal {
      export interface Data {
        id?: string;

        type?: 'terminal';
      }
    }

    export interface RawEvents {
      data?: Array<RawEvents.Data>;
    }

    export namespace RawEvents {
      export interface Data {
        id?: string;

        type?: 'raw_event';
      }
    }

    export interface Shipment {
      data?: Shipment.Data;
    }

    export namespace Shipment {
      export interface Data {
        id?: string;

        type?: 'shipment';
      }
    }

    export interface TransportEvents {
      data?: Array<TransportEvents.Data>;
    }

    export namespace TransportEvents {
      export interface Data {
        id?: string;

        type?: 'transport_event';
      }
    }
  }
}

export interface TransportEvent {
  id: string;

  type: 'transport_event';

  attributes?: TransportEvent.Attributes;

  relationships?: TransportEvent.Relationships;
}

export namespace TransportEvent {
  export interface Attributes {
    created_at?: string;

    /**
     * The original source of the event data
     */
    data_source?: 'shipping_line' | 'terminal' | 'ais';

    event?:
      | 'container.transport.vessel_arrived'
      | 'container.transport.vessel_discharged'
      | 'container.transport.vessel_loaded'
      | 'container.transport.vessel_departed'
      | 'container.transport.rail_departed'
      | 'container.transport.rail_arrived'
      | 'container.transport.rail_loaded'
      | 'container.transport.rail_unloaded'
      | 'container.transport.transshipment_arrived'
      | 'container.transport.transshipment_discharged'
      | 'container.transport.transshipment_loaded'
      | 'container.transport.transshipment_departed'
      | 'container.transport.feeder_arrived'
      | 'container.transport.feeder_discharged'
      | 'container.transport.feeder_loaded'
      | 'container.transport.feeder_departed'
      | 'container.transport.empty_out'
      | 'container.transport.full_in'
      | 'container.transport.full_out'
      | 'container.transport.empty_in'
      | 'container.transport.vessel_berthed'
      | 'container.transport.arrived_at_inland_destination'
      | 'container.transport.estimated.arrived_at_inland_destination'
      | 'container.pickup_lfd.changed';

    /**
     * UNLOCODE of the event location
     */
    location_locode?: string | null;

    timestamp?: string | null;

    /**
     * IANA tz
     */
    timezone?: string | null;

    voyage_number?: string | null;
  }

  export interface Relationships {
    container?: Relationships.Container;

    location?: Relationships.Location;

    shipment?: Relationships.Shipment;

    terminal?: Relationships.Terminal;

    vessel?: Relationships.Vessel;
  }

  export namespace Relationships {
    export interface Container {
      data?: Container.Data;
    }

    export namespace Container {
      export interface Data {
        id?: string;

        type?: 'container';
      }
    }

    export interface Location {
      data?: Location.Data | null;
    }

    export namespace Location {
      export interface Data {
        id?: string;

        type?: 'port' | 'metro_area';
      }
    }

    export interface Shipment {
      data?: Shipment.Data;
    }

    export namespace Shipment {
      export interface Data {
        id?: string;

        type?: 'shipment';
      }
    }

    export interface Terminal {
      data?: Terminal.Data | null;
    }

    export namespace Terminal {
      export interface Data {
        id?: string;

        type?: 'terminal' | 'rail_terminal';
      }
    }

    export interface Vessel {
      data?: Vessel.Data | null;
    }

    export namespace Vessel {
      export interface Data {
        id?: string;

        name?: 'vessel';
      }
    }
  }
}

export interface ContainerRetrieveResponse {
  /**
   * Represents the equipment during a specific journey.
   */
  data?: Container;

  included?: Array<ShipmentsAPI.Shipment | TerminalsAPI.Terminal | TransportEvent>;
}

export interface ContainerUpdateResponse {
  /**
   * Represents the equipment during a specific journey.
   */
  data?: Container;
}

export interface ContainerListResponse {
  data?: Array<Container>;

  included?: Array<ShipmentsAPI.Shipment>;

  links?: ShipmentsAPI.Links;

  meta?: ShipmentsAPI.Meta;
}

export interface ContainerGetRawEventsResponse {
  data?: Array<ContainerGetRawEventsResponse.Data>;
}

export namespace ContainerGetRawEventsResponse {
  /**
   * Raw Events represent the milestones from the shipping line for a given
   * container.
   *
   * ### About raw_event datetimes
   *
   * The events may include estimated future events. The event is a future event if
   * an `estimated_` timestamp is not null.
   *
   * The datetime properties `timestamp` and `estimated`.
   *
   * When the `time_zone` property is present the datetimes are UTC timestamps, which
   * can be converted to the local time by parsing the provided `time_zone`.
   *
   * When the `time_zone` property is absent, the datetimes represent local times
   * which serialized as UTC timestamps for consistency.
   */
  export interface Data {
    id?: string;

    attributes?: Data.Attributes;

    relationships?: Data.Relationships;

    type?: 'raw_event';
  }

  export namespace Data {
    export interface Attributes {
      /**
       * Deprecated: The datetime the event transpired in UTC
       */
      actual_at?: string | null;

      /**
       * Deprecated: The date of the event at the event location when no time information
       * is available.
       */
      actual_on?: string | null;

      /**
       * When the raw_event was created in UTC
       */
      created_at?: string;

      /**
       * True if the timestamp is estimated, false otherwise
       */
      estimated?: boolean;

      /**
       * Deprecated: The estimated datetime the event will occur in UTC
       */
      estimated_at?: string | null;

      /**
       * Deprecated: The estimated date of the event at the event location when no time
       * information is available.
       */
      estimated_on?: string | null;

      /**
       * Normalized string representing the event
       */
      event?:
        | 'empty_out'
        | 'full_in'
        | 'positioned_in'
        | 'positioned_out'
        | 'vessel_loaded'
        | 'vessel_departed'
        | 'transshipment_arrived'
        | 'transshipment_discharged'
        | 'transshipment_loaded'
        | 'transshipment_departed'
        | 'feeder_arrived'
        | 'feeder_discharged'
        | 'feeder_loaded'
        | 'feeder_departed'
        | 'rail_loaded'
        | 'rail_departed'
        | 'rail_arrived'
        | 'rail_unloaded'
        | 'vessel_arrived'
        | 'vessel_discharged'
        | 'arrived_at_destination'
        | 'delivered'
        | 'full_out'
        | 'empty_in'
        | 'vgm_received'
        | 'carrier_release'
        | 'customs_release'
        | null;

      /**
       * The order of the event. This may be helpful when only dates (i.e. actual_on) are
       * available.
       */
      index?: number;

      /**
       * UNLOCODE of the event location
       */
      location_locode?: string | null;

      /**
       * The city or facility name of the event location
       */
      location_name?: string;

      /**
       * The event name as returned by the carrier
       */
      original_event?: string;

      /**
       * The datetime the event either transpired or will occur in UTC
       */
      timestamp?: string;

      /**
       * IANA tz where the event occured
       */
      timezone?: string | null;

      /**
       * The IMO of the vessel where applicable
       */
      vessel_imo?: string | null;

      /**
       * The name of the vessel where applicable
       */
      vessel_name?: string | null;

      voyage_number?: string | null;
    }

    export interface Relationships {
      location?: Relationships.Location;

      vessel?: Relationships.Vessel;
    }

    export namespace Relationships {
      export interface Location {
        data?: Location.Data;
      }

      export namespace Location {
        export interface Data {
          id?: string;

          type?: 'port' | 'metro_area';
        }
      }

      export interface Vessel {
        data?: Vessel.Data;
      }

      export namespace Vessel {
        export interface Data {
          id?: string;

          type?: 'vessel';
        }
      }
    }
  }
}

export interface ContainerGetTransportEventsResponse {
  data?: Array<TransportEvent>;

  included?: Array<
    | ShipmentsAPI.Shipment
    | Container
    | PortsAPI.Port
    | MetroAreasAPI.MetroArea
    | TerminalsAPI.Terminal
    | ContainerGetTransportEventsResponse.RailTerminal
    | VesselsAPI.Vessel
  >;

  links?: ShipmentsAPI.Links;

  meta?: ShipmentsAPI.Meta;
}

export namespace ContainerGetTransportEventsResponse {
  export interface RailTerminal {
    attributes: RailTerminal.Attributes;

    id?: string;

    relationships?: RailTerminal.Relationships;

    type?: 'rail_terminal';
  }

  export namespace RailTerminal {
    export interface Attributes {
      name: string;

      /**
       * CBP FIRMS Code or CBS Sublocation Code
       */
      firms_code?: string;

      nickname?: string;
    }

    export interface Relationships {
      metro_area?: Relationships.MetroArea;

      port?: Relationships.Port;
    }

    export namespace Relationships {
      export interface MetroArea {
        data?: MetroArea.Data;
      }

      export namespace MetroArea {
        export interface Data {
          id?: string;

          type?: 'metro_area';
        }
      }

      export interface Port {
        data?: Port.Data | null;
      }

      export namespace Port {
        export interface Data {
          id?: string;

          type?: 'port';
        }
      }
    }
  }
}

export interface ContainerRetrieveParams {
  /**
   * Comma delimited list of relations to include
   */
  include?: string;
}

export interface ContainerUpdateParams {
  data?: ContainerUpdateParams.Data;
}

export namespace ContainerUpdateParams {
  export interface Data {
    attributes: Data.Attributes;
  }

  export namespace Data {
    export interface Attributes {
      ref_numbers?: Array<string>;
    }
  }
}

export interface ContainerListParams {
  /**
   * Comma delimited list of relations to include
   */
  include?: string;

  'page[number]'?: number;

  'page[size]'?: number;

  /**
   * Number of seconds in which containers were refreshed
   */
  terminal_checked_before?: number;
}

export interface ContainerGetTransportEventsParams {
  /**
   * Comma delimited list of relations to include
   */
  include?: string;
}

export declare namespace Containers {
  export {
    type Container as Container,
    type TransportEvent as TransportEvent,
    type ContainerRetrieveResponse as ContainerRetrieveResponse,
    type ContainerUpdateResponse as ContainerUpdateResponse,
    type ContainerListResponse as ContainerListResponse,
    type ContainerGetRawEventsResponse as ContainerGetRawEventsResponse,
    type ContainerGetTransportEventsResponse as ContainerGetTransportEventsResponse,
    type ContainerRetrieveParams as ContainerRetrieveParams,
    type ContainerUpdateParams as ContainerUpdateParams,
    type ContainerListParams as ContainerListParams,
    type ContainerGetTransportEventsParams as ContainerGetTransportEventsParams,
  };
}
