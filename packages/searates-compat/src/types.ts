export type JsonObject = { [key: string]: JsonValue };
export type JsonValue =
  | JsonObject
  | JsonValue[]
  | boolean
  | null
  | number
  | string;

export interface ResourceIdentifier {
  id: string;
  type: string;
}

export interface JsonApiResource extends ResourceIdentifier {
  attributes?: JsonObject;
  relationships?: Record<
    string,
    { data?: ResourceIdentifier | ResourceIdentifier[] | null }
  >;
}

export interface JsonApiDocument {
  data: JsonApiResource | JsonApiResource[] | null;
  included?: JsonApiResource[];
  errors?: Array<{
    code?: string;
    detail?: string;
    status?: string;
    title?: string;
  }>;
}

export type TrackingType = 'BL' | 'BK' | 'CT';
export type Terminal49TrackingType =
  | 'bill_of_lading'
  | 'booking_number'
  | 'container';

export interface TrackingQuery {
  ais: boolean;
  forceUpdate: boolean;
  number: string;
  route: boolean;
  sealine?: string;
  type?: TrackingType;
}

export interface SeaRatesEvent {
  actual: boolean;
  date: string | null;
  description: string;
  event_code: string;
  event_type: 'EQUIPMENT' | 'TRANSPORT';
  facility: number | null;
  is_additional_event: boolean;
  is_date_from_sealine: boolean;
  location: number | null;
  order_id: number;
  status: string;
  transport_type: 'BARGE' | 'RAIL' | 'TRUCK' | 'VESSEL';
  type: 'land' | 'sea';
  vessel: number | null;
  voyage: string | null;
}

export interface SeaRatesEnvelope {
  status: 'error' | 'success';
  message: string;
  data: JsonValue;
}

export interface TrackingPayload {
  eventsByContainerId: Map<string, JsonApiDocument>;
  shipment: JsonApiResource;
  included: JsonApiResource[];
  requestedNumber: string;
  requestedType: TrackingType;
}
