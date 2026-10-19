import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import {
  CUSTOM_FIELDS_AUTH_NOTE,
  CUSTOM_FIELDS_FEATURE_NOTE,
} from './custom-fields.js';
import {
  CUSTOM_FIELD_OPTIONS_NOTE,
  executeListCustomFieldDefinitions,
  listCustomFieldDefinitionsOutputSchema,
} from './list-custom-field-definitions.js';

const DEFINITIONS_PATH = 'GET /accounts/current/custom_field_definitions';
const PO_ID = '7e1d2c3b-4a59-4687-9a8b-7c6d5e4f3a2b';
const PRIORITY_ID = '8f2e3d4c-5b6a-4798-8b9c-8d7e6f5a4b3c';
const OLD_ID = '9a3f4e5d-6c7b-48a9-9cad-9e8f7a6b5c4d';

const definition = (id: string, attributes: Record<string, unknown>) => ({
  id,
  type: 'custom_field_definition',
  attributes: {
    description: null,
    reference_type: null,
    validation: null,
    sensitive: false,
    discarded_at: null,
    ...attributes,
  },
});

const definitions = {
  data: [
    definition(PO_ID, {
      api_slug: 'po_number',
      display_name: 'PO number',
      entity_type: 'Cargo',
      data_type: 'short_text',
      validation: { max_length: 64 },
    }),
    definition(PRIORITY_ID, {
      api_slug: 'priority',
      display_name: 'Priority',
      entity_type: 'Shipment',
      data_type: 'enum',
    }),
    definition(OLD_ID, {
      api_slug: 'old_field',
      display_name: 'Old field',
      entity_type: 'Shipment',
      data_type: 'number',
      discarded_at: '2026-01-01T00:00:00Z',
    }),
  ],
  links: { next: '/v2/accounts/current/custom_field_definitions?page=2' },
};

const priorityOptions = {
  data: [
    {
      id: 'option-low',
      type: 'custom_field_option',
      attributes: { label: 'Low', value: 'low', position: 2 },
    },
    {
      id: 'option-high',
      type: 'custom_field_option',
      attributes: { label: 'High', value: 'high', position: 1 },
    },
  ],
};

describe('list_custom_field_definitions', () => {
  it('lists active definitions with enum options in position order', async () => {
    const { client, requests } = fakeApiClient({
      [DEFINITIONS_PATH]: { body: definitions },
      [`GET /custom_field_definitions/${PRIORITY_ID}/options`]: {
        body: priorityOptions,
      },
    });

    const result = await executeListCustomFieldDefinitions({}, client);

    expect(requests.map((request) => request.path)).toEqual([
      '/accounts/current/custom_field_definitions',
      `/custom_field_definitions/${PRIORITY_ID}/options`,
    ]);
    expect(result).toEqual({
      total: 2,
      definitions: [
        {
          id: PO_ID,
          api_slug: 'po_number',
          display_name: 'PO number',
          description: null,
          entity_type: 'container',
          data_type: 'short_text',
          reference_type: null,
          validation: { max_length: 64 },
          sensitive: false,
          archived: false,
        },
        {
          id: PRIORITY_ID,
          api_slug: 'priority',
          display_name: 'Priority',
          description: null,
          entity_type: 'shipment',
          data_type: 'enum',
          reference_type: null,
          validation: null,
          sensitive: false,
          archived: false,
          options: [
            { id: 'option-high', label: 'High', value: 'high' },
            { id: 'option-low', label: 'Low', value: 'low' },
          ],
        },
      ],
    });
    expect(listCustomFieldDefinitionsOutputSchema.parse(result)).toEqual(
      result,
    );
  });

  it('includes archived definitions when asked', async () => {
    const { client } = fakeApiClient({
      [DEFINITIONS_PATH]: { body: definitions },
      [`GET /custom_field_definitions/${PRIORITY_ID}/options`]: {
        body: priorityOptions,
      },
    });

    const result = await executeListCustomFieldDefinitions(
      { include_archived: true },
      client,
    );

    expect(result.total).toBe(3);
    expect(result.definitions?.at(-1)).toMatchObject({
      api_slug: 'old_field',
      archived: true,
    });
  });

  it('filters by entity type with the API name for containers', async () => {
    const { client, requests } = fakeApiClient({
      [DEFINITIONS_PATH]: { body: { data: [] } },
    });

    const result = await executeListCustomFieldDefinitions(
      { entity_type: 'container' },
      client,
    );

    expect(requests[0]?.query.get('filter[entity_type]')).toBe('Cargo');
    expect(result).toEqual({ total: 0, definitions: [] });
  });

  it('explains a credential that cannot read custom fields', async () => {
    const { client } = fakeApiClient({
      [DEFINITIONS_PATH]: { status: 401 },
    });

    const result = await executeListCustomFieldDefinitions({}, client);

    expect(result).toEqual({
      total: 0,
      definitions: null,
      custom_fields_note: CUSTOM_FIELDS_AUTH_NOTE,
    });
    expect(listCustomFieldDefinitionsOutputSchema.parse(result)).toEqual(
      result,
    );
  });

  it('explains an account without custom fields', async () => {
    const { client } = fakeApiClient({
      [DEFINITIONS_PATH]: {
        status: 403,
        body: {
          errors: [
            { status: '403', detail: 'Custom fields feature is not enabled' },
          ],
        },
      },
    });

    const result = await executeListCustomFieldDefinitions({}, client);

    expect(result.custom_fields_note).toBe(CUSTOM_FIELDS_FEATURE_NOTE);
  });

  it('keeps the other definitions when one enum field has unreadable options', async () => {
    const STATUS_ID = 'a4b5c6d7-e8f9-4a0b-8c1d-2e3f4a5b6c7d';
    const { client } = fakeApiClient({
      [DEFINITIONS_PATH]: {
        body: {
          data: [
            ...definitions.data,
            definition(STATUS_ID, {
              api_slug: 'status',
              display_name: 'Status',
              entity_type: 'Cargo',
              data_type: 'enum_multi',
            }),
          ],
        },
      },
      [`GET /custom_field_definitions/${PRIORITY_ID}/options`]: {
        status: 404,
      },
      [`GET /custom_field_definitions/${STATUS_ID}/options`]: {
        body: priorityOptions,
      },
    });

    const result = await executeListCustomFieldDefinitions({}, client);

    expect(result.total).toBe(3);
    expect(
      result.definitions?.find((row) => row.id === PRIORITY_ID),
    ).toMatchObject({
      api_slug: 'priority',
      options: null,
      options_note: CUSTOM_FIELD_OPTIONS_NOTE,
    });
    expect(
      result.definitions?.find((row) => row.id === STATUS_ID)?.options,
    ).toHaveLength(2);
    expect(listCustomFieldDefinitionsOutputSchema.parse(result)).toEqual(
      result,
    );
  });

  it('fails the call when option loading is rate limited', async () => {
    const { client } = fakeApiClient({
      [DEFINITIONS_PATH]: { body: definitions },
      [`GET /custom_field_definitions/${PRIORITY_ID}/options`]: {
        status: 429,
      },
    });

    await expect(
      executeListCustomFieldDefinitions({}, client),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('drops a malformed definition row and keeps the rest', async () => {
    const { client } = fakeApiClient({
      [DEFINITIONS_PATH]: {
        body: {
          data: [
            definitions.data[0],
            { id: 'no-slug', type: 'custom_field_definition', attributes: {} },
            { id: 'no-attributes', type: 'custom_field_definition' },
          ],
        },
      },
    });

    const result = await executeListCustomFieldDefinitions({}, client);

    expect(result.total).toBe(1);
    expect(result.definitions?.map((row) => row.api_slug)).toEqual([
      'po_number',
    ]);
  });
});
