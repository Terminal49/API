/**
 * Calls update_record through the MCP client and the
 * HTTP handler. Each call builds a new server, as the stateless gateway does,
 * so a confirmed write proves the token survives between requests.
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
import type { FakeRoutes } from './test/fake-api.js';
import { REF_CONTAINER_ID, storedRefNumbers } from './test/reference-record.js';
import {
  meBody,
  TEST_CONFIRMATION_SECRET,
  tokenOf,
} from './test/write-context.js';
import { updateRecordOutputSchema } from './tools/update-record.js';

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
describe('update_record over the MCP client transport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('adds a reference number, then removes it across separate requests', async () => {
    const stored = storedRefNumbers(['PO-1']);
    const routes: FakeRoutes = {
      'GET /me': { body: meBody() },
      [`GET /containers/${REF_CONTAINER_ID}`]: stored.get,
      [`PATCH /containers/${REF_CONTAINER_ID}`]: stored.patch,
    };
    const target = { entity_type: 'container', entity_id: REF_CONTAINER_ID };

    const added = await callTool(
      'update_record',
      { ...target, ref_numbers: { add: ['PO-2'] } },
      routes,
      CONFIRMING,
    );
    expect(added.isError).not.toBe(true);
    expect(added.structuredContent).toMatchObject({
      status: 'updated',
      current: { ref_numbers: ['PO-1', 'PO-2'] },
    });
    expect(
      updateRecordOutputSchema.safeParse(added.structuredContent).success,
    ).toBe(true);

    const preview = await callTool(
      'update_record',
      { ...target, ref_numbers: { remove: ['PO-2'] } },
      routes,
      CONFIRMING,
    );
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
    });
    const removed = await callTool(
      'update_record',
      {
        ...target,
        ref_numbers: { remove: ['PO-2'] },
        confirmation_token: tokenOf(preview.structuredContent),
      },
      routes,
      CONFIRMING,
    );

    expect(removed.isError).not.toBe(true);
    expect(removed.structuredContent).toMatchObject({
      status: 'updated',
      current: { ref_numbers: ['PO-1'] },
    });
    expect(
      updateRecordOutputSchema.safeParse(removed.structuredContent).success,
    ).toBe(true);
    expect(stored.current()).toEqual(['PO-1']);
  });

  it.each([
    ['container', 'container'],
    ['shipment', 'shipment'],
    ['tracking_request', 'tracking request'],
  ])(
    'names the missing record when update_record reads a 404 for a %s',
    async (entityType, label) => {
      const result = await callTool(
        'update_record',
        {
          entity_type: entityType,
          entity_id: REF_CONTAINER_ID,
          ref_numbers: { add: ['PO-1'] },
        },
        { 'GET /me': { body: meBody() } },
        CONFIRMING,
      );

      expect(result.isError).toBe(true);
      expect(result.text).toBe(
        `No ${label} found with id ${REF_CONTAINER_ID}.`,
      );
    },
  );
});
