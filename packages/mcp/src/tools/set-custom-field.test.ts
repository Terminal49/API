import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import {
  CF_CONTAINER_ID,
  CF_CONTAINER_PATH,
  CF_TRACKING_REQUEST_ID,
  PO_DEFINITION_ID,
  sentValue,
  storedCustomFields,
} from '../test/custom-field-fixtures.js';
import { fakeApiClient } from '../test/fake-api.js';
import { auditEvents, meBody, writeContext } from '../test/write-context.js';
import {
  CREDENTIAL_NOT_SUPPORTED,
  CUSTOM_FIELDS_NOT_ENABLED,
} from './custom-field-values.js';
import {
  executeSetCustomField,
  setCustomFieldInputSchema,
  setCustomFieldOutputSchema,
} from './set-custom-field.js';

const RECORD = {
  entity_type: 'container',
  entity_id: CF_CONTAINER_ID,
  label: 'MSCU1234565',
} as const;

const PO_FIELD = {
  api_slug: 'po_number',
  display_name: 'PO number',
  data_type: 'short_text',
};

const TRACKING_REQUEST_PATH = `/tracking_requests/${CF_TRACKING_REQUEST_ID}`;

const trackingRequest = {
  data: {
    id: CF_TRACKING_REQUEST_ID,
    type: 'tracking_request',
    attributes: { request_number: 'MAEU123456789', ref_numbers: [] },
  },
};

const args = (api_slug: string, value: unknown) => ({
  entity_type: 'container' as const,
  entity_id: CF_CONTAINER_ID,
  api_slug,
  value: value as string,
});

describe('set_custom_field', () => {
  let logged: string[];

  beforeEach(() => {
    logged = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      logged.push(line);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fills an empty field and returns the stored value', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeSetCustomField(
      args('po_number', ' PO-77 '),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'set',
      message: 'Custom field set.',
      record: RECORD,
      field: PO_FIELD,
      value: 'PO-77',
      display_value: 'PO-77',
      undo: 'update_custom_field',
    });
    expect(setCustomFieldOutputSchema.parse(result)).toEqual(result);
    expect(stored.values.get('po_number')).toBe('PO-77');
    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'GET /accounts/current/custom_field_definitions',
      `GET ${CF_CONTAINER_PATH}`,
      `GET ${CF_CONTAINER_PATH}/custom_fields`,
      `POST ${CF_CONTAINER_PATH}/custom_fields`,
    ]);
    expect(auditEvents(logged)).toEqual([
      expect.objectContaining({
        tool: 'set_custom_field',
        tier: 'A',
        phase: 'execute',
        outcome: 'set',
        entity_type: 'container',
        entity_id: CF_CONTAINER_ID,
      }),
    ]);
    expect(logged.join('\n')).not.toMatch(/PO-77/);
  });

  it('works the same for a signed-in user session', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client } = fakeApiClient(stored.routes);

    const result = await executeSetCustomField(
      args('po_number', 'PO-1'),
      client,
      writeContext(client, { credentialType: 'user' }),
    );

    expect(result).toMatchObject({ status: 'set', value: 'PO-1' });
    expect(auditEvents(logged)[0]).toMatchObject({ credential_type: 'user' });
  });

  it('returns already_set and writes nothing when the field has a value', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeSetCustomField(
      args('po_number', 'PO-2'),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'already_set',
      message:
        'The field already has a value, so set_custom_field changed nothing.',
      alternative:
        'To replace the value, show current_value to the user and call update_custom_field.',
      record: RECORD,
      field: PO_FIELD,
      current_value: 'PO-1',
      current_display_value: 'PO-1',
    });
    expect(setCustomFieldOutputSchema.parse(result)).toEqual(result);
    expect(requests.some((r) => r.method !== 'GET')).toBe(false);
    expect(stored.values.get('po_number')).toBe('PO-1');
    expect(auditEvents(logged)[0]).toMatchObject({ outcome: 'already_set' });
  });

  it('says nothing changed when the field already has the same value', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client } = fakeApiClient(stored.routes);

    const result = await executeSetCustomField(
      args('po_number', 'PO-1'),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'already_set',
      message: 'The field already has this value. Nothing was changed.',
      current_value: 'PO-1',
    });
    expect(result).not.toHaveProperty('alternative');
  });

  it('checks an enum value against the options before any write', async () => {
    const stored = storedCustomFields(
      TRACKING_REQUEST_PATH,
      {},
      trackingRequest,
    );
    const { client, requests } = fakeApiClient(stored.routes);
    const target = {
      entity_type: 'tracking_request' as const,
      entity_id: CF_TRACKING_REQUEST_ID,
      api_slug: 'priority',
    };

    const refused = await executeSetCustomField(
      { ...target, value: 'urgent' },
      client,
      writeContext(client),
    );

    expect(refused).toEqual({
      error: 'invalid_value',
      message:
        'The value does not fit the custom field priority, whose data_type enum needs exactly one of allowed_values. Nothing was changed.',
      alternative: 'Ask the user to choose from allowed_values.',
      api_slug: 'priority',
      data_type: 'enum',
      expected: 'exactly one of allowed_values',
      allowed_values: ['low', 'high'],
    });
    expect(setCustomFieldOutputSchema.parse(refused)).toEqual(refused);
    expect(requests.map((r) => r.path)).toEqual([
      '/accounts/current/custom_field_definitions',
      expect.stringMatching(/\/options$/),
    ]);

    const result = await executeSetCustomField(
      { ...target, value: 'high' },
      client,
      writeContext(client),
    );
    expect(result).toMatchObject({
      status: 'set',
      record: {
        entity_type: 'tracking_request',
        label: 'MAEU123456789',
      },
      value: 'high',
    });
    expect(sentValue(requests.find((r) => r.method === 'POST')!)).toBe('high');
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual([
      'invalid_value',
      'set',
    ]);
  });

  it('reaches a field whose api_slug has capital letters', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client } = fakeApiClient({
      ...stored.routes,
      'GET /accounts/current/custom_field_definitions': {
        body: {
          data: [
            {
              id: PO_DEFINITION_ID,
              type: 'custom_field_definition',
              attributes: {
                api_slug: 'PO_Number',
                display_name: 'PO number',
                entity_type: 'Cargo',
                data_type: 'short_text',
                discarded_at: null,
              },
            },
          ],
        },
      },
    });

    const result = await executeSetCustomField(
      args('PO_Number', 'PO-9'),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'set',
      field: { api_slug: 'PO_Number' },
      value: 'PO-9',
    });
    expect(stored.values.get('PO_Number')).toBe('PO-9');
    expect(
      setCustomFieldInputSchema.safeParse(args('po-number', 'x')).success,
    ).toBe(false);
  });

  it('stops when a tracking request holds one value per container', async () => {
    const stored = storedCustomFields(
      TRACKING_REQUEST_PATH,
      {},
      trackingRequest,
    );
    const entry = (value: unknown) => ({
      id: `cf-${String(value)}`,
      type: 'custom_field',
      attributes: { api_slug: 'po_number', value, display_value: value },
    });
    const { client, requests } = fakeApiClient({
      ...stored.routes,
      [`GET ${TRACKING_REQUEST_PATH}/custom_fields`]: {
        body: { data: [entry('PO-A'), entry(null)] },
      },
    });

    const result = await executeSetCustomField(
      {
        entity_type: 'tracking_request',
        entity_id: CF_TRACKING_REQUEST_ID,
        api_slug: 'po_number',
        value: 'PO-C',
      },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      error: 'ambiguous_field',
      message:
        'This tracking request holds 2 values for the custom field po_number, one per container. Nothing was changed.',
      alternative:
        'Show values to the user, and change the field on each container or in the Terminal49 dashboard.',
      api_slug: 'po_number',
      record: {
        entity_type: 'tracking_request',
        entity_id: CF_TRACKING_REQUEST_ID,
        label: 'MAEU123456789',
      },
      values: [
        { value: 'PO-A', display_value: 'PO-A' },
        { value: null, display_value: null },
      ],
    });
    expect(setCustomFieldOutputSchema.parse(result)).toEqual(result);
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
    expect(auditEvents(logged)[0]).toMatchObject({
      outcome: 'ambiguous_field',
    });
  });

  it('stops on a tracking request that already created its shipment', async () => {
    const shipmentId = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
    const stored = storedCustomFields(
      TRACKING_REQUEST_PATH,
      {},
      {
        data: {
          ...trackingRequest.data,
          relationships: {
            tracked_object: { data: { type: 'shipment', id: shipmentId } },
          },
        },
      },
    );
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeSetCustomField(
      {
        entity_type: 'tracking_request',
        entity_id: CF_TRACKING_REQUEST_ID,
        api_slug: 'priority',
        value: 'high',
      },
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      error: 'use_shipment_or_container',
      message: `This tracking request already created shipment ${shipmentId}. A change on the tracking request does not reach that shipment or its containers. Nothing was changed.`,
      alternative: `Change the field on shipment ${shipmentId}.`,
      api_slug: 'priority',
      record: {
        entity_type: 'tracking_request',
        entity_id: CF_TRACKING_REQUEST_ID,
        label: 'MAEU123456789',
      },
      shipment_id: shipmentId,
    });
    expect(setCustomFieldOutputSchema.parse(result)).toEqual(result);
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
    expect(stored.values.size).toBe(0);
    expect(auditEvents(logged)[0]).toMatchObject({
      outcome: 'use_shipment_or_container',
    });
  });

  it('returns unknown_field for a slug the account does not have', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeSetCustomField(
      args('no_such_field', 'x'),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'unknown_field',
      api_slug: 'no_such_field',
    });
    expect(requests).toHaveLength(1);
  });

  it('refuses a shipment field on a container', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeSetCustomField(
      args('priority', 'high'),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'field_not_applicable',
      field_entity_type: 'shipment',
      alternative: 'Set it on the shipment instead.',
    });
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('returns noop when Terminal49 rejects the value with 422', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client } = fakeApiClient({
      ...stored.routes,
      [`POST ${CF_CONTAINER_PATH}/custom_fields`]: { status: 422 },
    });

    const result = await executeSetCustomField(
      args('po_number', 'PO-1'),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'noop',
      record: RECORD,
      field: PO_FIELD,
    });
  });

  it('returns credential_not_supported when Terminal49 refuses an API key', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client, requests } = fakeApiClient({
      ...stored.routes,
      [`GET ${CF_CONTAINER_PATH}/custom_fields`]: { status: 401 },
      'GET /me': {
        body: meBody({ custom_fields: { status: 'requires_user_credential' } }),
      },
    });

    const result = await executeSetCustomField(
      args('po_number', 'PO-1'),
      client,
      writeContext(client),
    );

    expect(result).toEqual(CREDENTIAL_NOT_SUPPORTED);
    expect(setCustomFieldOutputSchema.parse(result)).toEqual(result);
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
    expect(auditEvents(logged)[0]).toMatchObject({
      outcome: 'credential_not_supported',
    });
  });

  it('returns FeatureNotEnabled when the account lacks custom fields', async () => {
    const { client } = fakeApiClient({
      'GET /accounts/current/custom_field_definitions': { status: 401 },
      'GET /me': {
        body: meBody({ custom_fields: { status: 'requires_paid_plan' } }),
      },
    });

    const result = await executeSetCustomField(
      args('po_number', 'PO-1'),
      client,
      writeContext(client),
    );

    expect(result).toEqual(CUSTOM_FIELDS_NOT_ENABLED);
  });

  it('returns rate_limited on a 429', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client } = fakeApiClient({
      ...stored.routes,
      [`POST ${CF_CONTAINER_PATH}/custom_fields`]: {
        status: 429,
        headers: { 'Retry-After': '7' },
      },
    });

    const result = await executeSetCustomField(
      args('po_number', 'PO-1'),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ error: 'rate_limited' });
    expect(auditEvents(logged)[0]).toMatchObject({ outcome: 'rate_limited' });
  });

  it('rethrows a refusal /me does not explain', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client } = fakeApiClient({
      ...stored.routes,
      [`POST ${CF_CONTAINER_PATH}/custom_fields`]: { status: 401 },
      'GET /me': { body: meBody({ custom_fields: { status: 'available' } }) },
    });

    await expect(
      executeSetCustomField(
        args('po_number', 'PO-1'),
        client,
        writeContext(client),
      ),
    ).rejects.toMatchObject({ status: 401 });
    expect(auditEvents(logged)[0]).toMatchObject({ outcome: 'error' });
  });
});
