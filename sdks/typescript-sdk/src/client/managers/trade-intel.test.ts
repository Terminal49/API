import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vite-plus/test';
import {
  FeatureNotEnabledError,
  RateLimitError,
  Terminal49Client,
  UpstreamError,
  ValidationError,
} from '../../client.js';
import { createMockFetch, jsonResponse } from '../../test/mock-fetch.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../../fixtures');
const baseUrl = 'https://api.test/v2';

function fixture(name: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(fixturesDir, `${name}.json`), 'utf8'),
  );
}

function makeClient(
  handlers: Parameters<typeof createMockFetch>[0],
  maxRetries = 0,
) {
  const { fetchImpl, calls } = createMockFetch(handlers);
  const client = new Terminal49Client({
    apiToken: 'token-123',
    apiBaseUrl: baseUrl,
    fetchImpl,
    maxRetries,
  });
  return { client, calls };
}

function sentBody(call: { init?: RequestInit }) {
  return JSON.parse(String(call.init?.body));
}

describe('TradeIntelManager', () => {
  it('meta GETs /trade_intel/meta and returns the body unchanged', async () => {
    const meta = fixture('trade-intel.meta');
    const { client, calls } = makeClient({
      '/trade_intel/meta': () => jsonResponse(meta),
    });

    const result = await client.tradeIntel.meta();

    expect(calls[0].init?.method).toBe('GET');
    expect(calls[0].url.toString()).toBe(`${baseUrl}/trade_intel/meta`);
    expect(result).toEqual(meta);
    expect(result.facts_since_month).toBe('2022-01');
  });

  it('searchCompanies POSTs the request body as JSON', async () => {
    const body = fixture('trade-intel.companies.search');
    const { client, calls } = makeClient({
      '/trade_intel/companies/search': () => jsonResponse(body),
    });

    const result = await client.tradeIntel.searchCompanies({
      imports: 'frozen shrimp',
      state: 'FL',
      limit: 5,
    });

    expect(calls[0].init?.method).toBe('POST');
    expect(new Headers(calls[0].init?.headers).get('Content-Type')).toBe(
      'application/json',
    );
    expect(new Headers(calls[0].init?.headers).get('Authorization')).toBe(
      'Token token-123',
    );
    expect(sentBody(calls[0])).toEqual({
      imports: 'frozen shrimp',
      state: 'FL',
      limit: 5,
    });
    expect(result).toEqual(body);
    expect(result.results[0].company_name).toBe('EXAMPLE OUTDOOR SUPPLY');
  });

  it('searchCompanies sends an empty object when called without arguments', async () => {
    const { client, calls } = makeClient({
      '/trade_intel/companies/search': () =>
        jsonResponse(fixture('trade-intel.companies.search')),
    });

    await client.tradeIntel.searchCompanies();

    expect(sentBody(calls[0])).toEqual({});
  });

  it('companyProfile POSTs the exact company name and passes the body through', async () => {
    const body = fixture('trade-intel.companies.profile');
    const { client, calls } = makeClient({
      '/trade_intel/companies/profile': () => jsonResponse(body),
    });

    const result = await client.tradeIntel.companyProfile({
      company_name: 'EXAMPLE OUTDOOR SUPPLY',
      months: 24,
    });

    expect(calls[0].init?.method).toBe('POST');
    expect(sentBody(calls[0])).toEqual({
      company_name: 'EXAMPLE OUTDOOR SUPPLY',
      months: 24,
    });
    expect(result).toEqual(body);
    expect(result.totals.containers).toBe(1240);
  });

  it('companyProfile rejects a blank company name before any request', async () => {
    const { client, calls } = makeClient({});

    await expect(
      client.tradeIntel.companyProfile({ company_name: '  ' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it('searchCommodities POSTs the query and returns matches', async () => {
    const body = fixture('trade-intel.commodities.search');
    const { client, calls } = makeClient({
      '/trade_intel/commodities/search': () => jsonResponse(body),
    });

    const result = await client.tradeIntel.searchCommodities({
      query: 'office chairs',
      limit: 2,
    });

    expect(calls[0].init?.method).toBe('POST');
    expect(sentBody(calls[0])).toEqual({ query: 'office chairs', limit: 2 });
    expect(result).toEqual(body);
    expect(result.results[0].hs4).toBe('9401');
  });

  it('searchCommodities rejects a blank query before any request', async () => {
    const { client, calls } = makeClient({});

    await expect(
      client.tradeIntel.searchCommodities({ query: '' }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it('topImporters POSTs the filters and returns the ranking', async () => {
    const body = fixture('trade-intel.importers.top');
    const { client, calls } = makeClient({
      '/trade_intel/importers/top': () => jsonResponse(body),
    });

    const result = await client.tradeIntel.topImporters({
      hs4: '9401',
      months: 3,
      limit: 1,
    });

    expect(calls[0].init?.method).toBe('POST');
    expect(sentBody(calls[0])).toEqual({ hs4: '9401', months: 3, limit: 1 });
    expect(result).toEqual(body);
    expect(result.importers[0].containers).toBe(800);
  });

  it('trends POSTs group_by, filters, and the period', async () => {
    const body = fixture('trade-intel.trends');
    const { client, calls } = makeClient({
      '/trade_intel/trends': () => jsonResponse(body),
    });

    const request = {
      filters: { hs4: '9401' },
      group_by: ['origin_country' as const],
      interval: 'quarter' as const,
      since: '2026-01',
      until: '2026-06',
      top: 2,
    };
    const result = await client.tradeIntel.trends(request);

    expect(calls[0].init?.method).toBe('POST');
    expect(sentBody(calls[0])).toEqual(request);
    expect(result).toEqual(body);
    expect(result.series[0].origin_country).toBe('VIETNAM');
  });

  it('breakdown POSTs the dimension hierarchy and returns rows with levels', async () => {
    const body = fixture('trade-intel.breakdown');
    const { client, calls } = makeClient({
      '/trade_intel/breakdown': () => jsonResponse(body),
    });

    const result = await client.tradeIntel.breakdown({
      dims: ['pod_coast', 'pod'],
      filters: { hs4: '9401' },
      top: 2,
    });

    expect(calls[0].init?.method).toBe('POST');
    expect(sentBody(calls[0])).toEqual({
      dims: ['pod_coast', 'pod'],
      filters: { hs4: '9401' },
      top: 2,
    });
    expect(result).toEqual(body);
    expect(result.rows[0].level).toBe(0);
  });

  it('breakdown rejects an empty dims list before any request', async () => {
    const { client, calls } = makeClient({});

    await expect(
      client.tradeIntel.breakdown({ dims: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  it('lookupContainer POSTs the container number and passes the record through', async () => {
    const body = fixture('trade-intel.containers.lookup');
    const { client, calls } = makeClient({
      '/trade_intel/containers/lookup': () => jsonResponse(body),
    });

    const result = await client.tradeIntel.lookupContainer('MSCU1234567');

    expect(calls[0].init?.method).toBe('POST');
    expect(sentBody(calls[0])).toEqual({ container_number: 'MSCU1234567' });
    expect(result).toEqual(body);
    expect(result.found).toBe(true);
    expect(result.bills_of_lading?.[0].scac).toBe('MSCU');
  });

  it('lookupContainer resolves (not rejects) a found: false body', async () => {
    const { client } = makeClient({
      '/trade_intel/containers/lookup': () =>
        jsonResponse({
          container_number: 'BAD',
          found: false,
          error: 'expected ISO 6346 format, e.g. MSCU1234567',
        }),
    });

    const result = await client.tradeIntel.lookupContainer('BAD');

    expect(result.found).toBe(false);
    expect(result.error).toMatch(/ISO 6346/);
  });

  it('lookupContainer rejects a blank number before any request', async () => {
    const { client, calls } = makeClient({});

    await expect(client.tradeIntel.lookupContainer('')).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(calls).toHaveLength(0);
  });

  it('lookupBillOfLading POSTs the number and only sends months when given', async () => {
    const body = fixture('trade-intel.bills-of-lading.lookup');
    const { client, calls } = makeClient({
      '/trade_intel/bills_of_lading/lookup': () => jsonResponse(body),
    });

    const result = await client.tradeIntel.lookupBillOfLading('MEDUW9559867');
    await client.tradeIntel.lookupBillOfLading('MEDUW9559867', { months: 18 });

    expect(calls[0].init?.method).toBe('POST');
    expect(sentBody(calls[0])).toEqual({ bol_number: 'MEDUW9559867' });
    expect(sentBody(calls[1])).toEqual({
      bol_number: 'MEDUW9559867',
      months: 18,
    });
    expect(result).toEqual(body);
    expect(result.containers?.[0].container_number).toBe('MSCU1234567');
  });

  it('lookupBillOfLading rejects a blank number before any request', async () => {
    const { client, calls } = makeClient({});

    await expect(
      client.tradeIntel.lookupBillOfLading(' '),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toHaveLength(0);
  });

  describe('errors', () => {
    it('maps a 400 { error } body to ValidationError with the server message', async () => {
      const { client } = makeClient({
        '/trade_intel/importers/top': () =>
          jsonResponse(
            {
              error:
                "hs4 must be a 4-digit HS code, e.g. '0306'; use commodities/search to find one",
            },
            400,
          ),
      });

      const error = await client.tradeIntel
        .topImporters({ hs4: '03' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).status).toBe(400);
      expect((error as ValidationError).message).toMatch(
        /hs4 must be a 4-digit HS code/,
      );
    });

    it('maps a 422 { detail: [...] } body to ValidationError naming the field', async () => {
      const { client } = makeClient({
        '/trade_intel/commodities/search': () =>
          jsonResponse(
            {
              detail: [
                {
                  loc: ['body', 'limit'],
                  msg: 'Input should be less than or equal to 50',
                  type: 'less_than_equal',
                },
              ],
            },
            422,
          ),
      });

      const error = await client.tradeIntel
        .searchCommodities({ query: 'laptops', limit: 500 })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).status).toBe(422);
      expect((error as ValidationError).message).toBe(
        'Input should be less than or equal to 50 (body.limit)',
      );
    });

    it('maps the 403 not-enabled body to FeatureNotEnabledError', async () => {
      const { client } = makeClient({
        '/trade_intel/meta': () =>
          jsonResponse(
            { error: 'Trade intelligence is not enabled for this account' },
            403,
          ),
      });

      const error = await client.tradeIntel.meta().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(FeatureNotEnabledError);
      expect((error as FeatureNotEnabledError).status).toBe(403);
      expect((error as FeatureNotEnabledError).message).toBe(
        'Trade intelligence is not enabled for this account',
      );
    });

    it('retries a 429 on a query POST and then succeeds', async () => {
      vi.useFakeTimers();
      try {
        let attempt = 0;
        const body = fixture('trade-intel.trends');
        const { client, calls } = makeClient(
          {
            '/trade_intel/trends': () => {
              attempt += 1;
              if (attempt === 1) {
                return jsonResponse(
                  { error: 'Rate limit exceeded; retry in a minute' },
                  429,
                  { 'Retry-After': '1' },
                );
              }
              return jsonResponse(body);
            },
          },
          2,
        );

        const resultPromise = client.tradeIntel.trends({
          filters: { hs4: '9401' },
        });
        await vi.advanceTimersByTimeAsync(1000);
        const result = await resultPromise;

        expect(result).toEqual(body);
        expect(calls).toHaveLength(2);
        expect(sentBody(calls[1])).toEqual({ filters: { hs4: '9401' } });
      } finally {
        vi.useRealTimers();
      }
    });

    it('surfaces RateLimitError once retries on a 429 are exhausted', async () => {
      const { client, calls } = makeClient({
        '/trade_intel/meta': () =>
          jsonResponse(
            { error: 'Rate limit exceeded; retry in a minute' },
            429,
          ),
      });

      const error = await client.tradeIntel.meta().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).message).toBe(
        'Rate limit exceeded; retry in a minute',
      );
      expect(calls).toHaveLength(1);
    });

    it('retries a 502 on a query POST and maps an exhausted retry to UpstreamError', async () => {
      vi.useFakeTimers();
      try {
        const { client, calls } = makeClient(
          {
            '/trade_intel/companies/profile': () =>
              jsonResponse(
                {
                  error:
                    'Trade intelligence is temporarily unavailable; try again shortly',
                },
                502,
              ),
          },
          1,
        );

        const resultPromise = client.tradeIntel
          .companyProfile({ company_name: 'EXAMPLE OUTDOOR SUPPLY' })
          .catch((e: unknown) => e);
        await vi.advanceTimersByTimeAsync(500);
        const error = await resultPromise;

        expect(error).toBeInstanceOf(UpstreamError);
        expect((error as UpstreamError).status).toBe(502);
        expect((error as UpstreamError).message).toMatch(
          /temporarily unavailable/,
        );
        expect(calls).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
