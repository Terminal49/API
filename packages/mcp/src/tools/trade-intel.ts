/**
 * Trade intelligence tools.
 *
 * Market data on US ocean imports, built from US Customs bill-of-lading
 * records (January 2022 onward, refreshed daily). Unlike the other tools these
 * do not read the account's own shipments; they are gated per account and
 * answer with a plain "not enabled" result when the account lacks the feature.
 *
 * Responses are compacted for agent context: internal bookkeeping fields are
 * dropped, long lists are capped (with a count of what was left out), and
 * numbers are rounded to what an answer needs.
 *
 * Record-level lookups (one container's or one bill of lading's parties) stay
 * in the SDK only and are deliberately not exposed here.
 */

import { z } from 'zod';
import { FeatureNotEnabledError, Terminal49Client } from '@terminal49/sdk';
import type { FeatureNotEnabledResult } from './get-container-route.js';

export const TRADE_INTEL_TOOL_NAMES = [
  'search_importers',
  'get_importer_profile',
  'search_commodities',
  'rank_importers',
  'get_trade_trends',
  'get_trade_breakdown',
  'get_trade_data_coverage',
] as const;
export type TradeIntelToolName = (typeof TRADE_INTEL_TOOL_NAMES)[number];

export function isTradeIntelTool(name: string): name is TradeIntelToolName {
  return (TRADE_INTEL_TOOL_NAMES as readonly string[]).includes(name);
}

// ==================== Input schemas ====================

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const STATE = /^[A-Za-z]{2}$/;

const usState = (what: string) =>
  z
    .string()
    .trim()
    .regex(STATE)
    .describe(`Two-letter US state code of ${what}, such as "CA".`);

const substring = (description: string) =>
  z.string().trim().min(1).max(200).describe(description);

const hs4 = z
  .string()
  .trim()
  .regex(/^\d{4}$/)
  .describe(
    'Four-digit HS product code, such as "9401" (seats). Get it from search_commodities.',
  );

const month = (description: string) =>
  z.string().trim().regex(MONTH).describe(description);

export const DIMENSIONS = [
  'company',
  'company_state',
  'hs4',
  'hs2',
  'origin_country',
  'origin_region',
  'pol',
  'pol_country',
  'pod',
  'pod_coast',
  'dest_state',
  'carrier',
  'scac',
  'container_type',
  'reefer',
] as const;

const DIMENSION_GUIDE =
  'company = importer; company_state = importer state; hs4 / hs2 = product code (4 or 2 digits); origin_country / origin_region = where goods come from; pol / pol_country = foreign port of loading and its country; pod = US port of discharge; pod_coast = EAST, WEST, or GULF; dest_state = final US state; carrier / scac = ocean carrier name or code; container_type; reefer = refrigerated or not. ' +
  'pol, pol_country, and container_type cannot be combined with company or product (hs4, hs2) in one request.';

const dimension = z.enum(DIMENSIONS);

const measure = z
  .enum(['containers', 'teus', 'estimated_value'])
  .default('containers')
  .describe(
    'containers = physical containers, each counted once (default); teus = twenty-foot equivalent units; estimated_value = modelled US dollar estimate, not the declared customs value.',
  );

export const tradeFiltersSchema = z
  .strictObject({
    company: substring(
      'Importer name. Substring match: "IKEA" also matches "IKEA SUPPLY AG". For one company\'s own trend use get_importer_profile instead.',
    ).optional(),
    company_state: usState('the importer').optional(),
    hs4: hs4.optional(),
    hs2: z
      .string()
      .trim()
      .regex(/^\d{2}$/)
      .describe('Two-digit HS chapter, such as "94" (furniture).')
      .optional(),
    origin_country: substring(
      'Origin country, substring match on the records\' spelling: "china" matches "PEOPLES REP OF CHINA".',
    ).optional(),
    origin_region: substring('Origin region, substring match.').optional(),
    pol: substring('Foreign port of loading, substring match.').optional(),
    pol_country: substring(
      'Country of the foreign port of loading, substring match.',
    ).optional(),
    pod: substring(
      'US port of discharge, substring match, such as "savannah" or "long beach".',
    ).optional(),
    pod_coast: z
      .enum(['EAST', 'WEST', 'GULF'])
      .describe('US coast of the port of discharge.')
      .optional(),
    dest_state: usState('the final destination').optional(),
    carrier: substring(
      'Ocean carrier name, substring match. Carriers appear under spelling variants; prefer scac for an exact match.',
    ).optional(),
    scac: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{4}$/)
      .describe('Four-letter carrier SCAC code, such as "MAEU".')
      .optional(),
    container_type: substring(
      'Container type description, substring match.',
    ).optional(),
    reefer: z
      .boolean()
      .describe('true for refrigerated containers only, false for dry only.')
      .optional(),
  })
  .describe(
    'Narrow the data. Name-like fields are case-insensitive substring matches; codes, states, and pod_coast match exactly.',
  );

export const searchImportersInputSchema = z.strictObject({
  name: substring(
    'Company name; partial names and typos are fine. Results are ranked by match quality, not by size.',
  ).optional(),
  imports: substring(
    'What the company imports, in plain words, such as "frozen shrimp" or "office chairs".',
  ).optional(),
  state: usState('the importer').optional(),
  port_of_discharge: substring(
    'US port of discharge, substring match, such as "long beach".',
  ).optional(),
  origin_country: substring(
    'Origin country, substring match, such as "vietnam".',
  ).optional(),
  min_containers: z
    .number()
    .int()
    .positive()
    .describe(
      'Only importers with at least this many containers in the last 12 full months.',
    )
    .optional(),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe('Most importers to return, from 1 to 25.'),
});
export type SearchImportersArgs = z.input<typeof searchImportersInputSchema>;

export const getImporterProfileInputSchema = z.strictObject({
  company_name: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      'Exact company_name returned by search_importers. A near match returns found: false.',
    ),
  company_state: usState(
    "one location to restrict to; omit to combine all of the company's states",
  ).optional(),
  months: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(12)
    .describe(
      'Full calendar months ending last month, from 1 to 60. Use 24 or more to compare against the same months a year earlier.',
    ),
});
export type GetImporterProfileArgs = z.input<
  typeof getImporterProfileInputSchema
>;

export const searchCommoditiesInputSchema = z.strictObject({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      'Product in plain words, such as "office chairs", or an HS code prefix, such as "9401" or "94".',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(8)
    .describe('Most product codes to return, from 1 to 20.'),
});
export type SearchCommoditiesArgs = z.input<
  typeof searchCommoditiesInputSchema
>;

export const rankImportersInputSchema = z.strictObject({
  hs4: hs4.optional(),
  port_of_discharge: substring(
    'US port of discharge, substring match, such as "savannah".',
  ).optional(),
  origin_country: substring(
    'Origin country, substring match, such as "vietnam".',
  ).optional(),
  months: z
    .number()
    .int()
    .min(1)
    .max(60)
    .default(12)
    .describe('Full calendar months ending last month, from 1 to 60.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(20)
    .describe('Most importers to return, from 1 to 50.'),
});
export type RankImportersArgs = z.input<typeof rankImportersInputSchema>;

export const getTradeTrendsInputSchema = z.strictObject({
  measure,
  group_by: z
    .array(dimension)
    .max(2)
    .describe(
      `Split the series by up to two dimensions, keeping the largest groups. ${DIMENSION_GUIDE}`,
    )
    .optional(),
  filters: tradeFiltersSchema.optional(),
  interval: z
    .enum(['month', 'quarter', 'year'])
    .default('month')
    .describe(
      'Period size. Month for a year or less, quarter for two to three years.',
    ),
  since: month(
    'First month, YYYY-MM, inclusive. Default: 24 months ago. Data goes back to 2022-01.',
  ).optional(),
  until: month(
    'Last month, YYYY-MM, inclusive. Default: the current month, which is still incomplete. Set it to the last full month for any comparison.',
  ).optional(),
  top: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(10)
    .describe('Keep this many largest groups, from 1 to 25.'),
});
type TradeFilters = z.output<typeof tradeFiltersSchema>;

/** Codes match exactly upstream, so send them in the records' upper case. */
function normalizeFilters(filters: TradeFilters | undefined) {
  if (!filters) return undefined;
  return {
    ...filters,
    company_state: filters.company_state?.toUpperCase(),
    dest_state: filters.dest_state?.toUpperCase(),
    scac: filters.scac?.toUpperCase(),
  };
}

export type GetTradeTrendsArgs = z.input<typeof getTradeTrendsInputSchema>;

export const getTradeBreakdownInputSchema = z.strictObject({
  dims: z
    .array(dimension)
    .min(1)
    .max(3)
    .describe(
      `Nesting, outermost first, such as ["origin_region", "origin_country", "pod"] or ["hs2", "hs4"]. ${DIMENSION_GUIDE}`,
    ),
  measure,
  filters: tradeFiltersSchema.optional(),
  since: month(
    'First month, YYYY-MM, inclusive. Default: 12 months ago.',
  ).optional(),
  until: month(
    'Last month, YYYY-MM, inclusive. Default: the current month, which is still incomplete. Set it to the last full month for clean totals.',
  ).optional(),
  top: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe(
      'Keep this many largest children under each parent, from 1 to 20.',
    ),
});
export type GetTradeBreakdownArgs = z.input<
  typeof getTradeBreakdownInputSchema
>;

export const getTradeDataCoverageInputSchema = z.strictObject({});

// ==================== Results ====================

const NOT_ENABLED_MESSAGE =
  "Trade intelligence isn't enabled for this Terminal49 account, so there is no import market data to show. " +
  'To turn it on, contact support@terminal49.com.';
const NOT_ENABLED_ALTERNATIVE =
  "The shipment and container tools still work for this account's own tracked shipments.";

export function tradeIntelNotEnabled(): FeatureNotEnabledResult {
  return {
    error: 'FeatureNotEnabled',
    message: NOT_ENABLED_MESSAGE,
    alternative: NOT_ENABLED_ALTERNATIVE,
  };
}

async function guard<T>(
  call: () => Promise<T>,
): Promise<T | FeatureNotEnabledResult> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof FeatureNotEnabledError) return tradeIntelNotEnabled();
    throw error;
  }
}

const isNotEnabled = (value: unknown): value is FeatureNotEnabledResult =>
  Boolean(
    value &&
    typeof value === 'object' &&
    (value as { error?: unknown }).error === 'FeatureNotEnabled',
  );

// ==================== Compaction helpers ====================

const round = (value: unknown, digits = 0): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** The month before a YYYY-MM month, used to turn exclusive ends inclusive. */
export function previousMonth(value: unknown): string | undefined {
  if (typeof value !== 'string' || !MONTH.test(value)) return undefined;
  const [year, monthNumber] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Keep the first `limit` items; report how many were left out. */
function capped<T>(items: unknown, limit: number) {
  const list = Array.isArray(items) ? (items as T[]) : [];
  return {
    items: list.slice(0, limit),
    omitted: Math.max(0, list.length - limit),
  };
}

type Named = { name?: string; containers?: number; teus?: number };
type Commodity = {
  hs4?: string;
  description?: string;
  containers?: number;
  estimated_value?: number;
};

const named = (row: Named) => ({
  name: row.name,
  containers: row.containers,
  ...(row.teus === undefined ? {} : { teus: round(row.teus, 1) }),
});

const commodity = (row: Commodity) => ({
  hs4: row.hs4,
  description: row.description,
  containers: row.containers,
  estimated_value_usd: round(row.estimated_value),
});

const share = (part: unknown, whole: unknown) =>
  typeof part === 'number' && typeof whole === 'number' && whole > 0
    ? round(part / whole, 2)
    : undefined;

// ==================== Executors ====================

const SEARCH_TOP_LIST = 5;
const PROFILE_LIST = 10;
const MAX_SERIES_ROWS = 500;
const MAX_BREAKDOWN_ROWS = 400;
const MAX_COMMON_GOODS = 15;

export async function executeSearchImporters(
  args: SearchImportersArgs,
  client: Terminal49Client,
) {
  const request = searchImportersInputSchema.parse(args);
  const body = await guard(() =>
    client.tradeIntel.searchCompanies({
      ...request,
      state: request.state?.toUpperCase(),
    }),
  );
  if (isNotEnabled(body)) return body;

  const window = body.index;
  return {
    period: {
      from: window?.since_month,
      to: previousMonth(window?.until_month_exclusive),
      note: 'Volumes cover the last 12 full calendar months.',
    },
    importers: (body.results ?? []).map((row) => {
      const omitted: Record<string, number> = {};
      const list = <T, R>(key: string, items: unknown, map: (r: T) => R) => {
        const { items: kept, omitted: left } = capped<T>(
          items,
          SEARCH_TOP_LIST,
        );
        if (left > 0) omitted[key] = left;
        return kept.map(map);
      };
      const compact = {
        company_name: row.company_name,
        state: row.company_state ?? null,
        containers: row.containers,
        containers_as_consignee: row.containers_as_consignee,
        containers_as_notify_party: row.containers_as_notify_party,
        share_as_notify_party: share(
          row.containers_as_notify_party,
          row.containers,
        ),
        teus: round(row.teus, 1),
        estimated_value_usd: round(row.estimated_value),
        reefer_share: round(row.reefer_share, 2),
        first_month: row.first_month,
        last_month: row.last_month,
        top_ports: list('top_ports', row.top_ports, named),
        top_origins: list('top_origins', row.top_origins, named),
        top_carriers: list('top_carriers', row.top_carriers, named),
        top_products: list('top_products', row.top_commodities, commodity),
      };
      return Object.keys(omitted).length
        ? { ...compact, more_not_shown: omitted }
        : compact;
    }),
  };
}

export async function executeGetImporterProfile(
  args: GetImporterProfileArgs,
  client: Terminal49Client,
) {
  const request = getImporterProfileInputSchema.parse(args);
  const body = await guard(() =>
    client.tradeIntel.companyProfile({
      ...request,
      company_state: request.company_state?.toUpperCase(),
    }),
  );
  if (isNotEnabled(body)) return body;
  if (!body.found) {
    return {
      company_name: body.company_name,
      found: false,
      period: { from: body.since, to: body.until },
      message:
        'No imports under this exact name in the period. Use the exact company_name from search_importers; the company may also import under other names.',
    };
  }

  const omitted: Record<string, number> = {};
  const list = <T, R>(key: string, items: unknown, map: (row: T) => R) => {
    const { items: kept, omitted: left } = capped<T>(items, PROFILE_LIST);
    if (left > 0) omitted[key] = left;
    return kept.map(map);
  };

  const totals = body.totals;
  const result = {
    company_name: body.company_name,
    state: body.company_state ?? null,
    found: true,
    period: { from: body.since, to: body.until },
    totals: totals
      ? {
          containers: totals.containers,
          containers_as_consignee: totals.containers_as_consignee,
          containers_as_notify_party: totals.containers_as_notify_party,
          share_as_notify_party: share(
            totals.containers_as_notify_party,
            totals.containers,
          ),
          teus: round(totals.teus, 1),
          states: totals.states,
        }
      : undefined,
    monthly: (body.monthly ?? []).map((row) => ({
      month: row.month,
      containers: row.containers,
      teus: round(row.teus, 1),
    })),
    ports_of_discharge: list(
      'ports_of_discharge',
      body.ports_of_discharge,
      named,
    ),
    origin_countries: list('origin_countries', body.origin_countries, named),
    carriers: list('carriers', body.carriers, named),
    destination_states: list(
      'destination_states',
      body.destination_states,
      named,
    ),
    products: list('products', body.commodities_hs4, commodity),
    notes: body.notes ?? [],
  };
  return Object.keys(omitted).length
    ? { ...result, more_not_shown: omitted }
    : result;
}

export async function executeSearchCommodities(
  args: SearchCommoditiesArgs,
  client: Terminal49Client,
) {
  const request = searchCommoditiesInputSchema.parse(args);
  const body = await guard(() => client.tradeIntel.searchCommodities(request));
  if (isNotEnabled(body)) return body;
  return {
    products: (body.results ?? []).map((row) => {
      const goods = capped<string>(row.common_goods, MAX_COMMON_GOODS);
      const compact = {
        hs4: row.hs4,
        description: row.description,
        common_goods: goods.items,
        importers: row.companies,
        estimated_value_usd_12_months: round(row.estimated_value),
      };
      return goods.omitted > 0
        ? { ...compact, common_goods_not_shown: goods.omitted }
        : compact;
    }),
  };
}

export async function executeRankImporters(
  args: RankImportersArgs,
  client: Terminal49Client,
) {
  const request = rankImportersInputSchema.parse(args);
  const body = await guard(() => client.tradeIntel.topImporters(request));
  if (isNotEnabled(body)) return body;
  return {
    period: { from: body.since, to: body.until },
    ranked_by: body.ranked_by,
    filters: body.filters,
    importers: (body.importers ?? []).map((row, index) => ({
      rank: index + 1,
      company_name: row.company_name,
      states: row.states,
      containers: row.containers,
      teus: round(row.teus, 1),
      ...(row.estimated_value === undefined
        ? {}
        : { estimated_value_usd: round(row.estimated_value) }),
    })),
    notes: body.notes ?? [],
  };
}

/** Drop rows past `limit`, flagging the cut so the agent can narrow the query. */
function cappedRows<T>(rows: unknown, limit: number) {
  const list = Array.isArray(rows) ? (rows as T[]) : [];
  return {
    rows: list.slice(0, limit),
    truncated: list.length > limit,
    total_rows: list.length,
  };
}

const roundValue = <T extends { value?: number }>(row: T, digits: number) => ({
  ...row,
  value: round(row.value, digits),
});

export async function executeGetTradeTrends(
  args: GetTradeTrendsArgs,
  client: Terminal49Client,
) {
  const request = getTradeTrendsInputSchema.parse(args);
  const body = await guard(() =>
    client.tradeIntel.trends({
      ...request,
      filters: normalizeFilters(request.filters),
    }),
  );
  if (isNotEnabled(body)) return body;
  const digits = body.measure === 'teus' ? 1 : 0;
  const { rows, truncated, total_rows } = cappedRows<{ value?: number }>(
    body.series,
    MAX_SERIES_ROWS,
  );
  return {
    measure: body.measure,
    interval: body.interval,
    period: { from: body.since, to: body.until },
    group_by: body.group_by ?? [],
    filters: body.filters ?? {},
    series: rows.map((row) => roundValue(row, digits)),
    ...(truncated
      ? {
          truncated: true,
          total_rows,
        }
      : {}),
    notes: body.notes ?? [],
  };
}

export async function executeGetTradeBreakdown(
  args: GetTradeBreakdownArgs,
  client: Terminal49Client,
) {
  const request = getTradeBreakdownInputSchema.parse(args);
  const body = await guard(() =>
    client.tradeIntel.breakdown({
      ...request,
      filters: normalizeFilters(request.filters),
    }),
  );
  if (isNotEnabled(body)) return body;
  const digits = body.measure === 'teus' ? 1 : 0;
  const { rows, truncated, total_rows } = cappedRows<{ value?: number }>(
    body.rows,
    MAX_BREAKDOWN_ROWS,
  );
  return {
    measure: body.measure,
    dims: body.dims,
    period: { from: body.since, to: body.until },
    filters: body.filters ?? {},
    rows: rows.map((row) => roundValue(row, digits)),
    ...(truncated ? { truncated: true, total_rows } : {}),
    notes: body.notes ?? [],
  };
}

export async function executeGetTradeDataCoverage(client: Terminal49Client) {
  const body = await guard(() => client.tradeIntel.meta());
  if (isNotEnabled(body)) return body;
  return {
    source:
      'US ocean import bill-of-lading records (US Customs vessel manifests)',
    history_starts: body.facts_since_month,
    latest_month: body.partial_month,
    latest_month_is_partial: true,
    last_full_month: previousMonth(body.partial_month),
    search_window: {
      from: body.since_month,
      to: previousMonth(body.until_month_exclusive),
    },
    importers_indexed: body.companies,
    product_codes_indexed: body.hs_codes,
    volume_unit: 'physical containers, each counted once',
    built_at: body.built_at,
  };
}
