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

  // get_supported_shipping_lines is a closed-world catalog; the other read
  // tools query live shipment data and should be open-world.
  const closedWorldReadTools = ['get_supported_shipping_lines'];

  it('marks the nine read tools as read-only', () => {
    const tools = getRegisteredTools();

    for (const name of readOnlyTools) {
      const annotations = tools[name]?.annotations;
      expect(annotations, name).toBeDefined();
      expect(annotations?.readOnlyHint, name).toBe(true);

      if (!closedWorldReadTools.includes(name)) {
        expect(annotations?.openWorldHint, name).toBe(true);
      }
    }
  });

  it('marks track_container as a non-destructive non-idempotent write', () => {
    const tools = getRegisteredTools();
    const annotations = tools.track_container?.annotations;

    expect(annotations).toBeDefined();
    expect(annotations?.readOnlyHint).toBe(false);
    expect(annotations?.destructiveHint).toBe(false);
    expect(annotations?.idempotentHint).toBe(false);
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

    // Guard against the SDK renaming/restructuring `_registeredTools`: if the
    // map ever resolves to undefined or empty, the per-tool loop below would
    // pass vacuously. Assert it actually contains the tools we expect first.
    expect(
      tools,
      '_registeredTools is empty - SDK internals may have changed',
    ).toBeTruthy();
    expect(
      Object.keys(tools).length,
      '_registeredTools is empty - SDK internals may have changed',
    ).toBeGreaterThanOrEqual(readOnlyTools.length + 1);

    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.annotations, name).toBeDefined();
    }
  });
});
