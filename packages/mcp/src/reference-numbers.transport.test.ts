/**
 * Calls the reference number tools through the MCP client and the
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
import { addReferenceNumbersOutputSchema } from './tools/add-reference-numbers.js';
import { removeReferenceNumbersOutputSchema } from './tools/remove-reference-numbers.js';

vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const CONFIRMING = {
  toolsets: ['reference_numbers'] as const,
  confirmationSecret: TEST_CONFIRMATION_SECRET,
};
describe('reference number tools over the MCP client transport', () => {
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
      'add_reference_numbers',
      { ...target, add: ['PO-2'] },
      routes,
      CONFIRMING,
    );
    expect(added.isError).not.toBe(true);
    expect(added.structuredContent).toMatchObject({
      status: 'added',
      ref_numbers: ['PO-1', 'PO-2'],
    });
    expect(
      addReferenceNumbersOutputSchema.safeParse(added.structuredContent)
        .success,
    ).toBe(true);

    const preview = await callTool(
      'remove_reference_numbers',
      { ...target, remove: ['PO-2'] },
      routes,
      CONFIRMING,
    );
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
    });
    const removed = await callTool(
      'remove_reference_numbers',
      {
        ...target,
        remove: ['PO-2'],
        confirmation_token: tokenOf(preview.structuredContent),
      },
      routes,
      CONFIRMING,
    );

    expect(removed.isError).not.toBe(true);
    expect(removed.structuredContent).toMatchObject({
      status: 'removed',
      ref_numbers: ['PO-1'],
    });
    expect(
      removeReferenceNumbersOutputSchema.safeParse(removed.structuredContent)
        .success,
    ).toBe(true);
    expect(stored.current()).toEqual(['PO-1']);
  });

  it.each([
    ['add_reference_numbers', 'container', 'container', { add: ['PO-1'] }],
    ['add_reference_numbers', 'shipment', 'shipment', { add: ['PO-1'] }],
    [
      'add_reference_numbers',
      'tracking_request',
      'tracking request',
      { add: ['PO-1'] },
    ],
    [
      'remove_reference_numbers',
      'container',
      'container',
      { remove: ['PO-1'] },
    ],
    ['remove_reference_numbers', 'shipment', 'shipment', { remove: ['PO-1'] }],
    [
      'remove_reference_numbers',
      'tracking_request',
      'tracking request',
      { remove: ['PO-1'] },
    ],
  ])(
    'names the missing record when %s reads a 404 for a %s',
    async (name, entityType, label, change) => {
      const result = await callTool(
        name,
        { entity_type: entityType, entity_id: REF_CONTAINER_ID, ...change },
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
