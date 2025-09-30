// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import { APIResource } from '../core/resource';
import * as ShipmentsAPI from './shipments';
import { APIPromise } from '../core/api-promise';
import { buildHeaders } from '../internal/headers';
import { RequestOptions } from '../internal/request-options';
import { path } from '../internal/utils/path';

export class Webhooks extends APIResource {
  /**
   * You can configure a webhook via the API to be notified about events that happen
   * in your Terminal49 account. These events can be realted to tracking_requests,
   * shipments and containers.
   *
   * This is the recommended way tracking shipments and containers via the API. You
   * should use this instead of polling our the API periodically.
   *
   * @example
   * ```ts
   * const webhook = await client.webhooks.create({
   *   data: {
   *     attributes: { ... },
   *     type: 'webhook',
   *   },
   * });
   * ```
   */
  create(body: WebhookCreateParams, options?: RequestOptions): APIPromise<WebhookCreateResponse> {
    return this._client.post('/webhooks', { body, ...options });
  }

  /**
   * Get the details of a single webhook
   *
   * @example
   * ```ts
   * const webhook = await client.webhooks.retrieve('id');
   * ```
   */
  retrieve(id: string, options?: RequestOptions): APIPromise<WebhookRetrieveResponse> {
    return this._client.get(path`/webhooks/${id}`, options);
  }

  /**
   * Update a single webhook
   *
   * @example
   * ```ts
   * const webhook = await client.webhooks.update('id', {
   *   data: { attributes: {}, type: 'webhook' },
   * });
   * ```
   */
  update(id: string, body: WebhookUpdateParams, options?: RequestOptions): APIPromise<WebhookUpdateResponse> {
    return this._client.patch(path`/webhooks/${id}`, { body, ...options });
  }

  /**
   * Get a list of all the webhooks
   *
   * @example
   * ```ts
   * const webhooks = await client.webhooks.list();
   * ```
   */
  list(
    query: WebhookListParams | null | undefined = {},
    options?: RequestOptions,
  ): APIPromise<WebhookListResponse> {
    return this._client.get('/webhooks', { query, ...options });
  }

  /**
   * Delete a webhook
   *
   * @example
   * ```ts
   * await client.webhooks.delete('id');
   * ```
   */
  delete(id: string, options?: RequestOptions): APIPromise<void> {
    return this._client.delete(path`/webhooks/${id}`, {
      ...options,
      headers: buildHeaders([{ Accept: '*/*' }, options?.headers]),
    });
  }

  /**
   * Return the list of IPs used for sending webhook notifications. This can be
   * useful for whitelisting the IPs on the firewall.
   *
   * @example
   * ```ts
   * const response = await client.webhooks.listIPs();
   * ```
   */
  listIPs(options?: RequestOptions): APIPromise<WebhookListIPsResponse> {
    return this._client.get('/webhooks/ips', options);
  }
}

export interface Webhook {
  id: string;

  type: 'webhook';

  attributes?: Webhook.Attributes;
}

export namespace Webhook {
  export interface Attributes {
    /**
     * Whether the webhook will be delivered when events are triggered
     */
    active: boolean;

    /**
     * The list of events to enabled for this endpoint
     */
    events: Array<
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
      | 'container.pickup_lfd.changed'
    >;

    /**
     * A random token that will sign all delivered webhooks
     */
    secret: string;

    /**
     * https end point
     */
    url: string;

    headers?: Array<Attributes.Header> | null;
  }

  export namespace Attributes {
    export interface Header {
      name?: string;

      value?: string;
    }
  }
}

export interface WebhookCreateResponse {
  data?: Webhook;
}

export interface WebhookRetrieveResponse {
  data?: Webhook;
}

export interface WebhookUpdateResponse {
  data?: Webhook;
}

export interface WebhookListResponse {
  data?: Array<Webhook>;

  links?: ShipmentsAPI.Links;

  meta?: ShipmentsAPI.Meta;
}

export interface WebhookListIPsResponse {
  last_updated?: string;

  webhook_notification_ips?: Array<string>;
}

export interface WebhookCreateParams {
  data: WebhookCreateParams.Data;
}

export namespace WebhookCreateParams {
  export interface Data {
    attributes: Data.Attributes;

    type: 'webhook';
  }

  export namespace Data {
    export interface Attributes {
      active: boolean;

      /**
       * The URL of the webhook endpoint.
       */
      url: string;

      /**
       * The list of events to enable for this endpoint.
       */
      events?: Array<
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
        | 'container.pickup_lfd.changed'
      >;

      /**
       * Optional custom headers to pass with each webhook invocation
       */
      headers?: Array<Attributes.Header>;
    }

    export namespace Attributes {
      export interface Header {
        /**
         * The name of the header. (Please note this will be auto-capitalized)
         */
        name?: string;

        /**
         * The value to pass for the header
         */
        value?: string;
      }
    }
  }
}

export interface WebhookUpdateParams {
  data: WebhookUpdateParams.Data;
}

export namespace WebhookUpdateParams {
  export interface Data {
    attributes: Data.Attributes;

    type: 'webhook';
  }

  export namespace Data {
    export interface Attributes {
      active?: boolean;

      /**
       * The list of events to enable for this endpoint.
       */
      events?: Array<
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
        | 'container.pickup_lfd.changed'
      >;

      /**
       * Optional custom headers to pass with each webhook invocation
       */
      headers?: Array<Attributes.Header>;

      /**
       * The URL of the webhook endpoint.
       */
      url?: string;
    }

    export namespace Attributes {
      export interface Header {
        /**
         * The name of the header. (Please not this will be auto-capitalized)
         */
        name?: string;

        /**
         * The value to pass for the header
         */
        value?: string;
      }
    }
  }
}

export interface WebhookListParams {
  'page[number]'?: number;

  'page[size]'?: number;
}

export declare namespace Webhooks {
  export {
    type Webhook as Webhook,
    type WebhookCreateResponse as WebhookCreateResponse,
    type WebhookRetrieveResponse as WebhookRetrieveResponse,
    type WebhookUpdateResponse as WebhookUpdateResponse,
    type WebhookListResponse as WebhookListResponse,
    type WebhookListIPsResponse as WebhookListIPsResponse,
    type WebhookCreateParams as WebhookCreateParams,
    type WebhookUpdateParams as WebhookUpdateParams,
    type WebhookListParams as WebhookListParams,
  };
}
