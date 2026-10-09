import type { components } from '../../generated/terminal49.js';
import { ValidationError } from '../errors.js';
import { BaseManager } from './base.js';

type Schemas = components['schemas'];

/** Index window, freshness, and counts returned by `GET /trade_intel/meta`. */
export type TradeIntelMeta = Schemas['TradeIntelMeta'];
/** Body of `POST /trade_intel/companies/search`. */
export type TradeIntelCompanySearchRequest =
  Schemas['TradeIntelCompanySearchRequest'];
/** Response of `POST /trade_intel/companies/search`. */
export type TradeIntelCompanySearchResponse =
  Schemas['TradeIntelCompanySearchResponse'];
/** One importer returned by `searchCompanies`. */
export type TradeIntelCompanySearchResult =
  Schemas['TradeIntelCompanySearchResult'];
/** Body of `POST /trade_intel/companies/profile`. */
export type TradeIntelCompanyProfileRequest =
  Schemas['TradeIntelCompanyProfileRequest'];
/** Response of `POST /trade_intel/companies/profile`. */
export type TradeIntelCompanyProfile = Schemas['TradeIntelCompanyProfile'];
/** Body of `POST /trade_intel/commodities/search`. */
export type TradeIntelCommoditySearchRequest =
  Schemas['TradeIntelCommoditySearchRequest'];
/** Response of `POST /trade_intel/commodities/search`. */
export type TradeIntelCommoditySearchResponse =
  Schemas['TradeIntelCommoditySearchResponse'];
/** Body of `POST /trade_intel/importers/top`. */
export type TradeIntelTopImportersRequest =
  Schemas['TradeIntelTopImportersRequest'];
/** Response of `POST /trade_intel/importers/top`. */
export type TradeIntelTopImporters = Schemas['TradeIntelTopImporters'];
/** Body of `POST /trade_intel/trends`. */
export type TradeIntelTrendsRequest = Schemas['TradeIntelTrendsRequest'];
/** Response of `POST /trade_intel/trends`. */
export type TradeIntelTrends = Schemas['TradeIntelTrends'];
/** Body of `POST /trade_intel/breakdown`. */
export type TradeIntelBreakdownRequest = Schemas['TradeIntelBreakdownRequest'];
/** Response of `POST /trade_intel/breakdown`. */
export type TradeIntelBreakdown = Schemas['TradeIntelBreakdown'];
/** Filters accepted by `trends` and `breakdown`. */
export type TradeIntelFilters = Schemas['TradeIntelFilters'];
/** A dimension accepted by `group_by` (trends) and `dims` (breakdown). */
export type TradeIntelDimension = Schemas['TradeIntelDimension'];
/** A measure accepted by `trends` and `breakdown`. */
export type TradeIntelMeasure = Schemas['TradeIntelMeasure'];
/** Response of `POST /trade_intel/containers/lookup`. */
export type TradeIntelContainerLookup = Schemas['TradeIntelContainerLookup'];
/** Response of `POST /trade_intel/bills_of_lading/lookup`. */
export type TradeIntelBillOfLadingLookup =
  Schemas['TradeIntelBillOfLadingLookup'];

/** Options for {@link TradeIntelManager.lookupBillOfLading}. */
export interface TradeIntelBillOfLadingLookupOptions {
  /** How many months back to search (1 to 18). Defaults to 12. */
  months?: number;
}

/**
 * Trade intelligence: US import bill-of-lading records (US Customs manifests),
 * January 2022 onward, refreshed daily.
 *
 * These endpoints accept and return plain JSON rather than JSON:API, so every
 * method resolves to the response body as the API sent it. They are gated per
 * account: when trade intelligence is not enabled, calls reject with
 * `FeatureNotEnabledError` (HTTP 403). Invalid input rejects with
 * `ValidationError` (400 or 422), and 429 / 502 / 504 responses are retried
 * with backoff like every other read before `RateLimitError` or
 * `UpstreamError` is thrown.
 *
 * Volume figures are physical containers (each box counted once), estimated
 * values are modelled USD estimates rather than declared customs values, and
 * the current month is partial. Company names are split by state and large
 * importers use several names, so absent volume does not mean low volume.
 */
export class TradeIntelManager extends BaseManager {
  /**
   * Index window, history start, partial month, and build time. Also the
   * cheapest way to check whether the account has trade intelligence enabled.
   */
  async meta(): Promise<TradeIntelMeta> {
    return this.transport.execute<TradeIntelMeta>(() =>
      this.transport.client.GET('/trade_intel/meta'),
    );
  }

  /**
   * Find US importers by name (fuzzy), by what they import (semantic), or
   * both. Results are ranked by match quality, not size.
   */
  async searchCompanies(
    request: TradeIntelCompanySearchRequest = {},
  ): Promise<TradeIntelCompanySearchResponse> {
    return this.transport.execute<TradeIntelCompanySearchResponse>(() =>
      this.transport.client.POST('/trade_intel/companies/search', {
        body: request,
      }),
    );
  }

  /**
   * Import profile for one company over full calendar months. `company_name`
   * must be the exact name returned by {@link searchCompanies}.
   */
  async companyProfile(
    request: TradeIntelCompanyProfileRequest,
  ): Promise<TradeIntelCompanyProfile> {
    if (!request.company_name?.trim()) {
      throw new ValidationError('company_name is required (/company_name)');
    }
    return this.transport.execute<TradeIntelCompanyProfile>(() =>
      this.transport.client.POST('/trade_intel/companies/profile', {
        body: request,
      }),
    );
  }

  /** Resolve a product description or HS code prefix to 4-digit HS headings. */
  async searchCommodities(
    request: TradeIntelCommoditySearchRequest,
  ): Promise<TradeIntelCommoditySearchResponse> {
    if (!request.query?.trim()) {
      throw new ValidationError('query is required (/query)');
    }
    return this.transport.execute<TradeIntelCommoditySearchResponse>(() =>
      this.transport.client.POST('/trade_intel/commodities/search', {
        body: request,
      }),
    );
  }

  /**
   * Rank US importers by physical containers, optionally for one HS4 heading,
   * port of discharge, or origin country.
   */
  async topImporters(
    request: TradeIntelTopImportersRequest = {},
  ): Promise<TradeIntelTopImporters> {
    return this.transport.execute<TradeIntelTopImporters>(() =>
      this.transport.client.POST('/trade_intel/importers/top', {
        body: request,
      }),
    );
  }

  /**
   * Time series of containers, TEUs, or estimated value, optionally split by
   * up to two dimensions. Defaults to the last 24 months including the
   * current, partial month.
   */
  async trends(
    request: TradeIntelTrendsRequest = {},
  ): Promise<TradeIntelTrends> {
    return this.transport.execute<TradeIntelTrends>(() =>
      this.transport.client.POST('/trade_intel/trends', { body: request }),
    );
  }

  /**
   * Nested totals over a dimension hierarchy, with a grand total and
   * subtotals at every level.
   */
  async breakdown(
    request: TradeIntelBreakdownRequest,
  ): Promise<TradeIntelBreakdown> {
    if (!request.dims?.length) {
      throw new ValidationError(
        'dims must list at least one dimension (/dims)',
      );
    }
    return this.transport.execute<TradeIntelBreakdown>(() =>
      this.transport.client.POST('/trade_intel/breakdown', { body: request }),
    );
  }

  /**
   * The most recent US import of a container: its bills of lading, parties,
   * and commodity lines. Resolves with `found: false` (HTTP 200) when the
   * number is malformed or no import is on record.
   */
  async lookupContainer(
    containerNumber: string,
  ): Promise<TradeIntelContainerLookup> {
    if (!containerNumber?.trim()) {
      throw new ValidationError(
        'container_number is required (/container_number)',
      );
    }
    return this.transport.execute<TradeIntelContainerLookup>(() =>
      this.transport.client.POST('/trade_intel/containers/lookup', {
        body: { container_number: containerNumber },
      }),
    );
  }

  /**
   * The import record for a master or house bill of lading: containers,
   * parties, and commodity lines. Searches the last `months` months
   * (default 12).
   */
  async lookupBillOfLading(
    bolNumber: string,
    options: TradeIntelBillOfLadingLookupOptions = {},
  ): Promise<TradeIntelBillOfLadingLookup> {
    if (!bolNumber?.trim()) {
      throw new ValidationError('bol_number is required (/bol_number)');
    }
    return this.transport.execute<TradeIntelBillOfLadingLookup>(() =>
      this.transport.client.POST('/trade_intel/bills_of_lading/lookup', {
        body:
          options.months === undefined
            ? { bol_number: bolNumber }
            : { bol_number: bolNumber, months: options.months },
      }),
    );
  }
}
