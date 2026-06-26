import { getCompleter } from '@modelcontextprotocol/sdk/server/completable.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildListContract,
  createTerminal49McpServer,
  TERMINAL49_SERVER_INSTRUCTIONS,
} from './server.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

// Stubbed Terminal49Client so server tools can be exercised end-to-end without
// hitting the live API. Tests configure these mocks per-case. `vi.hoisted`
// is required because vi.mock factories are hoisted above normal declarations.
const { shippingLinesList, containersList } = vi.hoisted(() => ({
  shippingLinesList: vi.fn(),
  containersList: vi.fn(),
}));

vi.mock('@terminal49/sdk', () => ({
  Terminal49Client: class Terminal49Client {
    shippingLines = { list: shippingLinesList };
    containers = { list: containersList };
  },
  FeatureNotEnabledError: class FeatureNotEnabledError extends Error {},
  NotFoundError: class NotFoundError extends Error {},
}));

beforeEach(() => {
  shippingLinesList.mockReset();
  containersList.mockReset();
});

// The SDK stores prompt arg schemas as a Zod object. Zod v3 exposes `.shape`;
// Zod v4 keeps it on `_zod.def.shape`. Read it the way the SDK does so the
// completion test stays version-robust.
function getArgShape(argsSchema: any): Record<string, unknown> {
  const v4Shape = argsSchema?._zod?.def?.shape;
  const v3Shape = argsSchema?.shape;
  return (v4Shape ?? v3Shape) as Record<string, unknown>;
}

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

    expect(tools).toHaveLength(10);
    expect(tools).toContain('search_container');
    expect(tools).toContain('track_container');
    expect(tools).toContain('get_container');
    expect(tools).toContain('get_shipment_details');
    expect(tools).toContain('get_container_transport_events');
    expect(tools).toContain('get_supported_shipping_lines');
    expect(tools).toContain('get_container_route');
    expect(tools).toContain('list_shipments');
    expect(tools).toContain('list_containers');
    expect(tools).toContain('list_tracking_requests');

    expect(prompts).toHaveLength(3);
    expect(prompts).toContain('track-shipment');
    expect(prompts).toContain('check-demurrage');
    expect(prompts).toContain('analyze-delays');

    expect(resources).toHaveLength(2);
    expect(resourceTemplates).toHaveLength(1);
    expect(resources).toContain('terminal49://docs/milestone-glossary');
    expect(resources).toContain('terminal49://docs/mcp-query-guidance');
    expect(resourceTemplates).toContain('container');
  });

  it('tools accept optional MCP-only intent telemetry', () => {
    const server = createTerminal49McpServer('token');
    const tools = (server as any)._registeredTools as Record<
      string,
      { inputSchema: unknown }
    >;

    for (const [name, tool] of Object.entries(tools)) {
      expect(_objectSchemaHasProperty(tool.inputSchema, 'intent'), name).toBe(
        true,
      );
    }

    expect(() =>
      (
        tools.get_supported_shipping_lines.inputSchema as {
          parse: (value: unknown) => unknown;
        }
      ).parse({
        intent: 'validate carrier before creating a tracking request',
      }),
    ).not.toThrow();
  });

  it('tools include _response_contract in output schemas', () => {
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
      expect(hasResponseContract).toBe(true);
    }
  });

  it('list tool contracts include display hints for table rendering', () => {
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
      expect(_hasDisplayHintsInResponseContract(outputSchema)).toBe(true);
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

    expect(result.content[0].text).toContain('Error: Search query is required');
    expect(result.isError).toBe(true);
    expect(Object.hasOwn(result, 'structuredContent')).toBe(false);
  });

  it('captures handled tool errors when Sentry is initialized', async () => {
    const Sentry = await import('@sentry/node');
    vi.mocked(Sentry.isInitialized).mockReturnValue(true);

    const server = createTerminal49McpServer('token');
    const searchTool = (server as any)._registeredTools.search_container;

    const result = await searchTool.handler({ query: '   ' });

    expect(result.isError).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error));
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

  it('wires carrier SCAC completion on the track-shipment prompt', async () => {
    shippingLinesList.mockResolvedValue([
      { scac: 'MAEU', name: 'Maersk', shortName: 'Maersk' },
      {
        scac: 'MSCU',
        name: 'Mediterranean Shipping Company',
        shortName: 'MSC',
      },
    ]);

    const server = createTerminal49McpServer('token');
    const prompt = (server as any)._registeredPrompts['track-shipment'];

    // The SDK stores the prompt args as a Zod object; pull the completable
    // `carrier` field and run its completer the same way the SDK would.
    const carrierField = getArgShape(prompt.argsSchema).carrier;
    const completer = getCompleter(carrierField as any);
    expect(completer).toBeTypeOf('function');

    // "m" matches Maersk (MAEU) and Mediterranean (MSCU); "ma" matches only Maersk.
    const broad = await completer!('m', undefined);
    expect(broad).toEqual(['MAEU', 'MSCU']);

    const narrow = await completer!('ma', undefined);
    expect(narrow).toEqual(['MAEU']);

    // The completer reused the live supported-lines lookup, filtered by input.
    expect(shippingLinesList).toHaveBeenCalled();
  });

  it('carrier completion degrades to empty suggestions when the API errors', async () => {
    shippingLinesList.mockRejectedValue(new Error('upstream unavailable'));

    const server = createTerminal49McpServer('token');
    const prompt = (server as any)._registeredPrompts['track-shipment'];
    const completer = getCompleter(
      getArgShape(prompt.argsSchema).carrier as any,
    );

    await expect(completer!('ma', undefined)).resolves.toEqual([]);
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

  it('marks steering-only content with audience:[assistant] and keeps the answer user-visible', async () => {
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

    // Exactly one assistant-only steering block carrying the contract hints.
    expect(steeringBlocks).toHaveLength(1);
    expect(steeringBlocks[0].text).toContain('_agent_steering');
    expect(steeringBlocks[0].text).toContain('presentation_guidance');

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
