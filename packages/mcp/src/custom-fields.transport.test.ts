/**
 * Calls set_custom_field and update_custom_field through the MCP client and
 * the HTTP handler. Each call builds a new server, as the stateless gateway
 * does, so a confirmed write proves the token survives between requests.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { callTool } from './test/call-tool.js';
import {
  CF_CONTAINER_ID,
  CF_CONTAINER_PATH,
  storedCustomFields,
} from './test/custom-field-fixtures.js';
import type { FakeRoutes } from './test/fake-api.js';
import {
  meBody,
  TEST_CONFIRMATION_SECRET,
  tokenOf,
} from './test/write-context.js';
import { setCustomFieldOutputSchema } from './tools/set-custom-field.js';
import { updateCustomFieldOutputSchema } from './tools/update-custom-field.js';

vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const CONFIRMING = {
  toolsets: ['operations'] as const,
  confirmationSecret: TEST_CONFIRMATION_SECRET,
};

const target = {
  entity_type: 'container',
  entity_id: CF_CONTAINER_ID,
  api_slug: 'po_number',
};

describe('custom field tools over the MCP client transport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sets, updates and clears a field across separate requests', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const routes: FakeRoutes = {
      'GET /me': { body: meBody() },
      ...stored.routes,
    };

    const set = await callTool(
      'set_custom_field',
      { ...target, value: 'PO-1' },
      routes,
      CONFIRMING,
    );
    expect(set.isError).not.toBe(true);
    expect(set.structuredContent).toMatchObject({
      status: 'set',
      value: 'PO-1',
    });
    expect(
      setCustomFieldOutputSchema.safeParse(set.structuredContent).success,
    ).toBe(true);

    const again = await callTool(
      'set_custom_field',
      { ...target, value: 'PO-2' },
      routes,
      CONFIRMING,
    );
    expect(again.structuredContent).toMatchObject({
      status: 'already_set',
      current_value: 'PO-1',
    });

    const preview = await callTool(
      'update_custom_field',
      { ...target, value: 'PO-2' },
      routes,
      CONFIRMING,
    );
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
      preview: { action: 'overwrite', proposed: { value: 'PO-2' } },
    });
    const updated = await callTool(
      'update_custom_field',
      {
        ...target,
        value: 'PO-2',
        confirmation_token: tokenOf(preview.structuredContent),
      },
      routes,
      CONFIRMING,
    );
    expect(updated.isError).not.toBe(true);
    expect(updated.structuredContent).toMatchObject({
      status: 'updated',
      previous_value: 'PO-1',
      value: 'PO-2',
    });
    expect(
      updateCustomFieldOutputSchema.safeParse(updated.structuredContent)
        .success,
    ).toBe(true);

    const clearPreview = await callTool(
      'update_custom_field',
      { ...target, clear: true },
      routes,
      CONFIRMING,
    );
    const cleared = await callTool(
      'update_custom_field',
      {
        ...target,
        clear: true,
        confirmation_token: tokenOf(clearPreview.structuredContent),
      },
      routes,
      CONFIRMING,
    );
    expect(cleared.structuredContent).toMatchObject({
      status: 'cleared',
      previous_value: 'PO-2',
      undo: 'set_custom_field',
    });
    expect(stored.values.has('po_number')).toBe(false);
  });

  it('returns invalid_value and credential_not_supported as soft results', async () => {
    const stored = storedCustomFields(CF_CONTAINER_PATH);
    const invalid = await callTool(
      'set_custom_field',
      { ...target, value: 12 },
      stored.routes,
      CONFIRMING,
    );
    expect(invalid.isError).not.toBe(true);
    expect(invalid.structuredContent).toMatchObject({
      error: 'invalid_value',
      data_type: 'short_text',
    });

    const refused = await callTool(
      'update_custom_field',
      { ...target, clear: true },
      {
        ...stored.routes,
        [`GET ${CF_CONTAINER_PATH}/custom_fields`]: { status: 401 },
        'GET /me': {
          body: meBody({
            custom_fields: { status: 'requires_user_credential' },
          }),
        },
      },
      CONFIRMING,
    );
    expect(refused.isError).not.toBe(true);
    expect(refused.structuredContent).toMatchObject({
      error: 'credential_not_supported',
    });
  });

  it('rejects value together with clear with a fixed message', async () => {
    const result = await callTool(
      'update_custom_field',
      { ...target, value: 'PO-1', clear: true },
      {},
      CONFIRMING,
    );

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      'Pass exactly one of value or clear: true to update_custom_field.',
    );
  });

  it.each(['set_custom_field', 'update_custom_field'])(
    'names the missing record when %s reads a 404',
    async (name) => {
      const stored = storedCustomFields('/shipments/unused');
      const result = await callTool(
        name,
        { ...target, value: 'PO-1' },
        {
          'GET /me': { body: meBody() },
          'GET /accounts/current/custom_field_definitions':
            stored.routes['GET /accounts/current/custom_field_definitions']!,
        },
        CONFIRMING,
      );

      expect(result.isError).toBe(true);
      expect(result.text).toBe(
        `No container found with id ${CF_CONTAINER_ID}.`,
      );
    },
  );

  it.each(['set_custom_field', 'update_custom_field'])(
    'does not serve %s in read-only mode',
    async (name) => {
      await expect(
        callTool(
          name,
          { ...target, value: 'PO-1' },
          {},
          { ...CONFIRMING, readOnly: true },
        ),
      ).rejects.toThrow(`Tool ${name} not found`);
    },
  );
});
