import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createTerminal49McpServer,
  type Terminal49McpServerOptions,
} from './server.js';
import { fakeApiFetch, type FakeRoutes } from './test/fake-api.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

const REQUEST_ID = '6c1f0d52-8a3e-4b9f-9d21-0e5f4a7b8c90';
const VESSEL_ID = '50b58b30-acf9-4f2f-a2d4-7d2b0a1c3e5f';
const PORT_ID = '9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const PREVIOUS_PORT_ID = '2b3c4d5e-6f70-4a81-9b2c-3d4e5f6a7b8c';

const featureNotEnabled = {
  status: 403,
  body: { errors: [{ status: '403', detail: 'Feature not enabled' }] },
};

const me = {
  data: {
    id: 'key-1',
    type: 'api_key',
    attributes: { kind: 'api_key', channel: 'api', name: 'Production key' },
    relationships: { account: { data: { id: 'account-1', type: 'account' } } },
  },
  included: [
    {
      id: 'account-1',
      type: 'account',
      attributes: { company_name: 'Acme Logistics' },
    },
  ],
};

/**
 * Calls one tool through the MCP client and the HTTP handler. The server's
 * SDK client sends its API requests to `routes`.
 */
async function callTool(
  name: string,
  args: Record<string, unknown>,
  routes: FakeRoutes,
  options: Terminal49McpServerOptions = {},
) {
  vi.stubGlobal('fetch', fakeApiFetch(routes).fetch);
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer(
        'fixture-token',
        'https://api.test',
        undefined,
        options,
      ),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client({ name: 'core-reads-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );
  try {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    return { ...result, text };
  } finally {
    await client.close();
    await handler.close();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('core reads over the MCP client transport', () => {
  it('get_tracking_request returns schema-valid structured content', async () => {
    const result = await callTool(
      'get_tracking_request',
      { id: REQUEST_ID },
      {
        [`GET /tracking_requests/${REQUEST_ID}`]: {
          body: {
            data: {
              id: REQUEST_ID,
              type: 'tracking_request',
              attributes: {
                request_number: 'MAEU123456789',
                status: 'failed',
                failed_reason: 'not_found',
              },
            },
          },
        },
      },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      id: REQUEST_ID,
      status: 'failed',
      failed_reason: 'not_found',
      shipment_id: null,
    });
  });

  it('identify_tracking_number turns a 429 into a soft rate_limited result', async () => {
    const result = await callTool(
      'identify_tracking_number',
      { number: 'CAIU2885402' },
      {
        'POST /tracking_requests/infer_number': { status: 429 },
        'GET /search': { body: { data: [] } },
      },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ error: 'rate_limited' });
  });

  it('identify_tracking_number never echoes the API text of a 422', async () => {
    const result = await callTool(
      'identify_tracking_number',
      { number: 'NOT A NUMBER' },
      {
        'POST /tracking_requests/infer_number': {
          status: 422,
          body: { errors: [{ detail: 'private upstream detail' }] },
        },
        'GET /search': { body: { data: [] } },
      },
    );

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      'Terminal49 could not identify this number. Pass one container, Bill of Lading, or booking number.',
    );
  });

  it('get_location returns the input check message as a tool error', async () => {
    const result = await callTool(
      'get_location',
      { kind: 'terminal', id: 'USLAX' },
      {},
    );

    expect(result.isError).toBe(true);
    expect(result.text).toBe('A terminal id must be a Terminal49 UUID.');
  });

  it.each([
    {
      name: 'get_tracking_request',
      args: { id: REQUEST_ID },
      expected: `No tracking request found with id ${REQUEST_ID}.`,
    },
    {
      name: 'get_location',
      args: { kind: 'metro_area', id: 'ZZZZZ' },
      expected: 'No metro area found with id ZZZZZ.',
    },
    {
      name: 'get_vessel',
      args: { id: VESSEL_ID },
      expected: `No vessel found with id ${VESSEL_ID}.`,
    },
  ])('$name names the missing record', async ({ name, args, expected }) => {
    const result = await callTool(name, args, {
      'GET /metro_areas/ZZZZZ': { body: { data: null } },
    });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(expected);
  });

  it('get_vessel explains a gated projection and still returns the vessel', async () => {
    const result = await callTool(
      'get_vessel',
      {
        id: VESSEL_ID,
        eta_to: { port_id: PORT_ID, previous_port_id: PREVIOUS_PORT_ID },
      },
      {
        [`GET /vessels/${VESSEL_ID}`]: {
          body: {
            data: {
              id: VESSEL_ID,
              type: 'vessel',
              attributes: { name: 'MAERSK KENSINGTON' },
            },
          },
        },
        [`GET /vessels/${VESSEL_ID}/future_positions`]: featureNotEnabled,
      },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      name: 'MAERSK KENSINGTON',
      position: null,
      eta: null,
      eta_note: expect.stringContaining('Routing Data'),
    });
  });

  it('get_vessel returns FeatureNotEnabled with its alternative as text', async () => {
    const result = await callTool(
      'get_vessel',
      { id: VESSEL_ID },
      { [`GET /vessels/${VESSEL_ID}`]: featureNotEnabled },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      error: 'FeatureNotEnabled',
    });
    expect(result.text).toContain('Alternative: Use get_shipment_details');
  });

  it('list_custom_field_definitions returns schema-valid definitions', async () => {
    const result = await callTool(
      'list_custom_field_definitions',
      {},
      {
        'GET /accounts/current/custom_field_definitions': {
          body: {
            data: [
              {
                id: 'definition-1',
                type: 'custom_field_definition',
                attributes: {
                  api_slug: 'po_number',
                  display_name: 'PO number',
                  entity_type: 'Cargo',
                  data_type: 'short_text',
                },
              },
            ],
          },
        },
      },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      total: 1,
      definitions: [{ api_slug: 'po_number', entity_type: 'container' }],
    });
  });

  it('whoami reports a read-only session as having no write tools', async () => {
    const result = await callTool(
      'whoami',
      {},
      { 'GET /me': { body: me } },
      { readOnly: true, credentialType: 'user', toolsets: ['core'] },
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      credential_type: 'user',
      enabled_toolsets: ['core'],
      write_tools_available: false,
    });
  });

  it('whoami reports write tools when the session serves track_container', async () => {
    const result = await callTool('whoami', {}, { 'GET /me': { body: me } });

    expect(result.structuredContent).toMatchObject({
      credential_type: 'api_key',
      enabled_toolsets: ['core', 'documents'],
      write_tools_available: true,
    });
  });
});
