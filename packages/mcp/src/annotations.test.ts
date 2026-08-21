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
  $schema: string;
  schema_version: number;
  app_info: {
    display_name: string;
    subtitle: string;
    description: string;
    category: string;
  };
  tools: Record<
    string,
    {
      annotations: ToolAnnotations;
      justifications: Record<string, string>;
    }
  >;
  test_cases: Array<{
    description: string;
    user_prompt: string;
    file_attachment_urls: string[] | null;
    tools_triggered: string;
    expected_output: string;
    expected_output_url: string | null;
  }>;
  negative_test_cases: Array<{
    description: string;
    user_prompt: string;
    file_attachment_urls: string[] | null;
    tools_triggered: null;
    expected_output: string;
    expected_output_url: string | null;
  }>;
};

type ClaudeSubmission = {
  server: {
    url: string;
    transport: string;
    url_type: string;
    authentication: string;
  };
  listing: {
    name: string;
    tagline: string;
    documentation_url: string;
    privacy_policy_url: string;
    terms_of_service_url: string;
    support_email: string;
    icon: string;
    icon_dark: string;
  };
  capabilities: {
    reads_data: boolean;
    writes_data: boolean;
    primary_use_cases: string[];
  };
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
      const liveAnnotations = tool.annotations;
      expect(chatGpt.tools[name]?.annotations, name).toMatchObject({
        readOnlyHint: liveAnnotations?.readOnlyHint,
        destructiveHint: liveAnnotations?.destructiveHint,
        openWorldHint: liveAnnotations?.openWorldHint,
      });
      expect(
        Object.values(chatGpt.tools[name]?.justifications ?? {}).every(
          (justification) => justification.trim().length > 0,
        ),
        `${name}.justifications`,
      ).toBe(true);
      expect(
        Object.keys(chatGpt.tools[name]?.justifications ?? {}),
        `${name}.justifications`,
      ).toHaveLength(3);
    }

    expect(chatGpt.$schema).toBe(
      'https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json',
    );
    expect(chatGpt.schema_version).toBe(1);
    expect(chatGpt.app_info).toMatchObject({
      display_name: 'Terminal49',
      subtitle: 'Track ocean shipments',
      category: 'BUSINESS',
    });
    expect(chatGpt.app_info.description).toContain('Terminal49 helps users');
    expect(chatGpt.test_cases).toHaveLength(5);
    expect(chatGpt.negative_test_cases).toHaveLength(3);
    expect(chatGpt.test_cases[0]?.expected_output).toContain(
      'Otherwise, clearly reports zero matches',
    );
    expect(chatGpt.test_cases[4]?.expected_output).toContain(
      'no request was created',
    );
    for (const testCase of chatGpt.test_cases) {
      expect(testCase.description.trim()).not.toBe('');
      expect(testCase.user_prompt.trim()).not.toBe('');
      expect(testCase.tools_triggered).toBeTypeOf('string');
      expect(testCase.expected_output.trim()).not.toBe('');
      expect(testCase.file_attachment_urls).toBeNull();
      expect(testCase.expected_output_url).toBeNull();
    }
    for (const testCase of chatGpt.negative_test_cases) {
      expect(testCase.description.trim()).not.toBe('');
      expect(testCase.user_prompt.trim()).not.toBe('');
      expect(testCase.tools_triggered).toBeNull();
      expect(testCase.expected_output.trim()).not.toBe('');
      expect(testCase.file_attachment_urls).toBeNull();
      expect(testCase.expected_output_url).toBeNull();
    }
    expect(claude.server).toMatchObject({
      url: 'https://mcp.terminal49.com',
      transport: 'streamable-http',
      url_type: 'universal',
      authentication: 'oauth',
    });
    expect(claude.listing).toMatchObject({
      name: 'Terminal49',
      tagline: 'Track ocean shipments',
      documentation_url: 'https://docs.terminal49.com/mcp/home',
      privacy_policy_url: 'https://terminal49.com/privacy',
      terms_of_service_url: 'https://terminal49.com/terms',
      support_email: 'support@terminal49.com',
    });
    expect(claude.listing.icon).toMatch(/terminal49-light\.png$/);
    expect(claude.listing.icon_dark).toMatch(/terminal49-dark\.png$/);
    expect(claude.listing.tagline.length).toBeLessThanOrEqual(55);
    expect(claude.capabilities).toMatchObject({
      reads_data: true,
      writes_data: true,
    });
    expect(claude.capabilities.primary_use_cases.length).toBeGreaterThan(0);
  });
});
