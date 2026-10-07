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

function fakeClient() {
  const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
    const url = String((input as Request).url ?? input);
    const body = url.includes('/custom_field_definitions')
      ? definitions
      : { data: [], links: { next: null }, meta: { total: 3 } };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/vnd.api+json' },
    });
  });
  return {
    client: new Terminal49Client({ apiToken: 'TEST_KEY', fetchImpl }),
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
    expect(urlOf(fetchImpl.mock.calls[0]).searchParams.get('include')).toBe(
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
    ).rejects.toThrow('Filterable fields: Sales Rep, Incoterm.');
  });

  it('treats discarded definitions as unknown', async () => {
    const { client } = fakeClient();
    await expect(
      resolveCustomFieldFilters({ 'Old Field': 'x' }, client),
    ).rejects.toThrow('no custom field with that name');
  });

  it('rejects enum values that are not options', async () => {
    const { client } = fakeClient();
    await expect(
      resolveCustomFieldFilters({ Incoterm: 'EXW' }, client),
    ).rejects.toThrow('Options: FOB, CIF.');
  });

  it('rejects field types the API does not filter', async () => {
    const { client } = fakeClient();
    await expect(
      resolveCustomFieldFilters({ 'Drayage Cost': '@exists' }, client),
    ).rejects.toThrow('number custom fields cannot be filtered yet');
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
