import { describe, expect, it, vi } from 'vite-plus/test';
import {
  CUSTOM_FIELDS_AUTH_NOTE,
  formatCustomFields,
  loadCustomFields,
} from './custom-fields.js';
import { executeGetContainer } from './get-container.js';
import { executeGetShipmentDetails } from './get-shipment-details.js';

const mappedFields = [
  {
    id: 'cf-1',
    slug: 'project_manager',
    name: 'Project Manager',
    value: 'Roberto',
    displayValue: 'Roberto',
    dataType: 'short_text',
  },
  { id: 'cf-2', slug: 'is_priority', value: true, displayValue: 'Yes' },
];

const containerDoc = {
  data: {
    id: 'c-1',
    type: 'container',
    attributes: {
      number: 'CAIU1234567',
      current_status: 'available',
      created_at: '2026-09-01T00:00:00Z',
    },
    relationships: {},
  },
  included: [],
};

const shipmentDoc = {
  data: {
    id: 's-1',
    type: 'shipment',
    attributes: {
      bill_of_lading_number: 'MAEU123456789',
      shipping_line_scac: 'MAEU',
      pol_atd_at: '2026-08-01T00:00:00Z',
    },
    relationships: {},
  },
  included: [],
};

function authError(): Error {
  const error = new Error('unauthorized') as Error & { status: number };
  error.name = 'AuthenticationError';
  error.status = 401;
  return error;
}

function fakeClient(customFields: () => Promise<unknown>) {
  return {
    containers: {
      get: vi.fn().mockResolvedValue(containerDoc),
      customFields: vi.fn().mockImplementation(customFields),
    },
    shipments: {
      get: vi.fn().mockResolvedValue(shipmentDoc),
      customFields: vi.fn().mockImplementation(customFields),
    },
  } as any;
}

describe('formatCustomFields', () => {
  it('flattens mapped SDK fields and drops rows without a slug', () => {
    expect(formatCustomFields([...mappedFields, { value: 'orphan' }])).toEqual([
      {
        name: 'Project Manager',
        slug: 'project_manager',
        value: 'Roberto',
        display_value: 'Roberto',
        data_type: 'short_text',
      },
      {
        name: null,
        slug: 'is_priority',
        value: true,
        display_value: 'Yes',
        data_type: null,
      },
    ]);
  });
});

describe('loadCustomFields', () => {
  it('turns an auth failure into a note instead of an error', async () => {
    await expect(
      loadCustomFields(() => Promise.reject(authError())),
    ).resolves.toEqual({
      custom_fields: null,
      custom_fields_note: CUSTOM_FIELDS_AUTH_NOTE,
    });
  });

  it('rethrows other failures', async () => {
    await expect(
      loadCustomFields(() => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');
  });
});

describe('get_container custom fields', () => {
  it('loads custom fields when requested and keeps them out of the API include list', async () => {
    const client = fakeClient(() => Promise.resolve(mappedFields));

    const result = await executeGetContainer(
      { id: 'c-1', include: ['custom_fields'] },
      client,
    );

    expect(client.containers.get).toHaveBeenCalledWith(
      'c-1',
      ['shipment', 'pod_terminal'],
      { format: 'raw' },
    );
    expect(client.containers.customFields).toHaveBeenCalledWith('c-1', {
      format: 'mapped',
    });
    expect(result.custom_fields).toHaveLength(2);
    expect(result.custom_fields?.[0]).toMatchObject({
      name: 'Project Manager',
      slug: 'project_manager',
      value: 'Roberto',
    });
    expect(result._metadata.includes_loaded).toContain('custom_fields');
  });

  it('skips the extra request when not requested', async () => {
    const client = fakeClient(() => Promise.resolve(mappedFields));

    const result = await executeGetContainer({ id: 'c-1' }, client);

    expect(client.containers.customFields).not.toHaveBeenCalled();
    expect(result.custom_fields).toBeNull();
    expect(result._metadata.includes_loaded).not.toContain('custom_fields');
  });

  it('reports an API-key credential as a note', async () => {
    const client = fakeClient(() => Promise.reject(authError()));

    const result = await executeGetContainer(
      { id: 'c-1', include: ['custom_fields'] },
      client,
    );

    expect(result.custom_fields).toBeNull();
    expect(result.custom_fields_note).toBe(CUSTOM_FIELDS_AUTH_NOTE);
  });
});

describe('get_shipment_details custom fields', () => {
  it('loads shipment custom fields on demand', async () => {
    const client = fakeClient(() => Promise.resolve(mappedFields));

    const result = await executeGetShipmentDetails(
      { id: 's-1', include_custom_fields: true },
      client,
    );

    expect(client.shipments.customFields).toHaveBeenCalledWith('s-1', {
      format: 'mapped',
    });
    expect(result.custom_fields).toHaveLength(2);
    expect(result._metadata.includes_loaded).toEqual([
      'containers',
      'ports',
      'terminals',
      'custom_fields',
    ]);
  });

  it('leaves custom fields out by default', async () => {
    const client = fakeClient(() => Promise.resolve(mappedFields));

    const result = await executeGetShipmentDetails({ id: 's-1' }, client);

    expect(client.shipments.customFields).not.toHaveBeenCalled();
    expect(result.custom_fields).toBeNull();
    expect(result._metadata.includes_loaded).toEqual([
      'containers',
      'ports',
      'terminals',
    ]);
  });
});
