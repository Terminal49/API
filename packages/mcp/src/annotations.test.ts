import { describe, expect, it, vi } from 'vite-plus/test';
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
  // ChatGPT app submission requires readOnlyHint: false for all tools that emit
  // operational logs (which all Terminal49 tools do) and openWorldHint: false
  // since they only interact with the user's private Terminal49 account.
  const allTools = [
    'search_container',
    'get_container',
    'get_container_route',
    'get_container_transport_events',
    'get_shipment_details',
    'get_supported_shipping_lines',
    'list_containers',
    'list_shipments',
    'list_tracking_requests',
    'track_container',
  ];

  it('marks all tools with conservative ChatGPT submission annotations', () => {
    const tools = getRegisteredTools();

    for (const name of allTools) {
      const annotations = tools[name]?.annotations;
      expect(annotations, name).toBeDefined();
      // All tools emit redacted operational logs, so readOnlyHint is false.
      expect(annotations?.readOnlyHint, `${name}.readOnlyHint`).toBe(false);
      // All tools interact only with private Terminal49 accounts, not third-party systems.
      expect(annotations?.openWorldHint, `${name}.openWorldHint`).toBe(false);
      // No tool deletes or overwrites data irreversibly.
      expect(annotations?.destructiveHint, `${name}.destructiveHint`).toBe(
        false,
      );
    }
  });

  it('marks track_container as non-idempotent', () => {
    const tools = getRegisteredTools();
    const annotations = tools.track_container?.annotations;

    expect(annotations).toBeDefined();
    expect(annotations?.idempotentHint).toBe(false);
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
    ).toBeGreaterThanOrEqual(allTools.length);

    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.annotations, name).toBeDefined();
    }
  });
});
