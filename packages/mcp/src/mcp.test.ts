import { describe, expect, it, vi } from 'vitest';
import { createTerminal49McpServer } from './server.js';

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
      return Array.isArray(def.options) && (def.options as unknown[]).some((option) => _hasResponseContract(option));
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
      const shapeRecord = shape && typeof shape === 'object' ? (shape as Record<string, unknown>) : null;
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
        (def.options as unknown[]).some((option) => _hasDisplayHintsInResponseContract(option))
      );
    case 'ZodOptional':
    case 'ZodNullable':
    case 'ZodDefault':
    case 'ZodCatch':
    case 'optional':
    case 'nullable':
    case 'default':
    case 'catch':
      return _hasDisplayHintsInResponseContract((def as { innerType?: unknown }).innerType);
    case 'ZodEffects':
    case 'ZodTransform':
    case 'effects':
    case 'transform':
      return _hasDisplayHintsInResponseContract((def as { schema?: unknown }).schema);
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
      if (shape && typeof shape === 'object' && Object.hasOwn(shape as object, 'display')) {
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
      return Array.isArray(def.options) && (def.options as unknown[]).some((option) => _schemaHasDisplay(option));
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
    const resourceTemplates = Object.keys((server as any)._registeredResourceTemplates || {});
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

    const listTools = ['list_shipments', 'list_containers', 'list_tracking_requests'];

    for (const name of listTools) {
      const outputSchema = tools[name]?.outputSchema;
      expect(_hasDisplayHintsInResponseContract(outputSchema)).toBe(true);
    }
  });
});
