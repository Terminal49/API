// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../resource';
import * as ContainersAPI from './containers';
import * as ShipmentsAPI from './shipments';
import * as TrackingRequestsAPI from './tracking-requests';
import * as WebhooksAPI from './webhooks';
import { APIPromise } from '../api-promise';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class WebhookNotifications extends APIResource {
  retrieve(
    id: string,
    query: WebhookNotificationRetrieveParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<WebhookNotificationRetrieveResponse> {
    return this._client.get(path`/webhook_notifications/${id}`, { query, ...options });
  }

  /**
   * Return the list of webhook notifications. This can be useful for reconciling
   * your data if your endpoint has been down.
   */
  list(
    query: WebhookNotificationListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<WebhookNotificationListResponse> {
    return this._client.get('/webhook_notifications', { query, ...options });
  }

  /**
   * Returns an example payload as it would be sent to a webhook endpoint for the
   * provided `event`
   */
  getExamples(
    query: WebhookNotificationGetExamplesParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<WebhookNotificationGetExamplesResponse> {
    return this._client.get('/webhook_notifications/examples', { query, ...options });
  }
}

export interface EstimatedEvent {
  id: string;

  attributes: EstimatedEvent.Attributes;

  relationships: EstimatedEvent.Relationships;

  type: 'estimated_event';
}

export namespace EstimatedEvent {
  export interface Attributes {
    /**
     * When the estimated event was created
     */
    created_at: string;

    estimated_timestamp: string;

    event: 'shipment.estimated.arrival';

    /**
     * The original source of the event data
     */
    data_source?: 'shipping_line' | 'terminal';

    /**
     * UNLOCODE of the event location
     */
    location_locode?: string | null;

    /**
     * IANA tz
     */
    timezone?: string | null;

    voyage_number?: string | null;
  }

  export interface Relationships {
    shipment: Relationships.Shipment;

    port?: Relationships.Port;

    vessel?: Relationships.Vessel;
  }

  export namespace Relationships {
    export interface Shipment {
      data: Shipment.Data;
    }

    export namespace Shipment {
      export interface Data {
        id: string;

        type: 'shipment';
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

    export interface Vessel {
      data?: Vessel.Data | null;
    }

    export namespace Vessel {
      export interface Data {
        id?: string;

        type?: 'vessel';
      }
    }
  }
}

export interface WebhookNotification {
  id?: string;

  attributes?: WebhookNotification.Attributes;

  relationships?: WebhookNotification.Relationships;

  type?: 'webhook_notification';
}

export namespace WebhookNotification {
  export interface Attributes {
    created_at: string;

    /**
     * Whether the notification has been delivered to the webhook endpoint
     */
    delivery_status: 'pending' | 'succeeded' | 'failed';

    event:
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
      | 'shipment.estimated.arrival'
      | 'tracking_request.succeeded'
      | 'tracking_request.failed'
      | 'tracking_request.awaiting_manifest'
      | 'tracking_request.tracking_stopped'
      | 'container.created'
      | 'container.updated'
      | 'container.pod_terminal_changed'
      | 'container.transport.arrived_at_inland_destination'
      | 'container.transport.estimated.arrived_at_inland_destination'
      | 'container.pickup_lfd.changed';
  }

  export interface Relationships {
    webhook: Relationships.Webhook;

    reference_object?: Relationships.ReferenceObject;
  }

  export namespace Relationships {
    export interface Webhook {
      data?: Webhook.Data;
    }

    export namespace Webhook {
      export interface Data {
        id?: string;

        type?: 'webhook';
      }
    }

    export interface ReferenceObject {
      data?: ReferenceObject.Data;
    }

    export namespace ReferenceObject {
      export interface Data {
        id?: string;

        type?: 'tracking_request' | 'estimated_event' | 'transport_event' | 'container_updated_event';
      }
    }
  }
}

export interface WebhookNotificationRetrieveResponse {
  data?: WebhookNotification;

  included?: Array<
    | WebhooksAPI.Webhook
    | TrackingRequestsAPI.TrackingRequest
    | ContainersAPI.TransportEvent
    | EstimatedEvent
    | WebhookNotificationRetrieveResponse.ContainerUpdatedEvent
  >;
}

export namespace WebhookNotificationRetrieveResponse {
  export interface ContainerUpdatedEvent {
    relationships: ContainerUpdatedEvent.Relationships;

    id?: string;

    attributes?: ContainerUpdatedEvent.Attributes;

    type?: string;
  }

  export namespace ContainerUpdatedEvent {
    export interface Relationships {
      container: Relationships.Container;

      terminal: Relationships.Terminal;
    }

    export namespace Relationships {
      export interface Container {
        data: Container.Data;
      }

      export namespace Container {
        export interface Data {
          id: string;

          type: 'container';
        }
      }

      export interface Terminal {
        data: Terminal.Data;
      }

      export namespace Terminal {
        export interface Data {
          id: string;

          type: 'terminal';
        }
      }
    }

    export interface Attributes {
      /**
       * A hash of all the changed attributes with the values being an array of the
       * before and after. E.g. `{"pickup_lfd": [null, "2020-05-20"]}`
       *
       * The current attributes that can be alerted on are:
       *
       * - `available_for_pickup`
       * - `pickup_lfd`
       * - `fees_at_pod_terminal`
       * - `holds_at_pod_terminal`
       * - `pickup_appointment_at`
       * - `pod_terminal`
       */
      changeset: unknown;

      timestamp: string;

      data_source?: 'terminal';

      /**
       * IANA tz
       */
      timezone?: string;
    }
  }
}

export interface WebhookNotificationListResponse {
  data?: Array<WebhookNotification>;

  included?: Array<
    WebhooksAPI.Webhook | TrackingRequestsAPI.TrackingRequest | ContainersAPI.TransportEvent | EstimatedEvent
  >;

  links?: ShipmentsAPI.Links;

  meta?: ShipmentsAPI.Meta;
}

export interface WebhookNotificationGetExamplesResponse {
  data?: Array<WebhookNotification>;

  included?: Array<
    WebhooksAPI.Webhook | TrackingRequestsAPI.TrackingRequest | ContainersAPI.TransportEvent | EstimatedEvent
  >;

  links?: ShipmentsAPI.Links;

  meta?: ShipmentsAPI.Meta;
}

export interface WebhookNotificationRetrieveParams {
  /**
   * Comma delimited list of relations to include.
   */
  include?: string;
}

export interface WebhookNotificationListParams {
  /**
   * Comma delimited list of relations to include.
   */
  include?: string;

  'page[number]'?: number;

  'page[size]'?: number;
}

export interface WebhookNotificationGetExamplesParams {
  /**
   * The webhook notification event name you wish to see an example of
   */
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
    | 'shipment.estimated.arrival'
    | 'tracking_request.succeeded'
    | 'tracking_request.failed'
    | 'tracking_request.awaiting_manifest'
    | 'tracking_request.tracking_stopped'
    | 'container.created'
    | 'container.updated'
    | 'container.pod_terminal_changed'
    | 'container.transport.arrived_at_inland_destination'
    | 'container.transport.estimated.arrived_at_inland_destination'
    | 'container.pickup_lfd.changed';
}

export declare namespace WebhookNotifications {
  export {
    type EstimatedEvent as EstimatedEvent,
    type WebhookNotification as WebhookNotification,
    type WebhookNotificationRetrieveResponse as WebhookNotificationRetrieveResponse,
    type WebhookNotificationListResponse as WebhookNotificationListResponse,
    type WebhookNotificationGetExamplesResponse as WebhookNotificationGetExamplesResponse,
    type WebhookNotificationRetrieveParams as WebhookNotificationRetrieveParams,
    type WebhookNotificationListParams as WebhookNotificationListParams,
    type WebhookNotificationGetExamplesParams as WebhookNotificationGetExamplesParams,
  };
}
