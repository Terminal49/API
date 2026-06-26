import { describe, expect, it, vi } from 'vitest';
import { createTerminal49McpServer } from './server.js';

vi.mock('@sentry/node', () => ({
  captureException: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
  isInitialized: vi.fn(() => false),
  wrapMcpServerWithSentry: vi.fn((server) => server),
}));

type ToolAnnotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

function getRegisteredTools(): Record<
  string,
  { annotations?: ToolAnnotations }
> {
  const server = createTerminal49McpServer('token');
  return (server as any)._registeredTools as Record<
    string,
    { annotations?: ToolAnnotations }
  >;
}

describe('MCP tool annotations', () => {
  const readOnlyTools = [
    'search_container',
    'get_container',
    'get_container_route',
    'get_container_transport_events',
    'get_shipment_details',
    'get_supported_shipping_lines',
    'list_containers',
    'list_shipments',
    'list_tracking_requests',
  ];

  it('marks the nine read tools as read-only', () => {
    const tools = getRegisteredTools();

    for (const name of readOnlyTools) {
      const annotations = tools[name]?.annotations;
      expect(annotations, name).toBeDefined();
      expect(annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it('marks track_container as a non-destructive idempotent write', () => {
    const tools = getRegisteredTools();
    const annotations = tools.track_container?.annotations;

    expect(annotations).toBeDefined();
    expect(annotations?.readOnlyHint).toBe(false);
    expect(annotations?.destructiveHint).toBe(false);
    expect(annotations?.idempotentHint).toBe(true);
    expect(annotations?.openWorldHint).toBe(true);
  });

  it('marks get_supported_shipping_lines as a closed-world catalog', () => {
    const tools = getRegisteredTools();
    const annotations = tools.get_supported_shipping_lines?.annotations;

    expect(annotations).toBeDefined();
    expect(annotations?.readOnlyHint).toBe(true);
    expect(annotations?.openWorldHint).toBe(false);
  });

  it('annotates every registered tool', () => {
    const tools = getRegisteredTools();

    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.annotations, name).toBeDefined();
    }
  });
});
