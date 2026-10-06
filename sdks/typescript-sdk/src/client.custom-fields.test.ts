import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client } from './client.js';
import { createMockFetch, jsonResponse } from './test/mock-fetch.js';

const baseUrl = 'https://api.test/v2';

const customFieldsDoc = {
  data: [
    {
      id: 'cf-1',
      type: 'custom_field',
      attributes: {
        value: 'Roberto',
        display_value: 'Roberto',
        api_slug: 'project_manager',
        updated_at: '2026-09-29T08:00:00Z',
      },
      relationships: {
        definition: { data: { id: 'def-1', type: 'custom_field_definition' } },
      },
    },
    {
      id: 'cf-2',
      type: 'custom_field',
      attributes: {
        value: true,
        display_value: 'Yes',
        api_slug: 'is_priority',
      },
      relationships: { definition: { data: null } },
    },
  ],
  included: [
    {
      id: 'def-1',
      type: 'custom_field_definition',
      attributes: {
        api_slug: 'project_manager',
        display_name: 'Project Manager',
        data_type: 'short_text',
      },
    },
  ],
};

function buildClient(path: string) {
  const { fetchImpl, calls } = createMockFetch({
    [path]: () => jsonResponse(customFieldsDoc),
  });
  const client = new Terminal49Client({
    apiToken: 'token-123',
    apiBaseUrl: baseUrl,
    fetchImpl,
  } as any);
  return { client, calls };
}

describe('custom fields', () => {
  it('maps container custom fields with their definitions', async () => {
    const { client, calls } = buildClient(
      '/containers/abc/custom_fields?include=definition',
    );

    const result = await client.containers.customFields('abc', {
      format: 'mapped',
    });

    expect(calls[0].url.pathname).toBe('/v2/containers/abc/custom_fields');
    expect(result).toEqual([
      {
        id: 'cf-1',
        slug: 'project_manager',
        name: 'Project Manager',
        value: 'Roberto',
        displayValue: 'Roberto',
        dataType: 'short_text',
        updatedAt: '2026-09-29T08:00:00Z',
      },
      {
        id: 'cf-2',
        slug: 'is_priority',
        name: undefined,
        value: true,
        displayValue: 'Yes',
        dataType: undefined,
        updatedAt: null,
      },
    ]);
  });

  it('returns the raw JSON:API document by default', async () => {
    const { client } = buildClient(
      '/containers/abc/custom_fields?include=definition',
    );

    const result = await client.containers.customFields('abc');

    expect(result.data).toHaveLength(2);
    expect(result.included[0].attributes.display_name).toBe('Project Manager');
  });

  it('reads shipment custom fields from the shipment sub-resource', async () => {
    const { client, calls } = buildClient(
      '/shipments/ship%201/custom_fields?include=definition',
    );

    const result = await client.shipments.customFields('ship 1', {
      format: 'mapped',
    });

    expect(calls[0].url.pathname).toBe('/v2/shipments/ship%201/custom_fields');
    expect(result[0].name).toBe('Project Manager');
  });
});
