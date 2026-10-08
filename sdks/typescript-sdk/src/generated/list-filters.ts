/** Generated from docs/openapi.json. Run npm run generate:types; do not edit. */
import type { ContainerInclude, IncludeParam, ShipmentInclude } from '../types/options.js';
export const CONTAINER_STATUSES = ["new","on_ship","available","not_available","grounded","on_rail","picked_up","off_dock","delivered","dropped","loaded","empty_returned","awaiting_inland_transfer"] as const;
export type ContainerStatus = (typeof CONTAINER_STATUSES)[number];
export const PARTY_ROLES = ["shipper","consignee","notify_party","customs_broker","customer","freight_forwarder","pickup_dray_carrier"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];
/** Comparison expressions are validated at runtime; arrays combine bounds with AND. */
export type DateFilter = string | readonly string[];
/** Generic string arrays use AND. Use comma-separated literals for OR unless specified otherwise. */
export type StringFilter = string | readonly string[];
export type PartyFilter = StringFilter | { value: StringFilter; operator?: 'any' | 'all' };
export type ContainerStatusFilter = ContainerStatus | `=${ContainerStatus}` | `${ContainerStatus},${string}` | '@exists' | '@not_exists' | readonly ContainerStatus[];
export const SHIPMENT_FILTER_KINDS = {
  "q": "search",
  "number": "exact",
  "created_at": "datetime",
  "actively_tracked": "boolean",
  "tracking_stopped": "boolean",
  "voyage_status": "voyage",
  "arriving_today": "selector",
  "pod_ata_at": "date",
  "pod_arrival": "date",
  "pod_code": "string",
  "pod_eta_changed_at": "datetime",
  "pod_terminal_id": "string",
  "pol_code": "string",
  "owner_id": "string",
  "creator_id": "string",
  "customer_id": "string",
  "product": "search",
  "party_id": "party",
  "tags": "tags",
  "tags_and": "boolean",
  "tag": "tags"
} as const;
/** Confirmed list filters; canonical names mirror API filter keys. */
export interface ShipmentListFilters {
/** Prefix text search across shipment numbers, reference numbers, and linked container identifiers. Use search text, not comparison expressions. */
q?: string;
/** Exact number match. Shipment arrays mean OR; container arrays of exact numbers mean AND. Use comma-separated container numbers for OR. Shipment scalar commas are literal. */
number?: StringFilter;
/** Creation date. Use an ISO 8601 date-time with Z or a timezone offset; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Relative dates and comma-separated timestamps are not accepted. Use `@exists` or `@not_exists` for presence. */
created_at?: DateFilter;
/** true selects shipments with tracking not stopped; false selects stopped tracking. Applies via the related shipment for containers. */
actively_tracked?: boolean;
/** true selects stopped tracking; false selects tracking not stopped. Combines with other filters using AND. */
tracking_stopped?: boolean;
/** arrived means actual POD arrival is present; on_ship means a voyage exists and actual POD arrival is absent. It is not a general shipment lifecycle status. */
voyage_status?: 'arrived' | 'on_ship';
/** true selects shipments with POD or destination estimated/actual arrival today in the API server day. false does not narrow the list. The SDK accepts only true. */
arriving_today?: true;
/** Actual POD arrival date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pod_ata_at?: DateFilter;
/** POD arrival date: actual arrival takes precedence over estimated arrival. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pod_arrival?: DateFilter;
/** Port of discharge UN/LOCODE. Use exact literals, comma-separated values, or arrays with OR semantics. Presence checks and comparison/search operators do not apply to this scope. */
pod_code?: StringFilter;
/** Meaningful change in the POD-local ETA date, comparing the current ETA with its historical baseline. Requires a lower ISO 8601 timestamp bound (=, `>`, or `>=`); an optional upper bound must be later. Applies only to active, unarrived shipments with an ETA. Not a raw updated_at filter; a future lower bound is not guaranteed to produce no matches. */
pod_eta_changed_at?: DateFilter;
/** Port of discharge terminal ID. Obtain it from the related terminal resource. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean OR for this shipment terminal filter. ~ is not supported. */
pod_terminal_id?: StringFilter;
/** Port of lading UN/LOCODE. Use exact literals, comma-separated values, or arrays with OR semantics. Presence checks and comparison/search operators do not apply to this scope. */
pol_code?: StringFilter;
/** User ID associated with a shipment container. Accepts one ID, comma-separated IDs, or arrays with OR semantics. Use exact literals, comma-separated values, or arrays with OR semantics. Presence checks and comparison/search operators do not apply to this scope. */
owner_id?: StringFilter;
/** Shipment creator account ID. Comma-separated IDs mean OR; arrays of distinct IDs mean AND and return no matches. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
creator_id?: StringFilter;
/** Customer account ID or customer party ID. Falls back to the shipment creator when no customer party role exists. Presence checks refer to the customer party role. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
customer_id?: StringFilter;
/** Prefix text search of an associated product name or SKU. */
product?: string;
/** Party ID match. Accepts a scalar, comma-separated IDs, an array (OR), or an object with value and operator (any or all). Values must come from parties visible to your account. */
party_id?: PartyFilter;
/** Account-scoped shipment tags. Comma-separated names or arrays match ANY tag by default. */
tags?: StringFilter;
/** With tags, true requires ALL tags; false or absent means ANY. Has no effect without tags. The SDK requires tags (or shipment tag) when this modifier is supplied. */
tags_and?: boolean;
/** Alias for tags. When both are present, tag takes precedence. Uses the requesting account tag names. */
tag?: StringFilter;
include?: IncludeParam<ShipmentInclude>;
/** Supported API sort token(s); validated before the request. */
sort?: string;
/** @deprecated Use pod_code. */
port?: string;
includeContainers?: boolean;
/** @deprecated Use tracking_stopped. */
trackingStopped?: boolean;
/** @deprecated Unsupported. Use voyage_status for voyage arrival state. */
status?: string;
/** @deprecated Unsupported on shipments; use containers.shipping_line_scac. */
carrier?: string;
/** @deprecated Timestamp semantics cannot be preserved by a date-only filter. */
updatedAfter?: string;
}
export const CONTAINER_FILTER_KINDS = {
  "number": "string",
  "pol": "string",
  "pod": "string",
  "destination": "string",
  "pol_code": "string",
  "pod_code": "string",
  "destination_code": "string",
  "shipping_line_scac": "string",
  "customer_id": "string",
  "customer_name": "string",
  "vessel_name": "string",
  "pod_terminal_id": "string",
  "current_status": "status",
  "has_fees": "boolean",
  "has_demurrage_fees": "boolean",
  "has_fees_or_holds": "boolean",
  "requires_attention": "boolean",
  "eta_changed_in_last_24h": "selector",
  "eta_changed_in_past_3_days": "selector",
  "has_holds": "boolean",
  "hold_names": "string",
  "actively_tracked": "boolean",
  "search_by_ids": "search",
  "search_by_number": "search",
  "search_by_shipment_number": "search",
  "search_by_shipment_ref_numbers": "search",
  "search_by_ref_numbers": "search",
  "search_by_owner_id": "string",
  "delivered_at": "date",
  "pod_discharged_at": "date",
  "pod_arrived_at": "date",
  "pol_etd_at": "date",
  "pol_atd_at": "date",
  "empty_out_at": "date",
  "pol_full_in_at": "date",
  "pol_vessel_loaded_at": "date",
  "pol_vessel_departed_at": "date",
  "arrival": "date",
  "picked_up_at": "date",
  "empty_returned_at": "date",
  "created_at": "date",
  "updated_at": "date",
  "last_free_day_on": "range",
  "inland_destination_rail_unloaded_at": "date",
  "final_destination_full_out_at": "date",
  "inland_destination_eta_at": "date",
  "inland_destination_ata_at": "date",
  "pod_rail_departed_at": "date",
  "pickup_lfd": "date",
  "pickup_lfd_rail_on": "date",
  "pickup_lfd_terminal_on": "date",
  "pickup_lfd_line_on": "date",
  "pickup_lfd_terminal_effective_on": "date",
  "pickup_lfd_line_effective_on": "date",
  "tags": "tags",
  "tags_and": "boolean",
  "parties": "parties"
} as const;
/** Confirmed list filters; canonical names mirror API filter keys. */
export interface ContainerListFilters {
/** Exact number match. Shipment arrays mean OR; container arrays of exact numbers mean AND. Use comma-separated container numbers for OR. Shipment scalar commas are literal. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
number?: StringFilter;
/** Port of lading name (including raw routing data when no port relationship exists). Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
pol?: StringFilter;
/** Port of discharge name (including raw routing data when no port relationship exists). Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
pod?: StringFilter;
/** Destination name, including raw routing data when no port relationship exists. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
destination?: StringFilter;
/** Port of lading UN/LOCODE. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
pol_code?: StringFilter;
/** Port of discharge UN/LOCODE. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
pod_code?: StringFilter;
/** Destination UN/LOCODE. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
destination_code?: StringFilter;
/** Shipping line Standard Carrier Alpha Code (SCAC). Obtain valid values from GET /shipping_lines; preserve their exact codes. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
shipping_line_scac?: StringFilter;
/** Customer account ID or customer party ID. Falls back to the shipment creator when no customer party role exists. Presence checks refer to the customer party role. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
customer_id?: StringFilter;
/** Exact, case-sensitive customer company name. Prefer customer_id for names containing punctuation rejected by the string parser. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
customer_name?: StringFilter;
/** Exact vessel name. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
vessel_name?: StringFilter;
/** Port of discharge terminal ID. Obtain it from the related terminal resource. Exact match by default; optional =, `@exists`, or `@not_exists`. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported. */
pod_terminal_id?: StringFilter;
/** Container status. Known values: new, on_ship, available, not_available, grounded, on_rail, picked_up, off_dock, delivered, dropped, loaded, empty_returned, awaiting_inland_transfer. Unknown values return no matches in the API; the SDK rejects them. Comma-separated states mean OR; arrays mean AND. */
current_status?: ContainerStatusFilter;
/** true requires nonempty terminal fees; false requires an explicitly empty terminal fee array. Unreported/null fees match neither branch. */
has_fees?: boolean;
/** true requires a terminal demurrage fee; false selects terminal records without a demurrage fee. Missing terminal data can be excluded. */
has_demurrage_fees?: boolean;
/** true requires fees OR holds; false requires both arrays to be explicitly empty. Missing terminal data can be excluded. */
has_fees_or_holds?: boolean;
/** true selects attention-marked, overdue pickup, or approaching-LFD containers. false selects containers whose stored attention value is false or null; it is not the exact complement of true. */
requires_attention?: boolean;
/** Selects containers with estimated-event changes in the last 24 hours. Both true and false apply the positive selector in the API. The SDK accepts only true. */
eta_changed_in_last_24h?: true;
/** Selects containers with estimated-event changes in the past three days. Both true and false apply the positive selector in the API. The SDK accepts only true. */
eta_changed_in_past_3_days?: true;
/** true requires nonempty terminal holds; false requires an explicitly empty holds array. Unreported/null holds match neither branch. */
has_holds?: boolean;
/** Active terminal hold names (status hold; pending holds do not match), case-insensitive, such as freight, customs, USDA, or other. Comma-separated names mean ANY. Names come from terminal feeds, so read them from holds_at_pod_terminal rather than assuming a fixed list. Use has_holds for presence. */
hold_names?: StringFilter;
/** true selects shipments with tracking not stopped; false selects stopped tracking. Applies via the related shipment for containers. */
actively_tracked?: boolean;
/** Prefix text search of container and linked shipment identifiers. Optional ~ prefix is supported here. Do not use ~ on exact string filters. */
search_by_ids?: string;
/** Prefix text search of container numbers. Optional ~ prefix is supported here. Do not use ~ on exact string filters. */
search_by_number?: string;
/** Prefix text search of shipment numbers. Optional ~ prefix is supported here. Do not use ~ on exact string filters. */
search_by_shipment_number?: string;
/** Prefix text search of shipment reference numbers. Optional ~ prefix is supported here. Do not use ~ on exact string filters. */
search_by_shipment_ref_numbers?: string;
/** Prefix text search of container reference numbers. Optional ~ prefix is supported here. Do not use ~ on exact string filters. */
search_by_ref_numbers?: string;
/** User IDs associated with containers. Use one ID or comma-separated user IDs; bracketed arrays are not supported by this scope. Presence and search operators do not apply. */
search_by_owner_id?: string;
/** Delivery date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
delivered_at?: DateFilter;
/** POD discharge date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pod_discharged_at?: DateFilter;
/** Container POD arrival date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pod_arrived_at?: DateFilter;
/** Estimated port of lading departure date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pol_etd_at?: DateFilter;
/** Actual port of lading departure date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pol_atd_at?: DateFilter;
/** Empty equipment out date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
empty_out_at?: DateFilter;
/** Full equipment in at port of lading date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pol_full_in_at?: DateFilter;
/** Vessel loading at port of lading date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pol_vessel_loaded_at?: DateFilter;
/** Vessel departure at port of lading date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pol_vessel_departed_at?: DateFilter;
/** POD arrival date: actual arrival takes precedence over estimated arrival. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
arrival?: DateFilter;
/** Pickup date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
picked_up_at?: DateFilter;
/** Empty return date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
empty_returned_at?: DateFilter;
/** Creation date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
created_at?: DateFilter;
/** Last record update date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
updated_at?: DateFilter;
/** Inclusive two-date range, encoded as filter[last_free_day_on][]=FROM and filter[last_free_day_on][]=TO, without operators. Requires both dates. Also restricts to available/not_available/off_dock containers, tracking not stopped, and destination absent or the same as POD. Use pickup_lfd for general comparisons. */
last_free_day_on?: readonly [string, string];
/** Inland rail unloading date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
inland_destination_rail_unloaded_at?: DateFilter;
/** Final destination full out date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
final_destination_full_out_at?: DateFilter;
/** Estimated inland destination arrival date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
inland_destination_eta_at?: DateFilter;
/** Actual inland destination arrival date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
inland_destination_ata_at?: DateFilter;
/** Rail departure from POD date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pod_rail_departed_at?: DateFilter;
/** Pickup last free day (LFD) date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pickup_lfd?: DateFilter;
/** Reported rail pickup LFD date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pickup_lfd_rail_on?: DateFilter;
/** Reported terminal pickup LFD date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pickup_lfd_terminal_on?: DateFilter;
/** Reported shipping-line pickup LFD date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pickup_lfd_line_on?: DateFilter;
/** Terminal pickup LFD. Calculated values are used only when enabled and visible for the account/carrier; otherwise reported values are used. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pickup_lfd_terminal_effective_on?: DateFilter;
/** Shipping-line pickup LFD. Calculated values are used only when enabled and visible for the account/carrier; otherwise reported values are used. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, `<`, `<=`, `>`, or `>=`. Arrays combine bounds with AND. Comma-separated dates mean OR. Use `@exists` or `@not_exists` for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied. */
pickup_lfd_line_effective_on?: DateFilter;
/** Account-scoped shipment tags. Comma-separated names or arrays match ANY tag by default. */
tags?: StringFilter;
/** With tags, true requires ALL tags; false or absent means ANY. Has no effect without tags. The SDK requires tags (or shipment tag) when this modifier is supplied. */
tags_and?: boolean;
/** Filter by account-visible party IDs or presence, grouped by role. IDs within a role use OR; different roles use AND. pickup_dray_carrier checks only the container role; other roles check container or shipment roles. Unknown roles are ignored by the API and rejected by the SDK. */
parties?: Partial<Record<PartyRole, StringFilter>>;
include?: IncludeParam<ContainerInclude>;
/** Supported API sort token(s); validated before the request. */
sort?: string;
/** @deprecated Use pod_code. */
port?: string;
/** @deprecated Use current_status and its documented values. */
status?: string;
/** @deprecated Use shipping_line_scac. */
carrier?: string;
/** @deprecated Timestamp semantics cannot be preserved by a date-only filter. */
updatedAfter?: string;
}
