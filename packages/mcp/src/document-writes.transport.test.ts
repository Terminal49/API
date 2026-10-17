/**
 * Calls the document fix tools and the webhook reads through the MCP client
 * and the HTTP handler. Each call builds a new server, as the stateless
 * gateway does, so a confirmed write proves the token survives between
 * requests.
 */
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';
import { callTool } from './test/call-tool.js';
import {
  DOCUMENT_ID,
  documentBody,
  documentTypesRoute,
} from './test/document-fixtures.js';
import type { FakeRoutes } from './test/fake-api.js';
import {
  NOTIFICATION_ID,
  notificationListBody,
  WEBHOOK_ID,
  WEBHOOK_SENTINELS,
  webhookListBody,
  webhookSummary,
} from './test/webhook-fixtures.js';
import {
  meBody,
  TEST_CONFIRMATION_SECRET,
  tokenOf,
} from './test/write-context.js';
import { listWebhookNotificationsOutputSchema } from './tools/list-webhook-notifications.js';
import { listWebhooksOutputSchema } from './tools/list-webhooks.js';
import { DEFAULT_TOOLSETS, type Toolset } from './tools/registry.js';
import { relinkDocumentOutputSchema } from './tools/relink-document.js';
import { updateDocumentOutputSchema } from './tools/update-document.js';

vi.mock('@sentry/node', () => ({
  addBreadcrumb: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const DOCUMENTS_WRITE = {
  toolsets: ['documents_write'] as const,
  confirmationSecret: TEST_CONFIRMATION_SECRET,
};

const DEVELOPER = { toolsets: ['developer'] as const };

const DOCUMENT_PATH = `/documents/${DOCUMENT_ID}`;

async function listToolNames(toolsets: readonly Toolset[], readOnly = false) {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer(
        'fixture-token',
        'https://api.test',
        undefined,
        {
          toolsets,
          readOnly,
        },
      ),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client({ name: 'transport-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  try {
    return (await client.listTools()).tools.map((tool) => tool.name);
  } finally {
    await client.close();
    await handler.close();
  }
}

describe('document fix tools over the MCP client transport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('previews and sets a document type across separate requests', async () => {
    let documentType = 'commercial_invoice';
    let documentTypeSource = 'classifier';
    const routes: FakeRoutes = {
      'GET /me': { body: meBody() },
      'GET /documents/types': documentTypesRoute,
      [`GET ${DOCUMENT_PATH}`]: () => ({
        body: documentBody({ documentType, documentTypeSource }),
      }),
      [`PATCH ${DOCUMENT_PATH}`]: () => {
        documentType = 'delivery_order';
        documentTypeSource = 'customer';
        return {
          body: documentBody({ documentType, documentTypeSource }),
        };
      },
    };
    const args = {
      id: DOCUMENT_ID,
      action: 'set_type',
      document_type: 'delivery_order',
    };

    const preview = await callTool(
      'update_document',
      args,
      routes,
      DOCUMENTS_WRITE,
    );
    expect(preview.isError).not.toBe(true);
    expect(preview.structuredContent).toMatchObject({
      status: 'confirmation_required',
      preview: { proposed: { document_type: 'delivery_order' } },
    });
    expect(
      updateDocumentOutputSchema.safeParse(preview.structuredContent).success,
    ).toBe(true);
    expect(documentType).toBe('commercial_invoice');

    const done = await callTool(
      'update_document',
      { ...args, confirmation_token: tokenOf(preview.structuredContent) },
      routes,
      DOCUMENTS_WRITE,
    );
    expect(done.isError).not.toBe(true);
    expect(done.structuredContent).toMatchObject({
      status: 'updated',
      previous_document_type: 'commercial_invoice',
      document: {
        document_type: 'delivery_order',
        document_type_source: 'customer',
      },
    });
    expect(done.structuredContent).not.toHaveProperty('undo');

    const again = await callTool(
      'update_document',
      args,
      routes,
      DOCUMENTS_WRITE,
    );
    expect(again.structuredContent).toMatchObject({ status: 'unchanged' });
  });

  it('returns unknown_document_type as a soft result', async () => {
    const result = await callTool(
      'update_document',
      { id: DOCUMENT_ID, action: 'set_type', document_type: 'packing_slip' },
      {
        'GET /me': { body: meBody() },
        'GET /documents/types': documentTypesRoute,
        [`GET ${DOCUMENT_PATH}`]: { body: documentBody() },
      },
      DOCUMENTS_WRITE,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: 'unknown_document_type',
      allowed_types: expect.arrayContaining([
        { code: 'delivery_order', label: 'Delivery Order' },
      ]),
    });
  });

  it('returns the fixed input error for set_type without document_type', async () => {
    const result = await callTool(
      'update_document',
      { id: DOCUMENT_ID, action: 'set_type' },
      {},
      DOCUMENTS_WRITE,
    );

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      'set_type needs document_type. Nothing was changed.',
    );
  });

  it('relinks a document in one call', async () => {
    const result = await callTool(
      'relink_document',
      { id: DOCUMENT_ID },
      {
        'GET /me': { body: meBody() },
        [`GET ${DOCUMENT_PATH}`]: { body: documentBody() },
        [`POST ${DOCUMENT_PATH}/relink`]: {
          status: 202,
          body: { status: 'accepted' },
        },
      },
      DOCUMENTS_WRITE,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ status: 'accepted' });
    expect(
      relinkDocumentOutputSchema.safeParse(result.structuredContent).success,
    ).toBe(true);
  });

  it.each(['relink_document', 'update_document'])(
    'names the missing document when %s gets a 404',
    async (name) => {
      const result = await callTool(
        name,
        {
          id: DOCUMENT_ID,
          ...(name === 'update_document' ? { action: 'reclassify' } : {}),
        },
        { 'GET /me': { body: meBody() } },
        DOCUMENTS_WRITE,
      );

      expect(result.isError).toBe(true);
      expect(result.text).toBe(`No document found with id ${DOCUMENT_ID}.`);
    },
  );
});

describe('webhook reads over the MCP client transport', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists webhooks with no secret, header value or URL key in any content block', async () => {
    const result = await callTool(
      'list_webhooks',
      {},
      { 'GET /webhooks': { body: webhookListBody } },
      DEVELOPER,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      webhooks: [webhookSummary(), expect.anything()],
    });
    expect(
      listWebhooksOutputSchema.safeParse(result.structuredContent).success,
    ).toBe(true);
    const everything = JSON.stringify(result);
    for (const sentinel of WEBHOOK_SENTINELS) {
      expect(everything).not.toContain(sentinel);
    }
  });

  it('lists notifications with no secret from the included webhook', async () => {
    const result = await callTool(
      'list_webhook_notifications',
      {},
      { 'GET /webhook_notifications': { body: notificationListBody } },
      DEVELOPER,
    );

    expect(result.isError).not.toBe(true);
    expect(
      listWebhookNotificationsOutputSchema.safeParse(result.structuredContent)
        .success,
    ).toBe(true);
    const everything = JSON.stringify(result);
    for (const sentinel of WEBHOOK_SENTINELS) {
      expect(everything).not.toContain(sentinel);
    }
  });

  it.each([
    [
      'list_webhooks',
      { webhook_id: WEBHOOK_ID },
      `No webhook found with id ${WEBHOOK_ID}.`,
    ],
    [
      'list_webhook_notifications',
      { notification_id: NOTIFICATION_ID },
      `No webhook notification found with id ${NOTIFICATION_ID}.`,
    ],
  ])(
    'names the missing record when %s gets a 404',
    async (name, args, text) => {
      const result = await callTool(name, args, {}, DEVELOPER);

      expect(result.isError).toBe(true);
      expect(result.text).toBe(text);
    },
  );
});

describe('document fix and webhook tool listing', () => {
  it('lists the document fixes and leaves the webhook reads out of the default listing', async () => {
    const names = await listToolNames(DEFAULT_TOOLSETS);

    expect(names).toEqual(
      expect.arrayContaining(['relink_document', 'update_document']),
    );
    expect(names).not.toContain('list_webhooks');
    expect(names).not.toContain('list_webhook_notifications');
  });

  it('keeps the webhook reads and drops the document fixes in read-only mode', async () => {
    const names = await listToolNames(['documents_write', 'developer'], true);

    expect(names).toEqual(['list_webhooks', 'list_webhook_notifications']);
  });

  it('lists the document fixes when documents_write is enabled', async () => {
    expect(await listToolNames(['documents_write'])).toEqual([
      'relink_document',
      'update_document',
    ]);
  });
});
