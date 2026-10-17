import { describe, expect, it } from 'vite-plus/test';
import { fakeApiClient } from '../test/fake-api.js';
import { meBody, writeContext } from '../test/write-context.js';
import {
  checkValue,
  CREDENTIAL_NOT_SUPPORTED,
  CUSTOM_FIELDS_NOT_ENABLED,
  customFieldsRefused,
  type FieldDefinition,
  fieldNotApplicable,
  findDefinition,
  readStoredValue,
  sameValue,
} from './custom-field-values.js';

const CONTAINER_ID = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const field = (
  data_type: string,
  extra: Partial<FieldDefinition> = {},
): FieldDefinition => ({
  id: 'def-1',
  api_slug: 'the_field',
  display_name: 'The field',
  entity_type: 'container',
  data_type,
  ...extra,
});

const priority = field('enum', {
  options: [
    { id: 'o1', label: 'Low', value: 'low' },
    { id: 'o2', label: 'High', value: 'high' },
  ],
});

const tags = field('enum_multi', { options: priority.options });

describe('checkValue', () => {
  it.each([
    ['short_text', 'PO-1', 'PO-1'],
    ['number', 12.5, 12.5],
    ['number', -3, -3],
    ['date', '2026-02-28', '2026-02-28'],
    ['datetime', '2026-03-01T14:30:00Z', '2026-03-01T14:30:00Z'],
    [
      'datetime',
      '2026-03-01T14:30:00.123+05:30',
      '2026-03-01T14:30:00.123+05:30',
    ],
    ['boolean', false, false],
  ] as const)('accepts a %s value %j', (dataType, value, accepted) => {
    expect(checkValue(field(dataType), value)).toEqual({
      ok: true,
      value: accepted,
    });
  });

  it.each([
    ['short_text', 12],
    ['number', '12'],
    ['number', 1e12],
    ['date', '2026-02-30'],
    ['date', '02/03/2026'],
    ['date', '2026-03-01T00:00:00Z'],
    ['datetime', '2026-03-01T14:30:00'],
    ['datetime', '2026-03-01'],
    ['datetime', '2026-13-01T14:30:00Z'],
    ['boolean', 'true'],
  ] as const)('refuses a %s value %j', (dataType, value) => {
    const result = checkValue(field(dataType), value);
    expect(result).toMatchObject({
      ok: false,
      result: {
        error: 'invalid_value',
        api_slug: 'the_field',
        data_type: dataType,
        expected: expect.any(String),
      },
    });
    expect(result).not.toHaveProperty('result.allowed_values');
  });

  it('accepts only an option value for an enum and lists the options otherwise', () => {
    expect(checkValue(priority, 'high')).toEqual({ ok: true, value: 'high' });
    expect(checkValue(priority, 'High')).toEqual({
      ok: false,
      result: {
        error: 'invalid_value',
        message:
          'The value does not fit the custom field the_field, whose data_type enum needs exactly one of allowed_values. Nothing was changed.',
        alternative: 'Ask the user to choose from allowed_values.',
        api_slug: 'the_field',
        data_type: 'enum',
        expected: 'exactly one of allowed_values',
        allowed_values: ['low', 'high'],
      },
    });
    expect(checkValue(priority, ['high'])).toMatchObject({ ok: false });
  });

  it('accepts a list of option values for enum_multi and drops repeats', () => {
    expect(checkValue(tags, ['high', 'low', 'high'])).toEqual({
      ok: true,
      value: ['high', 'low'],
    });
    expect(checkValue(tags, ['high', 'urgent'])).toMatchObject({
      ok: false,
      result: { error: 'invalid_value', allowed_values: ['low', 'high'] },
    });
    expect(checkValue(tags, 'high')).toMatchObject({ ok: false });
  });

  it('refuses a data type it cannot write', () => {
    expect(checkValue(field('reference'), 'x')).toEqual({
      ok: false,
      result: {
        error: 'unsupported_field',
        message:
          'This tool cannot write custom fields of data_type reference. Nothing was changed.',
        alternative: 'Change this field in the Terminal49 dashboard.',
        api_slug: 'the_field',
        data_type: 'reference',
      },
    });
  });
});

describe('fieldNotApplicable', () => {
  it('lets a tracking request take container and shipment fields', () => {
    expect(fieldNotApplicable(field('number'), 'tracking_request')).toBe(
      undefined,
    );
    expect(
      fieldNotApplicable(
        field('number', { entity_type: 'shipment' }),
        'tracking_request',
      ),
    ).toBe(undefined);
    expect(fieldNotApplicable(field('number'), 'container')).toBe(undefined);
  });

  it('refuses a shipment field on a container', () => {
    expect(
      fieldNotApplicable(
        field('number', { entity_type: 'shipment' }),
        'container',
      ),
    ).toEqual({
      error: 'field_not_applicable',
      message:
        'The custom field the_field belongs on shipments, not on a container. Nothing was changed.',
      alternative: 'Set it on the shipment instead.',
      api_slug: 'the_field',
      field_entity_type: 'shipment',
    });
  });
});

describe('sameValue', () => {
  it('compares numbers, times and option lists by meaning', () => {
    expect(sameValue('number', '12.5', 12.5)).toBe(true);
    expect(sameValue('number', '12.5', 12)).toBe(false);
    expect(
      sameValue(
        'datetime',
        '2026-03-01T14:30:00.000Z',
        '2026-03-01T09:30:00-05:00',
      ),
    ).toBe(true);
    expect(sameValue('enum_multi', ['b', 'a'], ['a', 'b'])).toBe(true);
    expect(sameValue('short_text', 'PO-1', 'PO-2')).toBe(false);
    expect(sameValue('boolean', false, false)).toBe(true);
  });
});

describe('findDefinition', () => {
  const definitions = {
    data: [
      {
        id: 'archived',
        type: 'custom_field_definition',
        attributes: {
          api_slug: 'priority',
          data_type: 'enum',
          entity_type: 'Shipment',
          discarded_at: '2026-01-01T00:00:00Z',
        },
      },
      {
        id: 'def-priority',
        type: 'custom_field_definition',
        attributes: {
          api_slug: 'priority',
          display_name: 'Priority',
          data_type: 'enum',
          entity_type: 'Shipment',
          discarded_at: null,
        },
      },
    ],
  };

  it('finds the active definition and loads its options', async () => {
    const { client, requests } = fakeApiClient({
      'GET /accounts/current/custom_field_definitions': { body: definitions },
      'GET /custom_field_definitions/def-priority/options': {
        body: {
          data: [
            {
              id: 'o2',
              attributes: { label: 'High', value: 'high', position: 2 },
            },
            {
              id: 'o1',
              attributes: { label: 'Low', value: 'low', position: 1 },
            },
          ],
        },
      },
    });

    expect(await findDefinition(client, 'priority')).toEqual({
      id: 'def-priority',
      api_slug: 'priority',
      display_name: 'Priority',
      entity_type: 'shipment',
      data_type: 'enum',
      options: [
        { id: 'o1', label: 'Low', value: 'low' },
        { id: 'o2', label: 'High', value: 'high' },
      ],
    });
    expect(requests.map((request) => request.path)).toEqual([
      '/accounts/current/custom_field_definitions',
      '/custom_field_definitions/def-priority/options',
    ]);
  });

  it('returns undefined for a slug with only an archived definition', async () => {
    const { client } = fakeApiClient({
      'GET /accounts/current/custom_field_definitions': {
        body: { data: [definitions.data[0]] },
      },
    });
    expect(await findDefinition(client, 'priority')).toBe(undefined);
  });
});

describe('readStoredValue', () => {
  const fields = (value: unknown) => ({
    [`GET /containers/${CONTAINER_ID}/custom_fields`]: {
      body: {
        data: [
          {
            id: 'cf-1',
            type: 'custom_field',
            attributes: { api_slug: 'other', value: 'x', display_value: 'x' },
          },
          {
            id: 'cf-2',
            type: 'custom_field',
            attributes: { api_slug: 'priority', value, display_value: 'High' },
          },
        ],
      },
    },
  });

  it('reads the value of the requested field', async () => {
    const { client, requests } = fakeApiClient(fields('high'));
    expect(
      await readStoredValue(client, 'container', CONTAINER_ID, 'priority'),
    ).toEqual({ value: 'high', display_value: 'High' });
    expect(requests[0]?.query.get('include')).toBe('definition');
  });

  it.each([[''], [[]], [null]])('treats %j as no value', async (value) => {
    const { client } = fakeApiClient(fields(value));
    expect(
      await readStoredValue(client, 'container', CONTAINER_ID, 'priority'),
    ).toBe(undefined);
  });
});

describe('customFieldsRefused', () => {
  const refusal = { status: 401, name: 'AuthenticationError', message: '' };

  it('names the credential when /me says custom fields need a user', async () => {
    const { client } = fakeApiClient({
      'GET /me': {
        body: meBody({ custom_fields: { status: 'requires_user_credential' } }),
      },
    });
    expect(await customFieldsRefused(refusal, writeContext(client))).toEqual(
      CREDENTIAL_NOT_SUPPORTED,
    );
  });

  it('reports a missing feature from /me or from a feature 403', async () => {
    const { client } = fakeApiClient({
      'GET /me': {
        body: meBody({ custom_fields: { status: 'requires_paid_plan' } }),
      },
    });
    expect(await customFieldsRefused(refusal, writeContext(client))).toEqual(
      CUSTOM_FIELDS_NOT_ENABLED,
    );
    expect(
      await customFieldsRefused(
        { name: 'FeatureNotEnabledError', status: 403, message: '' },
        writeContext(client),
      ),
    ).toEqual(CUSTOM_FIELDS_NOT_ENABLED);
  });

  it('leaves other refusals and errors alone', async () => {
    const { client } = fakeApiClient({
      'GET /me': { body: meBody({ custom_fields: { status: 'available' } }) },
    });
    expect(await customFieldsRefused(refusal, writeContext(client))).toBe(
      undefined,
    );
    expect(
      await customFieldsRefused({ status: 500 }, writeContext(client)),
    ).toBe(undefined);
  });
});
