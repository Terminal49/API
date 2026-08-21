import { readFileSync } from 'node:fs';
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

type ChatGptSubmission = {
  app_info: {
    display_name: string;
    subtitle: string;
  };
  tools: Record<string, { annotations: ToolAnnotations }>;
};

type ClaudeSubmission = {
  server: { url: string; authentication: string };
  listing: { name: string; tagline: string };
};

function getRegisteredTools(): Record<
  string,
  { title?: string; annotations?: ToolAnnotations }
> {
  const server = createTerminal49McpServer('token');
  return (server as any)._registeredTools as Record<
    string,
    { title?: string; annotations?: ToolAnnotations }
  >;
}

describe('MCP tool annotations', () => {
  const readTools = [
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
  const allTools = [...readTools, 'track_container'];

  it('marks fetch-only tools as read-only', () => {
    const tools = getRegisteredTools();

    for (const name of readTools) {
      const annotations = tools[name]?.annotations;
      expect(annotations, name).toBeDefined();
      expect(annotations?.readOnlyHint, `${name}.readOnlyHint`).toBe(true);
    }
  });

  it('marks track_container as a non-idempotent write', () => {
    const tools = getRegisteredTools();
    const annotations = tools.track_container?.annotations;

    expect(annotations).toBeDefined();
    expect(annotations?.readOnlyHint).toBe(false);
    expect(annotations?.idempotentHint).toBe(false);
  });

  it('marks every tool as private-account-only and non-destructive', () => {
    const tools = getRegisteredTools();

    for (const name of allTools) {
      const annotations = tools[name]?.annotations;
      expect(annotations, name).toBeDefined();
      expect(annotations?.openWorldHint, `${name}.openWorldHint`).toBe(false);
      expect(annotations?.destructiveHint, `${name}.destructiveHint`).toBe(
        false,
      );
    }
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
      expect(tool.title, `${name}.title`).toEqual(expect.any(String));
      expect(tool.title?.trim().length, `${name}.title`).toBeGreaterThan(0);
      expect(tool.annotations, name).toBeDefined();
    }
  });

  it('keeps live annotations and locked store listings consistent', () => {
    const tools = getRegisteredTools();
    const chatGpt = JSON.parse(
      readFileSync(
        new URL('../../../chatgpt-app-submission.json', import.meta.url),
        'utf8',
      ),
    ) as ChatGptSubmission;
    const claude = JSON.parse(
      readFileSync(
        new URL('../../../claude-connector-submission.json', import.meta.url),
        'utf8',
      ),
    ) as ClaudeSubmission;

    expect(Object.keys(chatGpt.tools).sort()).toEqual(
      Object.keys(tools).sort(),
    );
    for (const [name, tool] of Object.entries(tools)) {
      expect(chatGpt.tools[name]?.annotations, name).toMatchObject(
        tool.annotations ?? {},
      );
    }

    expect(chatGpt.app_info).toMatchObject({
      display_name: 'Terminal49',
      subtitle: 'Track ocean shipments',
    });
    expect(claude.server).toMatchObject({
      url: 'https://mcp.terminal49.com',
      authentication: 'oauth',
    });
    expect(claude.listing).toMatchObject({
      name: 'Terminal49',
      tagline: 'Track ocean shipments',
    });
    expect(claude.listing.tagline.length).toBeLessThanOrEqual(55);
  });
});
