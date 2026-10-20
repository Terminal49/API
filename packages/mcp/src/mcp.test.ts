import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  buildListContract,
  createTerminal49McpServer,
  TERMINAL49_SERVER_INSTRUCTIONS,
} from './server.js';
import { defaultTools, TOOL_REGISTRY } from './tools/registry.js';
import { TRADE_INTEL_TOOL_NAMES } from './tools/trade-intel.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

// Stubbed Terminal49Client so server tools can be exercised end-to-end without
// hitting the live API. Tests configure these mocks per-case. `vi.hoisted`
// is required because vi.mock factories are hoisted above normal declarations.
const {
  me,
  search,
  shippingLinesList,
  containersList,
  shipmentsList,
  containersSummary,
  tradeIntel,
} = vi.hoisted(() => ({
  me: vi.fn(),
  search: vi.fn(),
  shippingLinesList: vi.fn(),
  containersList: vi.fn(),
  containersSummary: vi.fn(),
  shipmentsList: vi.fn(),
  tradeIntel: {
    meta: vi.fn(),
    searchCompanies: vi.fn(),
    companyProfile: vi.fn(),
    searchCommodities: vi.fn(),
    topImporters: vi.fn(),
    trends: vi.fn(),
    breakdown: vi.fn(),
  },
}));

vi.mock('@terminal49/sdk', () => ({
  Terminal49Client: class Terminal49Client {
    me = me;
    search = search;
    shippingLines = { list: shippingLinesList };
    containers = { list: containersList, summary: containersSummary };
    shipments = { list: shipmentsList };
    tradeIntel = tradeIntel;
  },
  FeatureNotEnabledError: class FeatureNotEnabledError extends Error {
    name = 'FeatureNotEnabledError';
    status = 403;
  },
  NotFoundError: class NotFoundError extends Error {},
}));

beforeEach(() => {
  search.mockReset();
  shippingLinesList.mockReset();
  containersList.mockReset();
  containersSummary.mockReset();
  shipmentsList.mockReset();
  for (const fn of Object.values(tradeIntel)) fn.mockReset();
});

function _hasResponseContract(schema: unknown): boolean {
  const typedSchema = schema as {
    _def?: {
      typeName?: string;
      type?: string;
      shape?: unknown;
      properties?: unknown;
      options?: unknown;
      innerType?: unknown;
      schema?: unknown;
    };
    def?: {
      typeName?: string;
      shape?: unknown;
      properties?: unknown;
      options?: unknown;
      innerType?: unknown;
      schema?: unknown;
    };
    properties?: unknown;
    typeName?: string;
    type?: string;
  };
  const def = typedSchema._def ?? typedSchema.def;
  if (!typedSchema || !def) {
    return false;
  }

  const type = def.typeName ?? (def as { type?: string }).type;

  switch (type) {
    case 'ZodObject':
    case 'object': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      return Boolean(
        (shape &&
          typeof shape === 'object' &&
          Object.hasOwn(shape as object, '_response_contract')) ||
        (def.properties &&
          typeof def.properties === 'object' &&
          Object.hasOwn(def.properties as object, '_response_contract')),
      );
    }
    case 'ZodUnion':
    case 'union':
      return (
        Array.isArray(def.options) &&
        (def.options as unknown[]).some((option) =>
          _hasResponseContract(option),
        )
      );
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'optional':
    case 'nullable':
    case 'default':
    case 'catch':
      return _hasResponseContract((def as { innerType?: unknown }).innerType);
    case 'ZodEffects':
    case 'ZodTransform':
    case 'effects':
    case 'transform':
      return _hasResponseContract((def as { schema?: unknown }).schema);
    default:
      return false;
  }
}

function _hasDisplayHintsInResponseContract(schema: unknown): boolean {
  const typedSchema = schema as {
    _def?: {
      typeName?: string;
      type?: string;
      shape?: unknown;
      properties?: unknown;
      options?: unknown;
      innerType?: unknown;
      schema?: unknown;
    };
    def?: {
      typeName?: string;
      shape?: unknown;
      properties?: unknown;
      options?: unknown;
      innerType?: unknown;
      schema?: unknown;
    };
  };
  const def = typedSchema._def ?? typedSchema.def;
  if (!typedSchema || !def) {
    return false;
  }

  const type = def.typeName ?? (def as { type?: string }).type;

  switch (type) {
    case 'ZodObject':
    case 'object': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      const shapeRecord =
        shape && typeof shape === 'object'
          ? (shape as Record<string, unknown>)
          : null;
      if (shapeRecord && Object.hasOwn(shapeRecord, '_response_contract')) {
        return _schemaHasDisplay(shapeRecord._response_contract);
      }

      const properties =
        def.properties && typeof def.properties === 'object'
          ? (def.properties as Record<string, unknown>)
          : null;
      if (properties && Object.hasOwn(properties, '_response_contract')) {
        return _schemaHasDisplay(properties._response_contract);
      }

      return false;
    }
    case 'ZodUnion':
    case 'union':
      return (
        Array.isArray(def.options) &&
        (def.options as unknown[]).some((option) =>
          _hasDisplayHintsInResponseContract(option),
        )
      );
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'optional':
    case 'nullable':
    case 'default':
    case 'catch':
      return _hasDisplayHintsInResponseContract(
        (def as { innerType?: unknown }).innerType,
      );
    case 'ZodEffects':
    case 'ZodTransform':
    case 'effects':
    case 'transform':
      return _hasDisplayHintsInResponseContract(
        (def as { schema?: unknown }).schema,
      );
    default:
      return false;
  }
}

function _schemaHasDisplay(schema: unknown): boolean {
  const typedSchema = schema as {
    _def?: {
      typeName?: string;
      type?: string;
      shape?: unknown;
      properties?: unknown;
      options?: unknown;
      innerType?: unknown;
      schema?: unknown;
    };
    def?: {
      typeName?: string;
      shape?: unknown;
      properties?: unknown;
      options?: unknown;
      innerType?: unknown;
      schema?: unknown;
    };
  };
  const def = typedSchema._def ?? typedSchema.def;
  if (!typedSchema || !def) {
    return false;
  }

  const type = def.typeName ?? (def as { type?: string }).type;
  switch (type) {
    case 'ZodObject':
    case 'object': {
      const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
      if (
        shape &&
        typeof shape === 'object' &&
        Object.hasOwn(shape as object, 'display')
      ) {
        return true;
      }

      return Boolean(
        def.properties &&
        typeof def.properties === 'object' &&
        Object.hasOwn(def.properties as object, 'display'),
      );
    }
    case 'ZodUnion':
    case 'union':
      return (
        Array.isArray(def.options) &&
        (def.options as unknown[]).some((option) => _schemaHasDisplay(option))
      );
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'optional':
    case 'nullable':
    case 'default':
    case 'catch':
      return _schemaHasDisplay((def as { innerType?: unknown }).innerType);
    case 'ZodEffects':
    case 'ZodTransform':
    case 'effects':
    case 'transform':
      return _schemaHasDisplay((def as { schema?: unknown }).schema);
    default:
      return false;
  }
}

function _objectSchemaHasProperty(schema: unknown, property: string): boolean {
  const typedSchema = schema as {
    _def?: {
      typeName?: string;
      type?: string;
      shape?: unknown;
      properties?: unknown;
    };
    def?: {
      typeName?: string;
      type?: string;
      shape?: unknown;
      properties?: unknown;
    };
  };
  const def = typedSchema?._def ?? typedSchema?.def;
  if (!def) {
    return false;
  }

  const type = def.typeName ?? (def as { type?: string }).type;
  if (type !== 'ZodObject' && type !== 'object') {
    return false;
  }

  const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
  return Boolean(
    (shape &&
      typeof shape === 'object' &&
      Object.hasOwn(shape as object, property)) ||
    (def.properties &&
      typeof def.properties === 'object' &&
      Object.hasOwn(def.properties as object, property)),
  );
}

// Minimal mock transport implementing start/close
class MockTransport {
  start = vi.fn();
  close = vi.fn();
}

async function connectClientForToolCall() {
  const handler = createMcpHandler(
    () => createTerminal49McpServer('token', 'https://api.test'),
    {
      legacy: 'stateless',
      responseMode: 'json',
    },
  );
  const client = new Client(
    { name: 'terminal49-tool-output-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.test/mcp'),
    {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    },
  );

  await client.connect(transport);
  return { client, handler };
}

describe('MCP server wiring', () => {
  it('connects without throwing and registers MCP handlers', async () => {
    const server = createTerminal49McpServer('token', 'https://api.test');
    await server.connect(new MockTransport() as any);
    expect(typeof server).toBe('object');
    expect(typeof (server as any).registerTool).toBe('function');
    expect(typeof (server as any).registerResource).toBe('function');
    expect(typeof (server as any).registerPrompt).toBe('function');
  });

  it('registers all tools, prompts, and resources', () => {
    const server = createTerminal49McpServer('token');
    const tools = Object.keys((server as any)._registeredTools || {});
    const resources = Object.keys((server as any)._registeredResources || {});
    const resourceTemplates = Object.keys(
      (server as any)._registeredResourceTemplates || {},
    );
    const prompts = Object.keys((server as any)._registeredPrompts || {});

    expect(tools).toHaveLength(defaultTools().length);
    expect(tools).toContain('search_container');
    expect(tools).toContain('track_container');
    expect(tools).toContain('get_container');
    expect(tools).toContain('get_shipment_details');
    expect(tools).toContain('get_container_transport_events');
    expect(tools).toContain('get_supported_shipping_lines');
    expect(tools).toContain('get_container_route');
    expect(tools).toContain('summarize_containers');
    expect(tools).toContain('list_parties');
    expect(tools).toContain('list_shipments');
    expect(tools).toContain('list_containers');
    expect(tools).toContain('list_tracking_requests');
    expect(tools).toContain('search_docs');
    expect(tools).toContain('whoami');
    expect(tools).toContain('set_party_role');
    expect(tools).toContain('set_custom_field');
    for (const name of TRADE_INTEL_TOOL_NAMES) expect(tools).toContain(name);

    expect(prompts).toHaveLength(3);
    expect(prompts).toContain('track-shipment');
    expect(prompts).toContain('check-demurrage');
    expect(prompts).toContain('analyze-delays');

    expect(resources).toHaveLength(3);
    expect(resourceTemplates).toHaveLength(1);
    expect(resources).toContain('terminal49://docs/milestone-glossary');
    expect(resources).toContain('terminal49://docs/mcp-query-guidance');
    expect(resources).toContain('terminal49://docs/list-display-columns');
    expect(resourceTemplates).toContain('container');
  });

  it('does not advertise intent, strips it from legacy read arguments and rejects it on writes', () => {
    const server = createTerminal49McpServer('token');
    const tools = (server as any)._registeredTools as Record<
      string,
      { inputSchema: { parse: (value: unknown) => Record<string, unknown> } }
    >;
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const legacyArgs: Record<string, Record<string, unknown>> = {
      search_container: { query: 'CAIU1234567' },
      track_container: { number: 'CAIU1234567' },
      identify_tracking_number: { number: 'CAIU1234567' },
      get_container: { id },
      get_shipment_details: { id },
      get_container_transport_events: { id },
      get_supported_shipping_lines: { search: 'Maersk' },
      get_container_route: { id },
      get_location: { kind: 'port', id: 'USLAX' },
      get_vessel: { id },
      list_shipments: {},
      list_containers: {},
      summarize_containers: { group_by: 'pod_terminal' },
      list_parties: { search: 'Acme' },
      list_custom_field_definitions: {},
      list_tracking_requests: {},
      get_tracking_request: { id },
      list_documents: {},
      get_document: { id },
      search_docs: { query: 'webhooks' },
      whoami: {},
      search_importers: { name: 'acme' },
      get_importer_profile: { company_name: 'ACME' },
      search_commodities: { query: 'office chairs' },
      rank_importers: { hs4: '9401' },
      get_trade_trends: {},
      get_trade_breakdown: { dims: ['pod_coast'] },
      get_trade_data_coverage: {},
    };
    const target = { entity_type: 'shipment', entity_id: id };
    const writeArgs: Record<string, Record<string, unknown>> = {
      stop_shipment_tracking: { shipment_id: id },
      resume_shipment_tracking: { shipment_id: id },
      cancel_tracking_request: { tracking_request_id: id },
      add_reference_numbers: { ...target, add: ['PO-1'] },
      remove_reference_numbers: { ...target, remove: ['PO-1'] },
      set_party_role: {
        container_ids: [id],
        role: 'pickup_dray_carrier',
        party_id: id,
        action: 'add',
      },
      set_custom_field: {
        entity: 'container',
        ids: [id],
        api_slug: 'sales_rep',
        value: 'X',
      },
      relink_document: { id },
      update_document: { id, action: 'reclassify' },
    };
    const newWrites = new Set<string>(
      TOOL_REGISTRY.filter(
        (tool) => tool.tier !== 'read' && !(tool.name in legacyArgs),
      ).map((tool) => tool.name),
    );

    for (const [name, tool] of Object.entries(tools)) {
      expect(_objectSchemaHasProperty(tool.inputSchema, 'intent'), name).toBe(
        false,
      );
      if (newWrites.has(name)) {
        // Write tools were added after intent was retired, so no legacy
        // client sends it, and they reject every unknown key.
        expect(tool.inputSchema.parse(writeArgs[name]), name).toBeTruthy();
        expect(
          () =>
            tool.inputSchema.parse({
              ...writeArgs[name],
              intent: 'legacy routing telemetry',
            }),
          name,
        ).toThrow();
        continue;
      }
      expect(
        tool.inputSchema.parse({
          ...legacyArgs[name],
          intent: 'legacy routing telemetry',
        }),
        name,
      ).not.toHaveProperty('intent');
    }
  });

  it('whoami returns schema-valid tracking slots even when the SDK carries extra fields', async () => {
    // Production regression: the backend emits more tracking_slots fields than the strict
    // output schema listed, and the MCP SDK rejected the structured content for every free
    // or trial account. The tool must build the object from known fields only.
    me.mockResolvedValue({
      id: 'key-1',
      kind: 'api_key',
      channel: 'mcp',
      name: 'Connector key',
      features: { routing_data: { status: 'requires_paid_plan' } },
      account: {
        id: 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a',
        companyName: 'Acme Logistics',
        plan: 'free_plan',
        trackingSlots: {
          limit: 10,
          used: 4,
          activeContainers: 3,
          pendingTrackingRequests: 1,
          remaining: 6,
          someFutureField: 'ignored',
        },
      },
      user: null,
    });
    const server = createTerminal49McpServer('token');
    const tool = (server as any)._registeredTools.whoami;
    const result = await tool.handler({}, {});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.account.tracking_slots).toEqual({
      limit: 10,
      used: 4,
      active_containers: 3,
      pending_tracking_requests: 1,
      remaining: 6,
    });
    expect(tool.outputSchema.safeParse(result.structuredContent).success).toBe(
      true,
    );
  });

  it('whoami stays schema-valid when the SDK omits the slot breakdown', async () => {
    me.mockResolvedValue({
      id: 'key-1',
      kind: 'api_key',
      channel: 'mcp',
      name: 'Connector key',
      features: {},
      account: {
        id: 'b7e2c9a1-5d3f-4e8b-9c0a-1f2e3d4c5b6a',
        companyName: 'Acme Logistics',
        plan: 'in_trial',
        trackingSlots: { limit: 10, used: 4, remaining: 6 },
      },
      user: null,
    });
    const server = createTerminal49McpServer('token');
    const tool = (server as any)._registeredTools.whoami;
    const result = await tool.handler({}, {});

    expect(result.structuredContent.account.tracking_slots).toEqual({
      limit: 10,
      used: 4,
      remaining: 6,
    });
    expect(tool.outputSchema.safeParse(result.structuredContent).success).toBe(
      true,
    );
  });

  it('summarize_containers returns schema-valid counts from one summary call', async () => {
    containersSummary.mockResolvedValue({
      total: 3,
      truncated: false,
      groups: [
        { key: 'customs', label: 'customs', count: 2 },
        { key: null, label: null, count: 1 },
      ],
    });
    const server = createTerminal49McpServer('token');
    const tool = (server as any)._registeredTools.summarize_containers;
    const result = await tool.handler({ group_by: 'hold_type' }, {});

    expect(result.isError).toBeUndefined();
    expect(containersSummary).toHaveBeenCalledTimes(1);
    expect(containersSummary.mock.calls[0][0]).toBe('hold_type');
    expect(containersList).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      total: 3,
      group_by: 'hold_type',
      groups: [
        { key: 'customs', count: 2 },
        { key: null, count: 1 },
      ],
    });
    expect(tool.outputSchema.safeParse(result.structuredContent).success).toBe(
      true,
    );
  });

  it('bounds identifier strings in tool input schemas', () => {
    const server = createTerminal49McpServer('token');
    const tools = (server as any)._registeredTools as Record<
      string,
      { inputSchema: { parse: (value: unknown) => unknown } }
    >;

    expect(() =>
      tools.search_container.inputSchema.parse({ query: 'R'.repeat(128) }),
    ).not.toThrow();
    expect(() =>
      tools.search_container.inputSchema.parse({ query: 'R'.repeat(129) }),
    ).toThrow();
    expect(() =>
      tools.track_container.inputSchema.parse({ number: 'N'.repeat(65) }),
    ).toThrow();
    expect(() =>
      tools.get_supported_shipping_lines.inputSchema.parse({
        search: 'C'.repeat(65),
      }),
    ).toThrow();
    expect(() =>
      tools.list_shipments.inputSchema.parse({ number: 'S'.repeat(65) }),
    ).toThrow();
  });

  it('advertises strict common and advanced list filters', () => {
    const tools = (createTerminal49McpServer('token') as any)._registeredTools;
    expect(
      tools.list_containers.inputSchema.parse({
        current_status: 'available',
        advanced_filters: { picked_up_at: '@not_exists', has_holds: false },
        sort: '-created_at',
      }),
    ).toMatchObject({
      current_status: 'available',
      advanced_filters: { picked_up_at: '@not_exists', has_holds: false },
    });
    expect(
      tools.list_shipments.inputSchema.parse({
        pod_code: 'USLAX',
        advanced_filters: { actively_tracked: false },
      }),
    ).toMatchObject({ pod_code: 'USLAX' });
    for (const name of ['list_containers', 'list_shipments']) {
      expect(() =>
        tools[name].inputSchema.parse({ nonexistent_filter: 'secret' }),
      ).toThrow();
      expect(() =>
        tools[name].inputSchema.parse({
          advanced_filters: { nonexistent_filter: 'secret' },
        }),
      ).toThrow();
    }
  });

  it.each(['list_containers', 'list_shipments', 'summarize_containers'])(
    '%s returns actionable SDK validation errors without submitted values',
    async (name) => {
      const error = Object.assign(
        new Error(
          'Invalid list filter "pod_code": expected literal values, not comparison expressions',
        ),
        { name: 'ValidationError', details: { filter: 'pod_code' } },
      );
      (name === 'list_containers'
        ? containersList
        : name === 'summarize_containers'
          ? containersSummary
          : shipmentsList
      ).mockRejectedValue(error);
      const result = await (
        createTerminal49McpServer('token') as any
      )._registeredTools[name].handler({
        pod_code: '=PRIVATE_VALUE',
        ...(name === 'summarize_containers'
          ? { group_by: 'pod_terminal' }
          : {}),
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe(
        'Invalid list filter "pod_code": expected literal values, not comparison expressions. Use the filter values and operators documented in the tool schema.',
      );
    },
  );

  it('does not echo unknown SDK filter keys or upstream errors', async () => {
    const error = Object.assign(
      new Error('Invalid list filter "PRIVATE_VALUE": unknown filter'),
      { name: 'ValidationError', details: { filter: 'PRIVATE_VALUE' } },
    );
    containersList.mockRejectedValue(error);
    const result = await (
      createTerminal49McpServer('token') as any
    )._registeredTools.list_containers.handler({});
    expect(result.content[0].text).toContain('unsupported list filter');
    expect(result.content[0].text).not.toContain('PRIVATE_VALUE');
  });

  it('requires number in the track_container input schema', () => {
    const server = createTerminal49McpServer('token');
    const schema = (server as any)._registeredTools.track_container
      .inputSchema as { parse: (value: unknown) => unknown };

    expect(() => schema.parse({})).toThrow();
    expect(() => schema.parse({ containerNumber: 'CAIU2885402' })).toThrow();
    expect(() => schema.parse({ number: 'CAIU2885402' })).not.toThrow();
  });

  it('advertises and enforces a maximum page size of 25', () => {
    const server = createTerminal49McpServer('token');
    const tools = (server as any)._registeredTools as Record<
      string,
      { inputSchema: { parse: (value: unknown) => Record<string, unknown> } }
    >;

    for (const name of [
      'list_shipments',
      'list_containers',
      'list_tracking_requests',
    ]) {
      expect(tools[name]?.inputSchema.parse({ page_size: 25 })).toMatchObject({
        page_size: 25,
      });
      expect(() => tools[name]?.inputSchema.parse({ page_size: 26 })).toThrow();
    }
  });

  it('advertises only typed tracking-request filters', () => {
    const server = createTerminal49McpServer('token');
    const schema = (server as any)._registeredTools.list_tracking_requests
      .inputSchema as { parse: (value: unknown) => Record<string, unknown> };

    expect(
      schema.parse({
        request_number: 'CAIU1234567',
        status: 'failed',
        scac: 'MAEU',
      }),
    ).toMatchObject({
      request_number: 'CAIU1234567',
      status: 'failed',
      scac: 'MAEU',
    });
    expect(() =>
      schema.parse({ filters: { 'filter[status]': 'failed' } }),
    ).toThrow();
    expect(() => schema.parse({ scac: 'not a scac' })).toThrow();
  });

  it('tool output schemas do not advertise response steering', () => {
    const server = createTerminal49McpServer('token');
    const tools = (server as any)._registeredTools as Record<
      string,
      { outputSchema: { def: { shape: Record<string, unknown> } } }
    >;

    const expectedToolSchemas = [
      'search_container',
      'track_container',
      'get_container',
      'get_shipment_details',
      'get_container_transport_events',
      'get_supported_shipping_lines',
      'get_container_route',
      'list_shipments',
      'list_containers',
      'list_tracking_requests',
    ];

    for (const name of expectedToolSchemas) {
      const outputSchema = tools[name]?.outputSchema;
      const hasResponseContract = _hasResponseContract(outputSchema);
      expect(hasResponseContract).toBe(false);
    }
  });

  it('list tool output schemas do not advertise response display steering', () => {
    const server = createTerminal49McpServer('token');
    const tools = (server as any)._registeredTools as Record<
      string,
      { outputSchema: { def: { shape: Record<string, unknown> } } }
    >;

    const listTools = [
      'list_shipments',
      'list_containers',
      'list_tracking_requests',
    ];

    for (const name of listTools) {
      const outputSchema = tools[name]?.outputSchema;
      expect(_hasDisplayHintsInResponseContract(outputSchema)).toBe(false);
    }
  });

  it('buildListContract keeps display hints for empty list responses with entity hints', () => {
    const emptyResult = { items: [] };

    const containerContract = buildListContract(emptyResult, 'container');
    expect(containerContract.display?.empty_state).toBe(
      'No matching containers found for the current filters.',
    );

    const shipmentContract = buildListContract(emptyResult, 'shipment');
    expect(shipmentContract.display?.empty_state).toBe(
      'No matching shipments found for the current filters.',
    );

    const trackingContract = buildListContract(emptyResult, 'tracking_request');
    expect(trackingContract.display?.empty_state).toBe(
      'No tracking requests found for the current filters.',
    );
  });

  it('tool error responses are marked as errors to skip output schema validation', async () => {
    const server = createTerminal49McpServer('token');
    const searchTool = (server as any)._registeredTools.search_container;

    const result = await searchTool.handler({ query: '   ' });

    // DEV-10663: tool errors return a generic, non-leaking message; the raw
    // internal error ("Search query is required") must not reach the client.
    expect(result.content[0].text).not.toContain('Search query is required');
    expect(result.content[0].text).toContain('could not be completed');
    expect(result.isError).toBe(true);
    expect(Object.hasOwn(result, 'structuredContent')).toBe(false);
  });

  it('captures handled tool errors when Sentry is initialized', async () => {
    const Sentry = await import('@sentry/node');
    vi.mocked(Sentry.isInitialized).mockReturnValue(true);
    search.mockRejectedValue(
      new Error(
        'upstream failed at https://internal.example/v2?token=secret-token',
      ),
    );

    const server = createTerminal49McpServer('token');
    const searchTool = (server as any)._registeredTools.search_container;

    const result = await searchTool.handler({ query: 'CAIU1234567' });

    expect(result.isError).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
    const captured = vi.mocked(Sentry.captureException).mock.calls[0]?.[0];
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).not.toContain('internal.example');
    expect((captured as Error).message).not.toContain('secret-token');
    expect((captured as Error).message).toContain('could not be completed');
    expect(Sentry.flush).toHaveBeenCalledWith(2000);
  });

  // ==================== MCP spec-adherence features ====================

  it('exposes server-level instructions to the LLM', () => {
    const server = createTerminal49McpServer('token');

    // Instructions are stored on the underlying Server and emitted in the
    // initialize result (MCP ServerOptions.instructions).
    const instructions = (server as any).server._instructions as string;

    expect(typeof instructions).toBe('string');
    expect(instructions).toBe(TERMINAL49_SERVER_INSTRUCTIONS);
    // Sanity-check the guide actually covers the domain + chaining the task asks for.
    expect(instructions).toMatch(/SCAC/);
    expect(instructions).toMatch(/LFD/);
    expect(instructions).toMatch(/search_container/);
    expect(instructions).toMatch(/track_container/);
    expect(instructions.length).toBeGreaterThan(400);
  });

  it('returns carrier SCAC completion values over MCP', async () => {
    shippingLinesList.mockResolvedValue([
      { scac: 'MAEU', name: 'Maersk', shortName: 'Maersk' },
      {
        scac: 'MSCU',
        name: 'Mediterranean Shipping Company',
        shortName: 'MSC',
      },
    ]);

    const handler = createMcpHandler(
      () => createTerminal49McpServer('token', 'https://api.test'),
      {
        legacy: 'stateless',
        responseMode: 'json',
      },
    );
    const client = new Client(
      { name: 'terminal49-completion-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL('https://mcp.test/mcp'),
      {
        fetch: (url, init) => handler.fetch(new Request(url, init)),
      },
    );

    try {
      await client.connect(transport);

      const broadMatch = await client.complete({
        ref: { type: 'ref/prompt', name: 'track-shipment' },
        argument: { name: 'carrier', value: 'm' },
      });
      expect(broadMatch.completion.values).toEqual(['MAEU', 'MSCU']);

      const narrowMatch = await client.complete({
        ref: { type: 'ref/prompt', name: 'track-shipment' },
        argument: { name: 'carrier', value: 'ma' },
      });
      expect(narrowMatch.completion.values).toEqual(['MAEU']);

      shippingLinesList.mockRejectedValue(new Error('upstream unavailable'));
      const degraded = await client.complete({
        ref: { type: 'ref/prompt', name: 'track-shipment' },
        argument: { name: 'carrier', value: 'ma' },
      });
      expect(degraded.completion.values).toEqual([]);
    } finally {
      await client.close();
      await handler.close();
    }
  });

  it('list_containers result includes resource_link blocks with valid container URIs', async () => {
    containersList.mockResolvedValue({
      items: [
        { id: '11111111-1111-1111-1111-111111111111', number: 'CAIU1234567' },
        { id: '22222222-2222-2222-2222-222222222222', number: 'MSCU7654321' },
      ],
      links: {},
      meta: {},
    });

    const server = createTerminal49McpServer('token');
    const result = await (
      server as any
    )._registeredTools.list_containers.handler({});

    const resourceLinks = result.content.filter(
      (block: any) => block.type === 'resource_link',
    );

    expect(resourceLinks).toHaveLength(2);
    expect(resourceLinks[0]).toMatchObject({
      type: 'resource_link',
      uri: 'terminal49://container/11111111-1111-1111-1111-111111111111',
      name: 'Container CAIU1234567',
    });
    expect(resourceLinks[1].uri).toBe(
      'terminal49://container/22222222-2222-2222-2222-222222222222',
    );
    // URIs match the registered container resource template prefix.
    for (const link of resourceLinks) {
      expect(link.uri).toMatch(/^terminal49:\/\/container\/[0-9a-f-]{36}$/);
    }
  });

  it.each([
    {
      name: 'list_containers',
      args: { page: 1, page_size: 10, view: 'full' },
      listMock: containersList,
      payload: {
        items: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            number: 'CAIU1234567',
            currentStatus: 'available',
            terminals: {
              podTerminal: { name: 'APM Los Angeles', firmsCode: 'Y123' },
            },
          },
        ],
        links: {
          self: 'https://api.test/containers?page[number]=1&page[size]=10',
          next: 'https://api.test/containers?page[number]=2&page[size]=10',
        },
        meta: { total: 42 },
        unsupportedFilters: [],
      },
    },
    {
      name: 'list_shipments',
      args: {
        tracking_stopped: false,
        include_containers: true,
        page: 1,
        page_size: 10,
      },
      listMock: shipmentsList,
      payload: {
        items: [
          {
            id: '22222222-2222-2222-2222-222222222222',
            billOfLading: 'MAEU123456789',
            shippingLineScac: 'MAEU',
            containers: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                number: 'CAIU1234567',
              },
            ],
          },
        ],
        links: {
          self: 'https://api.test/shipments?page[number]=1&page[size]=10',
        },
        meta: { total: 1 },
        unsupportedFilters: [],
      },
    },
  ])(
    '$name structured content validates with mapped list sidecars',
    async ({ name, args, listMock, payload }) => {
      listMock.mockResolvedValue(payload);
      const { client, handler } = await connectClientForToolCall();

      try {
        const result = await client.callTool({ name, arguments: args });

        expect(result.structuredContent).toMatchObject(payload);
        expect(JSON.stringify(result)).not.toMatch(
          /_agent_steering|_response_contract|presentation_guidance|suggested_follow_ups|suggested_tools/,
        );
      } finally {
        await client.close();
        await handler.close();
      }
    },
  );

  it('returns data without assistant-only steering content', async () => {
    containersList.mockResolvedValue({ items: [], links: {}, meta: {} });

    const server = createTerminal49McpServer('token');
    const result = await (
      server as any
    )._registeredTools.list_containers.handler({});

    const steeringBlocks = result.content.filter(
      (block: any) =>
        block.type === 'text' &&
        block.annotations?.audience?.length === 1 &&
        block.annotations.audience[0] === 'assistant',
    );

    expect(steeringBlocks).toHaveLength(0);
    expect(JSON.stringify(result)).not.toMatch(
      /_agent_steering|_response_contract|presentation_guidance|suggested_follow_ups|suggested_tools/,
    );

    // The first (answer) block is NOT annotated assistant-only, so it stays
    // visible to end users.
    const answerBlock = result.content[0];
    expect(answerBlock.type).toBe('text');
    const answerAudience = answerBlock.annotations?.audience;
    expect(
      answerAudience === undefined || answerAudience.includes('user'),
    ).toBe(true);
  });
});

describe('trade intelligence tools', () => {
  const sdkError = (name: string, status: number, message: string) =>
    Object.assign(new Error(message), { name, status });

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const server = createTerminal49McpServer('token');
    const tool = (server as any)._registeredTools[name];
    const result = await tool.handler(args, {});
    return { tool, result };
  };

  it('registers every trade intelligence tool as read-only and closed-world', () => {
    const tools = (createTerminal49McpServer('token') as any)._registeredTools;
    for (const name of TRADE_INTEL_TOOL_NAMES) {
      expect(tools[name].annotations, name).toEqual({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
  });

  it('does not expose record-level container or bill of lading lookups', () => {
    const tools = Object.keys(
      (createTerminal49McpServer('token') as any)._registeredTools,
    );
    expect(tools.filter((name) => /lookup|bill_of_lading/.test(name))).toEqual(
      [],
    );
  });

  it.each(TRADE_INTEL_TOOL_NAMES.map((name) => [name]))(
    '%s answers a 403 with a plain not-enabled message, not an error',
    async (name) => {
      const notEnabled = new (
        (await import('@terminal49/sdk')) as any
      ).FeatureNotEnabledError(
        'Trade intelligence is not enabled for this account',
      );
      for (const fn of Object.values(tradeIntel))
        fn.mockRejectedValue(notEnabled);
      const args: Record<string, Record<string, unknown>> = {
        search_importers: { name: 'acme' },
        get_importer_profile: { company_name: 'ACME' },
        search_commodities: { query: 'office chairs' },
        rank_importers: {},
        get_trade_trends: {},
        get_trade_breakdown: { dims: ['pod_coast'] },
        get_trade_data_coverage: {},
      };

      const { tool, result } = await callTool(name, args[name]);

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toMatch(
        /isn't enabled for this Terminal49 account/,
      );
      expect(result.content[0].text).toMatch(/support@terminal49\.com/);
      expect(
        tool.outputSchema.safeParse(result.structuredContent).success,
      ).toBe(true);
    },
  );

  it('shows the API reason for a 400 and stays generic for other failures', async () => {
    tradeIntel.topImporters.mockRejectedValueOnce(
      sdkError(
        'ValidationError',
        400,
        "hs4 must be a 4-digit HS code, e.g. '0306'; use commodities/search to find one",
      ),
    );
    const bad = await callTool('rank_importers', { hs4: '0306' });
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toBe(
      "Trade intelligence could not answer this request: hs4 must be a 4-digit HS code, e.g. '0306'; use commodities/search to find one",
    );

    tradeIntel.trends.mockRejectedValueOnce(
      sdkError('RateLimitError', 429, 'Rate limit exceeded; retry in a minute'),
    );
    const limited = await callTool('get_trade_trends', {});
    expect(limited.result.content[0].text).toMatch(/Wait a minute/);

    tradeIntel.meta.mockRejectedValueOnce(
      sdkError('UpstreamError', 502, 'upstream detail that must not leak'),
    );
    const down = await callTool('get_trade_data_coverage', {});
    expect(down.result.content[0].text).toBe(
      'Trade intelligence is temporarily unavailable. Try again shortly.',
    );
    expect(down.result.content[0].text).not.toMatch(/upstream detail/);
  });

  it('returns schema-valid compact results', async () => {
    tradeIntel.searchCompanies.mockResolvedValue({
      index: {
        since_month: '2025-10-01',
        until_month_exclusive: '2026-10-01',
      },
      results: [
        {
          company_name: 'EXAMPLE OUTDOOR SUPPLY',
          company_state: 'GA',
          containers: 100,
          containers_as_consignee: 20,
          containers_as_notify_party: 80,
          teus: 190.44,
          estimated_value: 1234567.89,
          reefer_share: 0,
          first_month: '2025-10-01',
          last_month: '2026-09-01',
          top_ports: [],
          top_origins: [],
          top_carriers: [],
          top_commodities: [],
          score: 0.9,
        },
      ],
    });
    const { tool, result } = await callTool('search_importers', {
      name: 'example outdoor',
    });

    expect(result.structuredContent.importers[0]).toMatchObject({
      company_name: 'EXAMPLE OUTDOOR SUPPLY',
      share_as_notify_party: 0.8,
      teus: 190.4,
      estimated_value_usd: 1234568,
    });
    expect(result.structuredContent.importers[0]).not.toHaveProperty('score');
    expect(result.structuredContent).not.toHaveProperty('index');
    expect(result.structuredContent.period).toMatchObject({
      from: '2025-10',
      to: '2026-09',
    });
    expect(result.structuredContent.importers[0]).toMatchObject({
      first_month: '2025-10',
      last_month: '2026-09',
    });
    expect(tool.outputSchema.safeParse(result.structuredContent).success).toBe(
      true,
    );
  });

  it('tells agents how to read the data in the server instructions', () => {
    for (const phrase of [
      'January 2022',
      'physical containers',
      'support@terminal49.com',
      'months: 24',
      'substring match',
      'floor',
    ]) {
      expect(TERMINAL49_SERVER_INSTRUCTIONS).toContain(phrase);
    }
  });
});
