/** Simplified shipping line returned by mapped SDK responses. */
export interface ShippingLine {
  scac: string;
  name: string;
  shortName?: string;
  bolPrefix?: string;
  notes?: string;
  /** Additional SCACs the carrier tracks under. */
  alternativeScacs?: string[];
  /** Whether the carrier supports tracking by bill of lading number. */
  billOfLadingTrackingSupport?: boolean;
  /** Whether the carrier supports tracking by booking number. */
  bookingNumberTrackingSupport?: boolean;
  /** Whether the carrier supports tracking by container number. */
  containerNumberTrackingSupport?: boolean;
}

/** Pagination links returned by Terminal49 list endpoints. */
export interface PaginationLinks {
  self?: string;
  current?: string;
  next?: string;
  prev?: string;
  first?: string;
  last?: string;
}

/** Mapped list response containing records plus pagination metadata. */
export interface PaginatedResult<T> {
  items: T[];
  links?: PaginationLinks;
  meta?: Record<string, any>;
}

/** Simplified container model returned by mapped SDK responses. */
export interface Container {
  id: string;
  number?: string;
  status?: string;
  /** Raw `current_status` from the API (also surfaced via `status`). */
  currentStatus?: string;
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

/** Simplified shipment model returned by mapped SDK responses. */
export interface Shipment {
  id: string;
  billOfLading?: string;
  shippingLineScac?: string;
  customerName?: string;
  /** Set on the shipment summary embedded in a mapped container. */
  portOfDischargeName?: string | null;
  podVesselName?: string | null;
  podEtaAt?: string | null;
  podAtaAt?: string | null;
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

/** Simplified container route model returned by mapped SDK responses. */
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

/** Simplified tracking request model returned by mapped SDK responses. */
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

/** Account-defined custom field value on a container, shipment, or tracking request. */
export interface CustomField {
  id: string;
  slug: string;
  name?: string;
  value: unknown;
  displayValue?: string | null;
  dataType?: string;
  updatedAt?: string | null;
}

/** Availability of one gated feature for the current credential on the current account. */
export interface FeatureAvailability {
  status:
    | 'available'
    | 'requires_paid_plan'
    | 'requires_user_credential'
    | 'not_enabled';
}

/** Tracking-slot usage on free and trial plans. */
export interface TrackingSlots {
  limit: number;
  used: number;
  remaining: number;
}

/** An account as `GET /me` describes it. */
export interface CurrentAccount {
  id: string;
  companyName: string;
  companyType?: string;
  scac?: string;
  abbrName?: string;
  city?: string;
  stateAbbr?: string;
  country?: string;
  /** Billing lifecycle state: free_plan, in_trial, customer, locked, or churned. */
  plan?: string;
  /** Present only on the account the credential is scoped to; `null` when not slot-limited. */
  trackingSlots?: TrackingSlots | null;
}

/** The signed-in user as `GET /me` describes them. */
export interface CurrentUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
  jobRole?: string;
  jobTitle?: string;
  /** `true` only for Terminal49 staff. */
  admin: boolean;
  /** Every open account this user can select with `x-account-id`. */
  accounts: CurrentAccount[];
}

/** Mapped `GET /me` response: the credential behind the current request. */
export interface CurrentCredential {
  /** The API key id or the user id, depending on `kind`. */
  id: string;
  kind: 'api_key' | 'user';
  /** api, dashboard, mcp, or askt49. */
  channel: string;
  /** API key label; undefined for user tokens. */
  name?: string;
  features: Record<string, FeatureAvailability>;
  account: CurrentAccount;
  /** `null` for an API key that is not acting as a user. */
  user: CurrentUser | null;
}
