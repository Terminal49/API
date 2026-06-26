/** Controls how SDK methods return API responses. */
export type ResponseFormat = 'raw' | 'mapped' | 'both';

/** Per-call options accepted by single-resource methods. */
export interface CallOptions {
  /** Override the client's default response format for this call. */
  format?: ResponseFormat;
}

/** Per-call options accepted by list methods. */
export interface ListOptions extends CallOptions {
  /** 1-based page number. */
  page?: number;
  /** Number of records per page. */
  pageSize?: number;
}

export type IncludeParam<TInclude extends string> =
  | readonly TInclude[]
  | string;

export type ShipmentInclude =
  | 'containers'
  | 'pod_terminal'
  | 'port_of_lading'
  | 'port_of_discharge'
  | 'destination'
  | 'destination_terminal';

export type ContainerInclude =
  | 'shipment'
  | 'pod_terminal'
  | 'pickup_facility'
  | 'transport_events';

export type TrackingRequestInclude = 'shipment' | 'container';
