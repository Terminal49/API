// Generated from docs/openapi.json. Run npm run generate:filters --workspace @terminal49/mcp.
import { z } from 'zod';
export const SHIPMENT_FILTER_KEYS = [
  'q',
  'number',
  'created_at',
  'actively_tracked',
  'tracking_stopped',
  'voyage_status',
  'arriving_today',
  'pod_ata_at',
  'pod_arrival',
  'pod_code',
  'pod_eta_changed_at',
  'pod_terminal_id',
  'pol_code',
  'owner_id',
  'creator_id',
  'customer_id',
  'product',
  'party_id',
  'tags',
  'tags_and',
  'tag',
] as const;
export const shipmentFilterShape = {
  q: z
    .string()
    .min(1)
    .describe(
      'Prefix text search across shipment numbers, reference numbers, and linked container identifiers. Use search text, not comparison expressions.',
    )
    .optional(),
  number: z
    .union([
      z.string().trim().min(1).max(64),
      z.array(z.string().trim().min(1).max(64)).min(1),
    ])
    .describe(
      'Exact number match. Shipment arrays mean OR; container arrays of exact numbers mean AND. Use comma-separated container numbers for OR. Shipment scalar commas are literal.',
    )
    .optional(),
  created_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Creation date. Use an ISO 8601 date-time with Z or a timezone offset; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Relative dates and comma-separated timestamps are not accepted. Use @exists or @not_exists for presence.',
    )
    .optional(),
  actively_tracked: z
    .boolean()
    .describe(
      'true selects shipments with tracking not stopped; false selects stopped tracking. Applies via the related shipment for containers.',
    )
    .optional(),
  tracking_stopped: z
    .boolean()
    .describe(
      'true selects stopped tracking; false selects tracking not stopped. Combines with other filters using AND.',
    )
    .optional(),
  voyage_status: z
    .enum(['arrived', 'on_ship'])
    .describe(
      'arrived means actual POD arrival is present; on_ship means a voyage exists and actual POD arrival is absent. It is not a general shipment lifecycle status.',
    )
    .optional(),
  arriving_today: z
    .literal(true)
    .describe(
      'true selects shipments with POD or destination estimated/actual arrival today in the API server day. false does not narrow the list. The SDK accepts only true.',
    )
    .optional(),
  pod_ata_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Actual POD arrival date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pod_arrival: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'POD arrival date: actual arrival takes precedence over estimated arrival. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pod_code: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Port of discharge UN/LOCODE. Use exact literals, comma-separated values, or arrays with OR semantics. Presence checks and comparison/search operators do not apply to this scope.',
    )
    .optional(),
  pod_eta_changed_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Meaningful change in the POD-local ETA date, comparing the current ETA with its historical baseline. Requires a lower ISO 8601 timestamp bound (=, >, or >=); an optional upper bound must be later. Applies only to active, unarrived shipments with an ETA. Not a raw updated_at filter; a future lower bound is not guaranteed to produce no matches.',
    )
    .optional(),
  pod_terminal_id: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Port of discharge terminal ID. Obtain it from the related terminal resource. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean OR for this shipment terminal filter. ~ is not supported.',
    )
    .optional(),
  pol_code: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Port of lading UN/LOCODE. Use exact literals, comma-separated values, or arrays with OR semantics. Presence checks and comparison/search operators do not apply to this scope.',
    )
    .optional(),
  owner_id: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'User ID associated with a shipment container. Accepts one ID, comma-separated IDs, or arrays with OR semantics. Use exact literals, comma-separated values, or arrays with OR semantics. Presence checks and comparison/search operators do not apply to this scope.',
    )
    .optional(),
  creator_id: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Shipment creator account ID. Comma-separated IDs mean OR; arrays of distinct IDs mean AND and return no matches. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  customer_id: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Customer account ID or customer party ID. Falls back to the shipment creator when no customer party role exists. Presence checks refer to the customer party role. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  product: z
    .string()
    .min(1)
    .describe('Prefix text search of an associated product name or SKU.')
    .optional(),
  party_id: z
    .union([
      z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
      z.strictObject({
        value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
        operator: z.enum(['any', 'all']).optional(),
      }),
    ])
    .describe(
      'Party ID match. Accepts a scalar, comma-separated IDs, an array (OR), or an object with value and operator (any or all). Values must come from parties visible to your account.',
    )
    .optional(),
  tags: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Account-scoped shipment tags. Comma-separated names or arrays match ANY tag by default.',
    )
    .optional(),
  tags_and: z
    .boolean()
    .describe(
      'With tags, true requires ALL tags; false or absent means ANY. Has no effect without tags. The SDK requires tags (or shipment tag) when this modifier is supplied.',
    )
    .optional(),
  tag: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Alias for tags. When both are present, tag takes precedence. Uses the requesting account tag names.',
    )
    .optional(),
} as const;
export const shipmentSortSchema = z
  .string()
  .min(1)
  .describe(
    'Supported values: created_at, -created_at, pod_arrival, -pod_arrival, tracking_stopped_at, -tracking_stopped_at. Both created_at tokens sort newest first for compatibility. Unknown values fall back to newest creation first.',
  )
  .optional();
export const CONTAINER_FILTER_KEYS = [
  'number',
  'pol',
  'pod',
  'destination',
  'pol_code',
  'pod_code',
  'destination_code',
  'shipping_line_scac',
  'customer_id',
  'customer_name',
  'vessel_name',
  'pod_terminal_id',
  'current_status',
  'has_fees',
  'has_demurrage_fees',
  'has_fees_or_holds',
  'requires_attention',
  'eta_changed_in_last_24h',
  'eta_changed_in_past_3_days',
  'has_holds',
  'actively_tracked',
  'search_by_ids',
  'search_by_number',
  'search_by_shipment_number',
  'search_by_shipment_ref_numbers',
  'search_by_ref_numbers',
  'search_by_owner_id',
  'delivered_at',
  'pod_discharged_at',
  'pod_arrived_at',
  'pol_etd_at',
  'pol_atd_at',
  'empty_out_at',
  'pol_full_in_at',
  'pol_vessel_loaded_at',
  'pol_vessel_departed_at',
  'arrival',
  'picked_up_at',
  'empty_returned_at',
  'created_at',
  'updated_at',
  'last_free_day_on',
  'inland_destination_rail_unloaded_at',
  'final_destination_full_out_at',
  'inland_destination_eta_at',
  'inland_destination_ata_at',
  'pod_rail_departed_at',
  'pickup_lfd',
  'pickup_lfd_rail_on',
  'pickup_lfd_terminal_on',
  'pickup_lfd_line_on',
  'pickup_lfd_terminal_effective_on',
  'pickup_lfd_line_effective_on',
  'tags',
  'tags_and',
  'parties',
  'custom_fields',
] as const;
export const containerFilterShape = {
  number: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Exact number match. Shipment arrays mean OR; container arrays of exact numbers mean AND. Use comma-separated container numbers for OR. Shipment scalar commas are literal. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  pol: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Port of lading name (including raw routing data when no port relationship exists). Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  pod: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Port of discharge name (including raw routing data when no port relationship exists). Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  destination: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Destination name, including raw routing data when no port relationship exists. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  pol_code: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Port of lading UN/LOCODE. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  pod_code: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Port of discharge UN/LOCODE. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  destination_code: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Destination UN/LOCODE. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  shipping_line_scac: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Shipping line Standard Carrier Alpha Code (SCAC). Obtain valid values from GET /shipping_lines; preserve their exact codes. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  customer_id: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Customer account ID or customer party ID. Falls back to the shipment creator when no customer party role exists. Presence checks refer to the customer party role. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  customer_name: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Exact, case-sensitive customer company name. Prefer customer_id for names containing punctuation rejected by the string parser. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  vessel_name: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Exact vessel name. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  pod_terminal_id: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Port of discharge terminal ID. Obtain it from the related terminal resource. Exact match by default; optional =, @exists, or @not_exists. Comma-separated literals mean OR. Arrays mean AND unless the parameter description says otherwise. ~ is not supported.',
    )
    .optional(),
  current_status: z
    .union([
      z
        .string()
        .regex(
          new RegExp(
            '^(?:@exists|@not_exists|=?(?:new|on_ship|available|not_available|grounded|on_rail|picked_up|off_dock|delivered|dropped|loaded|empty_returned|awaiting_inland_transfer)(?:,=?(?:new|on_ship|available|not_available|grounded|on_rail|picked_up|off_dock|delivered|dropped|loaded|empty_returned|awaiting_inland_transfer))*)$',
          ),
        ),
      z
        .array(
          z
            .string()
            .regex(
              new RegExp(
                '^(?:@exists|@not_exists|=?(?:new|on_ship|available|not_available|grounded|on_rail|picked_up|off_dock|delivered|dropped|loaded|empty_returned|awaiting_inland_transfer)(?:,=?(?:new|on_ship|available|not_available|grounded|on_rail|picked_up|off_dock|delivered|dropped|loaded|empty_returned|awaiting_inland_transfer))*)$',
              ),
            ),
        )
        .min(1),
    ])
    .describe(
      'Container status. Known values: new, on_ship, available, not_available, grounded, on_rail, picked_up, off_dock, delivered, dropped, loaded, empty_returned, awaiting_inland_transfer. Unknown values return no matches in the API; the SDK rejects them. Comma-separated states mean OR; arrays mean AND.',
    )
    .optional(),
  has_fees: z
    .boolean()
    .describe(
      'true requires nonempty terminal fees; false requires an explicitly empty terminal fee array. Unreported/null fees match neither branch.',
    )
    .optional(),
  has_demurrage_fees: z
    .boolean()
    .describe(
      'true requires a terminal demurrage fee; false selects terminal records without a demurrage fee. Missing terminal data can be excluded.',
    )
    .optional(),
  has_fees_or_holds: z
    .boolean()
    .describe(
      'true requires fees OR holds; false requires both arrays to be explicitly empty. Missing terminal data can be excluded.',
    )
    .optional(),
  requires_attention: z
    .boolean()
    .describe(
      'true selects attention-marked, overdue pickup, or approaching-LFD containers. false selects containers whose stored attention value is false or null; it is not the exact complement of true.',
    )
    .optional(),
  eta_changed_in_last_24h: z
    .literal(true)
    .describe(
      'Selects containers with estimated-event changes in the last 24 hours. Both true and false apply the positive selector in the API. The SDK accepts only true.',
    )
    .optional(),
  eta_changed_in_past_3_days: z
    .literal(true)
    .describe(
      'Selects containers with estimated-event changes in the past three days. Both true and false apply the positive selector in the API. The SDK accepts only true.',
    )
    .optional(),
  has_holds: z
    .boolean()
    .describe(
      'true requires nonempty terminal holds; false requires an explicitly empty holds array. Unreported/null holds match neither branch.',
    )
    .optional(),
  actively_tracked: z
    .boolean()
    .describe(
      'true selects shipments with tracking not stopped; false selects stopped tracking. Applies via the related shipment for containers.',
    )
    .optional(),
  search_by_ids: z
    .string()
    .min(1)
    .describe(
      'Prefix text search of container and linked shipment identifiers. Optional ~ prefix is supported here. Do not use ~ on exact string filters.',
    )
    .optional(),
  search_by_number: z
    .string()
    .min(1)
    .describe(
      'Prefix text search of container numbers. Optional ~ prefix is supported here. Do not use ~ on exact string filters.',
    )
    .optional(),
  search_by_shipment_number: z
    .string()
    .min(1)
    .describe(
      'Prefix text search of shipment numbers. Optional ~ prefix is supported here. Do not use ~ on exact string filters.',
    )
    .optional(),
  search_by_shipment_ref_numbers: z
    .string()
    .min(1)
    .describe(
      'Prefix text search of shipment reference numbers. Optional ~ prefix is supported here. Do not use ~ on exact string filters.',
    )
    .optional(),
  search_by_ref_numbers: z
    .string()
    .min(1)
    .describe(
      'Prefix text search of container reference numbers. Optional ~ prefix is supported here. Do not use ~ on exact string filters.',
    )
    .optional(),
  search_by_owner_id: z
    .string()
    .min(1)
    .describe(
      'User IDs associated with containers. Use one ID or comma-separated user IDs; bracketed arrays are not supported by this scope. Presence and search operators do not apply.',
    )
    .optional(),
  delivered_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Delivery date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pod_discharged_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'POD discharge date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pod_arrived_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Container POD arrival date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pol_etd_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Estimated port of lading departure date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pol_atd_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Actual port of lading departure date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  empty_out_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Empty equipment out date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pol_full_in_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Full equipment in at port of lading date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pol_vessel_loaded_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Vessel loading at port of lading date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pol_vessel_departed_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Vessel departure at port of lading date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  arrival: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'POD arrival date: actual arrival takes precedence over estimated arrival. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  picked_up_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Pickup date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  empty_returned_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Empty return date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  created_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Creation date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  updated_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Last record update date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  last_free_day_on: z
    .tuple([z.string().min(1), z.string().min(1)])
    .describe(
      'Inclusive two-date range, encoded as filter[last_free_day_on][]=FROM and filter[last_free_day_on][]=TO, without operators. Requires both dates. Also restricts to available/not_available/off_dock containers, tracking not stopped, and destination absent or the same as POD. Use pickup_lfd for general comparisons.',
    )
    .optional(),
  inland_destination_rail_unloaded_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Inland rail unloading date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  final_destination_full_out_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Final destination full out date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  inland_destination_eta_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Estimated inland destination arrival date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  inland_destination_ata_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Actual inland destination arrival date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pod_rail_departed_at: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Rail departure from POD date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pickup_lfd: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Pickup last free day (LFD) date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pickup_lfd_rail_on: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Reported rail pickup LFD date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pickup_lfd_terminal_on: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Reported terminal pickup LFD date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pickup_lfd_line_on: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Reported shipping-line pickup LFD date. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pickup_lfd_terminal_effective_on: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Terminal pickup LFD. Calculated values are used only when enabled and visible for the account/carrier; otherwise reported values are used. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  pickup_lfd_line_effective_on: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Shipping-line pickup LFD. Calculated values are used only when enabled and visible for the account/carrier; otherwise reported values are used. Use YYYY-MM-DD or today/N.days.ago/N.days.from_now; prefix with =, <, <=, >, or >=. Arrays combine bounds with AND. Comma-separated dates mean OR. Use @exists or @not_exists for presence. Compares the stored date component, not timestamp instants; no automatic conversion to the port timezone is applied.',
    )
    .optional(),
  tags: z
    .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
    .describe(
      'Account-scoped shipment tags. Comma-separated names or arrays match ANY tag by default.',
    )
    .optional(),
  tags_and: z
    .boolean()
    .describe(
      'With tags, true requires ALL tags; false or absent means ANY. Has no effect without tags. The SDK requires tags (or shipment tag) when this modifier is supplied.',
    )
    .optional(),
  parties: z
    .strictObject({
      shipper: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .optional(),
      consignee: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .optional(),
      notify_party: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .optional(),
      customs_broker: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .optional(),
      customer: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .optional(),
      freight_forwarder: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .optional(),
      pickup_dray_carrier: z
        .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
        .optional(),
    })
    .describe(
      'Filter by account-visible party IDs or presence, grouped by role. IDs within a role use OR; different roles use AND. pickup_dray_carrier checks only the container role; other roles check container or shipment roles. Unknown roles are ignored by the API and rejected by the SDK.',
    )
    .optional(),
  custom_fields: z
    .record(z.string().regex(/^[a-z0-9_]+$/), z.string().min(1).max(200))
    .describe(
      "Filter by the account's own custom fields, keyed by api_slug from GET /accounts/{account_id}/custom_field_definitions (GET /custom_field_definitions lists templates, which an account may not have added). Text and enum values match containers whose own or shipment value contains the text (case-sensitive substring), with comma-separated values meaning OR; boolean fields take true or false; date and datetime fields take YYYY-MM-DD with an optional >=, <=, >, <, or = prefix; number fields take an exact number. Every type accepts @exists and @not_exists. Different slugs combine with AND. Slugs the account does not define are ignored by the API, so resolve them first.",
    )
    .optional(),
} as const;
export const containerSortSchema = z
  .string()
  .min(1)
  .describe(
    'Default -last_status_refresh_at. Prefix a supported field with - for descending order; use comma-separated fields (up to three). Supported fields: arrival, created_at, updated_at, shipment_number, destination_ata_at, destination_eta_at, empty_terminated_at, final_destination_full_out_at, last_status_refresh_at, picked_up_at, delivered_at, delivery_appointment_at, pickup_lfd, pickup_lfd_line_on, pickup_lfd_line_effective_on, pickup_lfd_line_ind_effective_on, pickup_lfd_line_ind_on, ind_lfd, pickup_lfd_rail_on, pickup_lfd_rail_effective_on, pickup_lfd_terminal_on, pickup_lfd_terminal_effective_on, pod_arrived_at, pod_discharged_at, pod_eta_at, inland_destination_rail_unloaded_at, inland_destination_eta_at, inland_destination_ata_at, pod_rail_loaded_at, pol_full_in_at, empty_out_at, pol_vessel_loaded_at, pol_vessel_departed_at. attention_priority is a standalone priority sort. Invalid tokens are ignored; all-invalid input falls back to the default. LFD sorts may be scoped by account entitlements and settings.',
  )
  .optional();
