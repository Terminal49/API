export interface ShippingLine {
  scac: string;
  name: string;
  shortName?: string;
  bolPrefix?: string;
  notes?: string;
}

export interface PaginationLinks {
  self?: string;
  current?: string;
  next?: string;
  prev?: string;
  first?: string;
  last?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  links?: PaginationLinks;
  meta?: Record<string, any>;
}

export interface Container {
  id: string;
  number?: string;
  status?: string;
  equipment?: {
    type?: string;
    length?: number;
    height?: number;
    weightLbs?: number;
  };
  location?: {
    currentLocation?: string;
    availableForPickup?: boolean;
    podArrivedAt?: string | null;
    podDischargedAt?: string | null;
  };
  demurrage?: {
    pickupLfd?: string | null;
    pickupAppointmentAt?: string | null;
    fees?: any[];
    holds?: any[];
  };
  terminals?: {
    podTerminal?: {
      id?: string;
      name?: string;
      nickname?: string;
      firmsCode?: string;
    } | null;
    destinationTerminal?: {
      id?: string;
      name?: string;
      nickname?: string;
      firmsCode?: string;
    } | null;
  };
  shipment?: Shipment | null;
  [key: string]: any;
}

export interface Shipment {
  id: string;
  billOfLading?: string;
  shippingLineScac?: string;
  customerName?: string;
  ports?: {
    portOfLading?: {
      locode?: string | null;
      name?: string | null;
      code?: string | null;
      countryCode?: string | null;
      etd?: string | null;
      atd?: string | null;
      timezone?: string | null;
    } | null;
    portOfDischarge?: {
      locode?: string | null;
      name?: string | null;
      code?: string | null;
      countryCode?: string | null;
      eta?: string | null;
      ata?: string | null;
      originalEta?: string | null;
      timezone?: string | null;
      terminal?: {
        id?: string;
        name?: string;
        nickname?: string;
        firmsCode?: string;
      } | null;
    } | null;
    destination?: {
      locode?: string | null;
      name?: string | null;
      eta?: string | null;
      ata?: string | null;
      timezone?: string | null;
      terminal?: {
        id?: string;
        name?: string;
        nickname?: string;
        firmsCode?: string;
      } | null;
    } | null;
  };
  tracking?: {
    lineTrackingLastAttemptedAt?: string | null;
    lineTrackingLastSucceededAt?: string | null;
    lineTrackingStoppedAt?: string | null;
    lineTrackingStoppedReason?: string | null;
  };
  containers?: Array<{ id: string; number?: string }>;
  [key: string]: any;
}

export interface Route {
  id?: string;
  totalLegs: number;
  locations: Array<{
    port?: {
      code?: string | null;
      name?: string | null;
      city?: string | null;
      countryCode?: string | null;
    } | null;
    inbound: {
      mode?: string | null;
      carrierScac?: string | null;
      eta?: string | null;
      ata?: string | null;
      vessel?: { name?: string | null; imo?: string | null } | null;
    };
    outbound: {
      mode?: string | null;
      carrierScac?: string | null;
      etd?: string | null;
      atd?: string | null;
      vessel?: { name?: string | null; imo?: string | null } | null;
    };
  }>;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface TrackingRequest {
  id: string;
  requestType?: string;
  requestNumber?: string;
  status?: string;
  scac?: string;
  refNumbers?: string[];
  shipment?: Shipment | null;
  container?: Container | null;
  [key: string]: any;
}
