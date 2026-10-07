import { describe, expect, it, vi } from 'vite-plus/test';
import { Terminal49Client } from '@terminal49/sdk';
import { resolveCustomFieldFilters } from './custom-field-filters.js';
import { executeListContainers } from './list-containers.js';

const definitions = {
  data: [
    {
      id: 'def-rep',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'sales_rep',
        display_name: 'Sales Rep',
        data_type: 'short_text',
      },
    },
    {
      id: 'def-incoterm',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'incoterm',
        display_name: 'Incoterm',
        data_type: 'enum',
      },
      relationships: {
        options: {
          data: [
            { id: 'opt-fob', type: 'custom_field_option' },
            { id: 'opt-cif', type: 'custom_field_option' },
          ],
        },
      },
    },
    {
      id: 'def-cost',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'drayage_cost',
        display_name: 'Drayage Cost',
        data_type: 'number',
      },
    },
    {
      id: 'def-reefer',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'needs_refrigeration',
        display_name: 'Needs Refrigeration',
        data_type: 'boolean',
      },
    },
    {
      id: 'def-planned',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'planned_delivery_date',
        display_name: 'Planned Delivery Date',
        data_type: 'date',
      },
    },
    {
      id: 'def-old',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'old_field',
        display_name: 'Old Field',
        data_type: 'short_text',
        discarded_at: '2026-01-01T00:00:00Z',
      },
    },
  ],
  included: [
    {
      id: 'opt-fob',
      type: 'custom_field_option',
      attributes: { value: 'FOB' },
    },
    {
      id: 'opt-cif',
      type: 'custom_field_option',
      attributes: { value: 'CIF' },
    },
  ],
};

// Templates are what the unscoped endpoint returns; the resolver must not use
// them, because the account may never have added a template field.
const templates = {
  data: [
    {
      id: 'tpl-isf',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'isf_filed',
        display_name: 'ISF Filed',
        data_type: 'boolean',
      },
    },
  ],
};

function fakeClient({
  accountId,
  accounts = [{ id: 'acct-1', type: 'account' }],
}: { accountId?: string; accounts?: unknown[] } = {}) {
  const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const path = new URL((input as Request).url ?? String(input)).pathname;
    const body = /\/accounts\/[^/]+\/custom_field_definitions$/.test(path)
      ? definitions
      : path.endsWith('/custom_field_definitions')
        ? templates
        : path.endsWith('/accounts')
          ? { data: accounts }
          : { data: [], links: { next: null }, meta: { total: 3 } };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/vnd.api+json' },
    });
  });
  return {
    client: new Terminal49Client({
      apiToken: 'TEST_KEY',
      accountId,
      fetchImpl,
    }),
    fetchImpl,
  };
}

const urlOf = (call: unknown) =>
  new URL(((call as [Request])[0] as Request).url);

describe('resolveCustomFieldFilters', () => {
  it('makes no request without custom fields', async () => {
    const { client, fetchImpl } = fakeClient();
    expect(await resolveCustomFieldFilters(undefined, client)).toEqual({
      resolved: [],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves display names, slugs, and loose spellings', async () => {
    const { client, fetchImpl } = fakeClient();
    const result = await resolveCustomFieldFilters(
      { 'sales rep': 'Jane', incoterm: 'fob, cif' },
      client,
    );
    expect(result.custom_fields).toEqual({
      sales_rep: 'Jane',
      incoterm: 'FOB,CIF',
    });
    expect(result.resolved[0]).toMatchObject({
      field: 'Sales Rep',
      api_slug: 'sales_rep',
    });
    expect(urlOf(fetchImpl.mock.calls[1]).searchParams.get('include')).toBe(
      'options',
    );
    const loose = await resolveCustomFieldFilters(
      { SalesRep: '@exists' },
      client,
    );
    expect(loose.custom_fields).toEqual({ sales_rep: '@exists' });
  });

  it('lists the filterable fields when the name is unknown', async () => {
    const { client } = fakeClient();
    await expect(
      resolveCustomFieldFilters({ 'Account Manager': 'Jane' }, client),
    ).rejects.toThrow(
      'Its fields: Sales Rep, Incoterm, Drayage Cost, Needs Refrigeration, Planned Delivery Date.',
    );
  });

  it('treats discarded definitions as unknown', async () => {
    const { client } = fakeClient();
    await expect(
      resolveCustomFieldFilters({ 'Old Field': 'x' }, client),
    ).rejects.toThrow('this account has no custom field with that name');
  });

  it('rejects enum values that are not options', async () => {
    const { client } = fakeClient();
    await expect(
      resolveCustomFieldFilters({ Incoterm: 'EXW' }, client),
    ).rejects.toThrow('Options: FOB, CIF.');
  });

  it("reads the account's own fields, not templates", async () => {
    const { client, fetchImpl } = fakeClient({ accountId: 'acct-9' });
    await expect(
      resolveCustomFieldFilters({ 'ISF Filed': 'true' }, client),
    ).rejects.toThrow('this account has no custom field with that name');
    const paths = fetchImpl.mock.calls.map((call) => urlOf(call).pathname);
    expect(paths).toEqual(['/v2/accounts/acct-9/custom_field_definitions']);
  });

  it('finds the account from an API key credential', async () => {
    const { client, fetchImpl } = fakeClient();
    await resolveCustomFieldFilters({ 'Sales Rep': 'Jane' }, client);
    const paths = fetchImpl.mock.calls.map((call) => urlOf(call).pathname);
    expect(paths).toEqual([
      '/v2/accounts',
      '/v2/accounts/acct-1/custom_field_definitions',
    ]);
  });

  it('refuses to guess when the credential sees several accounts', async () => {
    const { client } = fakeClient({
      accounts: [
        { id: 'a', type: 'account' },
        { id: 'b', type: 'account' },
      ],
    });
    await expect(
      resolveCustomFieldFilters({ 'Sales Rep': 'Jane' }, client),
    ).rejects.toThrow('need the account');
  });

  it('normalizes yes/no, date, and number values', async () => {
    const { client } = fakeClient();
    const result = await resolveCustomFieldFilters(
      {
        'Needs Refrigeration': 'Yes',
        'Planned Delivery Date': '>=2026-10-01',
        'Drayage Cost': '=250',
      },
      client,
    );
    expect(result.custom_fields).toEqual({
      needs_refrigeration: 'true',
      planned_delivery_date: '>=2026-10-01',
      drayage_cost: '250',
    });
  });

  it('rejects values a field type cannot filter on', async () => {
    const { client } = fakeClient();
    await expect(
      resolveCustomFieldFilters({ 'Needs Refrigeration': 'maybe' }, client),
    ).rejects.toThrow('expected true, false');
    await expect(
      resolveCustomFieldFilters(
        { 'Planned Delivery Date': 'next week' },
        client,
      ),
    ).rejects.toThrow('expected a date');
    await expect(
      resolveCustomFieldFilters({ 'Drayage Cost': '>=100' }, client),
    ).rejects.toThrow('comparisons are not supported');
  });
});

describe('list_containers custom_fields', () => {
  it('sends the resolved slug and echoes the resolution', async () => {
    const { client, fetchImpl } = fakeClient();
    const result = await executeListContainers(
      { custom_fields: { 'Sales Rep': 'Jane' } },
      client,
    );
    const url = urlOf(fetchImpl.mock.calls.at(-1));
    expect(url.searchParams.get('filter[custom_fields][sales_rep]')).toBe(
      'Jane',
    );
    expect(result._metadata.applied_filters.custom_fields).toEqual({
      sales_rep: 'Jane',
    });
    expect(result._metadata.custom_fields).toEqual([
      {
        field: 'Sales Rep',
        api_slug: 'sales_rep',
        data_type: 'short_text',
        value: 'Jane',
      },
    ]);
  });
});
