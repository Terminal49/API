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
  customFieldDefinitions,
  PRIORITY_DEFINITION_ID,
  sentValue,
  storedCustomFields,
} from '../test/custom-field-fixtures.js';
import { fakeApiClient } from '../test/fake-api.js';
import {
  auditEvents,
  meBody,
  tokenOf,
  writeContext,
} from '../test/write-context.js';
import { CREDENTIAL_NOT_SUPPORTED } from './custom-field-values.js';
import { executeSetCustomField } from './set-custom-field.js';
import { ToolInputError } from './soft-results.js';
import {
  executeUpdateCustomField,
  updateCustomFieldOutputSchema,
} from './update-custom-field.js';

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

const target = {
  entity_type: 'container' as const,
  entity_id: CF_CONTAINER_ID,
  api_slug: 'po_number',
};

const overwrite = (value: string, confirmation_token?: string) => ({
  ...target,
  value,
  ...(confirmation_token ? { confirmation_token } : {}),
});

const clear = (confirmation_token?: string) => ({
  ...target,
  clear: true,
  ...(confirmation_token ? { confirmation_token } : {}),
});

describe('update_custom_field', () => {
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

  it('previews an overwrite with the old and new values without writing', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeUpdateCustomField(
      overwrite('PO-2'),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: {
          record: RECORD,
          field: PO_FIELD,
          value: 'PO-1',
          display_value: 'PO-1',
        },
        proposed: { value: 'PO-2' },
        action: 'overwrite',
        reach: expect.stringMatching(/keeps no copy/),
      },
      confirmation_token: expect.any(String),
      expires_at: expect.any(String),
    });
    expect(updateCustomFieldOutputSchema.parse(result)).toEqual(result);
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
    expect(stored.values.get('po_number')).toBe('PO-1');
  });

  it('overwrites the value with the token and returns the previous value', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client, requests } = fakeApiClient(stored.routes);
    const preview = await executeUpdateCustomField(
      overwrite('PO-2'),
      client,
      writeContext(client),
    );

    const result = await executeUpdateCustomField(
      overwrite('PO-2', tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'updated',
      message: 'Custom field updated.',
      record: RECORD,
      field: PO_FIELD,
      previous_value: 'PO-1',
      value: 'PO-2',
      display_value: 'PO-2',
      undo: 'update_custom_field',
    });
    expect(updateCustomFieldOutputSchema.parse(result)).toEqual(result);
    const patch = requests.find((r) => r.method === 'PATCH');
    expect(patch?.path).toBe(`${CF_CONTAINER_PATH}/custom_fields/po_number`);
    expect(sentValue(patch!)).toBe('PO-2');
    expect(stored.values.get('po_number')).toBe('PO-2');
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual([
      'confirmation_required',
      'updated',
    ]);
    expect(logged.join('\n')).not.toMatch(/PO-\d|t49ct1\./);
  });

  it('previews and clears a value with DELETE', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client, requests } = fakeApiClient(stored.routes);
    const preview = await executeUpdateCustomField(
      clear(),
      client,
      writeContext(client),
    );
    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: {
        current: { value: 'PO-1' },
        proposed: { value: null },
        action: 'clear',
        reach: expect.stringMatching(/stop showing the current value/),
      },
    });

    const result = await executeUpdateCustomField(
      clear(tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'cleared',
      message: 'Custom field cleared.',
      record: RECORD,
      field: PO_FIELD,
      previous_value: 'PO-1',
      value: null,
      display_value: null,
      undo: 'set_custom_field',
    });
    expect(requests.at(-1)).toMatchObject({
      method: 'DELETE',
      path: `${CF_CONTAINER_PATH}/custom_fields/po_number`,
    });
    expect(stored.values.has('po_number')).toBe(false);
  });

  it('refuses a clear token replayed after set_custom_field restored the value', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client, requests } = fakeApiClient(stored.routes);
    const context = writeContext(client);
    const preview = await executeUpdateCustomField(clear(), client, context);
    await executeUpdateCustomField(clear(tokenOf(preview)), client, context);
    await executeSetCustomField({ ...target, value: 'PO-1' }, client, context);

    const replay = await executeUpdateCustomField(
      clear(tokenOf(preview)),
      client,
      context,
    );

    expect(replay).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'used',
    });
    expect(stored.values.get('po_number')).toBeDefined();
    expect(
      requests.filter((request) => request.method === 'DELETE'),
    ).toHaveLength(1);
  });

  it('binds the token to the value it previewed', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client, requests } = fakeApiClient(stored.routes);
    const preview = await executeUpdateCustomField(
      clear(),
      client,
      writeContext(client),
    );
    // Someone changes the value between the preview and the confirmation.
    stored.values.set('po_number', 'PO-9');

    const result = await executeUpdateCustomField(
      clear(tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      status: 'stale_preview',
      preview: { current: { value: 'PO-9' }, action: 'clear' },
      confirmation_token: expect.any(String),
    });
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
    expect(stored.values.get('po_number')).toBe('PO-9');
  });

  it('refuses a token issued for another value', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client, requests } = fakeApiClient(stored.routes);
    const preview = await executeUpdateCustomField(
      overwrite('PO-2'),
      client,
      writeContext(client),
    );

    const result = await executeUpdateCustomField(
      overwrite('PO-3', tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'invalid_confirmation',
      reason: 'mismatch',
    });
    expect(requests.some((r) => r.method === 'PATCH')).toBe(false);
  });

  it('returns not_set without a token when the field is empty', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const { client } = fakeApiClient(stored.routes);

    const replacing = await executeUpdateCustomField(
      overwrite('PO-2'),
      client,
      writeContext(client),
    );
    const clearing = await executeUpdateCustomField(
      clear(),
      client,
      writeContext(client),
    );

    expect(replacing).toEqual({
      status: 'not_set',
      message:
        'The field has no value on this record, so there is nothing to replace. Nothing was changed.',
      alternative: 'Call set_custom_field to fill it.',
      record: RECORD,
      field: PO_FIELD,
    });
    expect(clearing).toMatchObject({
      status: 'not_set',
      message: 'The field has no value on this record. Nothing was changed.',
    });
    expect(clearing).not.toHaveProperty('confirmation_token');
  });

  it('returns unchanged when the field already has the new value', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client } = fakeApiClient(stored.routes);

    const result = await executeUpdateCustomField(
      overwrite('PO-1'),
      client,
      writeContext(client),
    );

    expect(result).toEqual({
      status: 'unchanged',
      message: 'The field already has this value. Nothing was changed.',
      record: RECORD,
      field: PO_FIELD,
      value: 'PO-1',
      display_value: 'PO-1',
    });
  });

  it('checks the new value before it reads the record', async () => {
    const path = '/shipments/2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
    const stored = storedCustomFields(path, { priority: 'low' });
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeUpdateCustomField(
      {
        entity_type: 'shipment',
        entity_id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
        api_slug: 'priority',
        value: 'urgent',
      },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'invalid_value',
      allowed_values: ['low', 'high'],
    });
    expect(requests.map((r) => r.path)).not.toContain(path);
    expect(auditEvents(logged)[0]).toMatchObject({
      phase: 'preview',
      outcome: 'invalid_value',
    });
  });

  it('clears an enum field without loading its options', async () => {
    const id = '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e';
    const path = `/shipments/${id}`;
    const stored = storedCustomFields(
      path,
      { priority: 'low' },
      {
        data: {
          id,
          type: 'shipment',
          attributes: { bill_of_lading_number: 'MAEU123', ref_numbers: [] },
        },
      },
    );
    const { client, requests } = fakeApiClient({
      ...stored.routes,
      [`GET /custom_field_definitions/${PRIORITY_DEFINITION_ID}/options`]: {
        status: 500,
      },
    });

    const preview = await executeUpdateCustomField(
      {
        entity_type: 'shipment',
        entity_id: id,
        api_slug: 'priority',
        clear: true,
      },
      client,
      writeContext(client),
    );

    expect(preview).toMatchObject({
      status: 'confirmation_required',
      preview: { current: { value: 'low' }, action: 'clear' },
    });
    expect(requests.map((r) => r.path)).not.toContain(
      `/custom_field_definitions/${PRIORITY_DEFINITION_ID}/options`,
    );
  });

  it('refuses to clear a field whose data_type set_custom_field cannot write', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { linked: 'abc' });
    const { client, requests } = fakeApiClient({
      ...stored.routes,
      'GET /accounts/current/custom_field_definitions': {
        body: {
          data: [
            ...customFieldDefinitions.data,
            {
              id: '9a3f4e5d-6c7b-48a9-9cad-9e8f7a6b5c4d',
              type: 'custom_field_definition',
              attributes: {
                api_slug: 'linked',
                display_name: 'Linked record',
                entity_type: 'Cargo',
                data_type: 'reference',
                discarded_at: null,
              },
            },
          ],
        },
      },
      [`DELETE ${CF_CONTAINER_PATH}/custom_fields/linked`]: { status: 204 },
    });

    const result = await executeUpdateCustomField(
      { ...target, api_slug: 'linked', clear: true },
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({
      error: 'unsupported_field',
      api_slug: 'linked',
      data_type: 'reference',
    });
    expect(result).not.toHaveProperty('confirmation_token');
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
    expect(stored.values.get('linked')).toBe('abc');
  });

  it('treats a 404 on the DELETE as not_set', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client } = fakeApiClient({
      ...stored.routes,
      [`DELETE ${CF_CONTAINER_PATH}/custom_fields/po_number`]: { status: 404 },
    });
    const preview = await executeUpdateCustomField(
      clear(),
      client,
      writeContext(client),
    );

    const result = await executeUpdateCustomField(
      clear(tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ status: 'not_set' });
  });

  it('issues no token when a tracking request holds one value per container', async () => {
    const path = `/tracking_requests/${CF_TRACKING_REQUEST_ID}`;
    const entry = (value: string) => ({
      id: `cf-${value}`,
      type: 'custom_field',
      attributes: { api_slug: 'po_number', value, display_value: value },
    });
    const stored = storedCustomFields(
      path,
      {},
      {
        data: {
          id: CF_TRACKING_REQUEST_ID,
          type: 'tracking_request',
          attributes: { request_number: 'MAEU123456789', ref_numbers: [] },
        },
      },
    );
    const { client, requests } = fakeApiClient({
      ...stored.routes,
      [`GET ${path}/custom_fields`]: {
        body: { data: [entry('PO-A'), entry('PO-B')] },
      },
    });

    for (const args of [{ value: 'PO-C' }, { clear: true }]) {
      const result = await executeUpdateCustomField(
        {
          entity_type: 'tracking_request',
          entity_id: CF_TRACKING_REQUEST_ID,
          api_slug: 'po_number',
          ...args,
        },
        client,
        writeContext(client),
      );

      expect(result).toMatchObject({
        error: 'ambiguous_field',
        record: { entity_type: 'tracking_request', label: 'MAEU123456789' },
        values: [
          { value: 'PO-A', display_value: 'PO-A' },
          { value: 'PO-B', display_value: 'PO-B' },
        ],
      });
      expect(result).not.toHaveProperty('confirmation_token');
      expect(updateCustomFieldOutputSchema.parse(result)).toEqual(result);
    }
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
    expect(auditEvents(logged).map((event) => event.outcome)).toEqual([
      'ambiguous_field',
      'ambiguous_field',
    ]);
  });

  it('issues no token on a tracking request that already created its shipment', async () => {
    const path = `/tracking_requests/${CF_TRACKING_REQUEST_ID}`;
    const shipmentId = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
    const stored = storedCustomFields(
      path,
      { po_number: 'PO-A' },
      {
        data: {
          id: CF_TRACKING_REQUEST_ID,
          type: 'tracking_request',
          attributes: { request_number: 'MAEU123456789', ref_numbers: [] },
          relationships: {
            tracked_object: { data: { type: 'shipment', id: shipmentId } },
          },
        },
      },
    );
    const { client, requests } = fakeApiClient(stored.routes);

    for (const args of [{ value: 'PO-C' }, { clear: true }]) {
      const result = await executeUpdateCustomField(
        {
          entity_type: 'tracking_request',
          entity_id: CF_TRACKING_REQUEST_ID,
          api_slug: 'po_number',
          ...args,
        },
        client,
        writeContext(client),
      );

      expect(result).toEqual({
        error: 'use_shipment_or_container',
        message: `This tracking request already created shipment ${shipmentId}. A change on the tracking request does not reach that shipment or its containers. Nothing was changed.`,
        alternative: `Change the field on each container of shipment ${shipmentId}.`,
        api_slug: 'po_number',
        record: {
          entity_type: 'tracking_request',
          entity_id: CF_TRACKING_REQUEST_ID,
          label: 'MAEU123456789',
        },
        shipment_id: shipmentId,
      });
      expect(updateCustomFieldOutputSchema.parse(result)).toEqual(result);
    }
    expect(requests.every((r) => r.method === 'GET')).toBe(true);
    expect(stored.values.get('po_number')).toBe('PO-A');
  });

  it('returns noop when Terminal49 rejects the new value with 422', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client } = fakeApiClient({
      ...stored.routes,
      [`PATCH ${CF_CONTAINER_PATH}/custom_fields/po_number`]: { status: 422 },
    });
    const preview = await executeUpdateCustomField(
      overwrite('PO-2'),
      client,
      writeContext(client),
    );

    const result = await executeUpdateCustomField(
      overwrite('PO-2', tokenOf(preview)),
      client,
      writeContext(client),
    );

    expect(result).toMatchObject({ status: 'noop', record: RECORD });
  });

  it('accepts the same token again after Terminal49 rejects the value with 422', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const patchRoute = `PATCH ${CF_CONTAINER_PATH}/custom_fields/po_number`;
    const save = stored.routes[patchRoute];
    let reject = true;
    const { client } = fakeApiClient({
      ...stored.routes,
      [patchRoute]: (request) => {
        if (reject) {
          reject = false;
          return { status: 422 };
        }
        return typeof save === 'function' ? save(request) : save;
      },
    });
    const context = writeContext(client);
    const token = tokenOf(
      await executeUpdateCustomField(overwrite('PO-2'), client, context),
    );

    const first = await executeUpdateCustomField(
      overwrite('PO-2', token),
      client,
      context,
    );
    const retry = await executeUpdateCustomField(
      overwrite('PO-2', token),
      client,
      context,
    );

    expect(first).toMatchObject({ status: 'noop' });
    expect(retry).toMatchObject({ status: 'updated', value: 'PO-2' });
    expect(stored.values.get('po_number')).toBe('PO-2');
  });

  it('returns credential_not_supported when Terminal49 refuses an API key', async () => {
    const { client, requests } = fakeApiClient({
      'GET /accounts/current/custom_field_definitions': { status: 401 },
      'GET /me': {
        body: meBody({ custom_fields: { status: 'requires_user_credential' } }),
      },
    });

    const result = await executeUpdateCustomField(
      clear(),
      client,
      writeContext(client),
    );

    expect(result).toEqual(CREDENTIAL_NOT_SUPPORTED);
    expect(updateCustomFieldOutputSchema.parse(result)).toEqual(result);
    expect(requests.map((r) => r.path)).toEqual([
      '/accounts/current/custom_field_definitions',
      '/me',
    ]);
    expect(auditEvents(logged)[0]).toMatchObject({
      outcome: 'credential_not_supported',
    });
  });

  it('confirms a change for a signed-in user session', async () => {
    const userMe = meBody();
    userMe.data = {
      ...userMe.data,
      id: 'user-1',
      type: 'user',
      attributes: { ...userMe.data.attributes, kind: 'user', channel: 'mcp' },
    };
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client } = fakeApiClient({
      ...stored.routes,
      'GET /me': { body: userMe },
    });
    const context = () => writeContext(client, { credentialType: 'user' });
    const preview = await executeUpdateCustomField(
      overwrite('PO-2'),
      client,
      context(),
    );

    const result = await executeUpdateCustomField(
      overwrite('PO-2', tokenOf(preview)),
      client,
      context(),
    );

    expect(result).toMatchObject({ status: 'updated', value: 'PO-2' });
  });

  it('refuses a tier C write when the server has no confirmation secret', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH, { po_number: 'PO-1' });
    const { client, requests } = fakeApiClient(stored.routes);

    const result = await executeUpdateCustomField(
      clear(),
      client,
      writeContext(client, { confirmationSecret: undefined }),
    );

    expect(result).toMatchObject({ error: 'not_permitted' });
    expect(requests).toEqual([]);
  });

  it.each([
    [{ ...target }],
    [{ ...target, value: 'PO-2', clear: true }],
    [{ ...target, clear: false }],
  ])('needs exactly one of value or clear: %j', async (input) => {
    const { client, requests } = fakeApiClient({});

    await expect(
      executeUpdateCustomField(input, client, writeContext(client)),
    ).rejects.toThrow(
      new ToolInputError(
        'Pass exactly one of value or clear: true to update_custom_field.',
      ),
    );
    expect(requests).toEqual([]);
  });
});
