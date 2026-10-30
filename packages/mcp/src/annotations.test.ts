import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { createTerminal49McpServer } from './server.js';
import {
  DEFAULT_TOOLSETS,
  TOOL_REGISTRY,
  type ToolDefinition,
  TOOLSETS,
  type Toolset,
} from './tools/registry.js';

/** The registry with each tier widened, so checks for any tier compile. */
const REGISTRY: readonly ToolDefinition[] = TOOL_REGISTRY;

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
    tool_names: string[];
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

type RegisteredTool = {
  title?: string;
  annotations?: ToolAnnotations;
  inputSchema?: z.ZodType;
};

function getRegisteredTools(
  toolsets: readonly Toolset[] = DEFAULT_TOOLSETS,
): Record<string, RegisteredTool> {
  const server = createTerminal49McpServer('token', undefined, undefined, {
    toolsets,
  });
  // SAFETY: McpServer keeps registered tools in this map. The size check in
  // 'annotates every registered tool' fails if the SDK renames it.
  return (server as any)._registeredTools as Record<string, RegisteredTool>;
}

describe('MCP tool annotations', () => {
  it('annotates every registered tool with a title and boolean hints', () => {
    const tools = getRegisteredTools(TOOLSETS);

    expect(Object.keys(tools)).toHaveLength(TOOL_REGISTRY.length);
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.title?.trim(), `${name}.title`).toBeTruthy();
      for (const hint of [
        'readOnlyHint',
        'destructiveHint',
        'openWorldHint',
      ] as const) {
        expect(tool.annotations?.[hint], `${name}.${hint}`).toBeTypeOf(
          'boolean',
        );
      }
    }
  });

  it('never marks a read-only tool as destructive', () => {
    for (const tool of TOOL_REGISTRY) {
      const { readOnlyHint, destructiveHint } = tool.annotations;
      expect(destructiveHint && readOnlyHint, tool.name).toBe(false);
    }
  });

  it('matches each tier to its annotations', () => {
    for (const tool of REGISTRY) {
      const { readOnlyHint, destructiveHint } = tool.annotations;
      expect(readOnlyHint, `${tool.name} tier ${tool.tier}`).toBe(
        tool.tier === 'read',
      );
      if (tool.tier === 'C') {
        expect(destructiveHint, `${tool.name} tier C`).toBe(true);
      }
    }
  });

  it('advertises only the expected writes, and the record edits as destructive', () => {
    // MCP: destructiveHint false means the tool only adds. set_party_role
    // detaches parties (remove, replace) and set_custom_field overwrites or
    // clears values, so both must say true. track_container only creates.
    const tools = getRegisteredTools();
    const writes = Object.entries(tools)
      .filter(([, tool]) => tool.annotations?.readOnlyHint === false)
      .map(([name]) => name);
    const destructiveTools = Object.entries(tools)
      .filter(([, tool]) => tool.annotations?.destructiveHint === true)
      .map(([name]) => name);

    expect(writes.sort()).toEqual([
      'add_reference_numbers',
      'cancel_tracking_request',
      'remove_reference_numbers',
      'resume_shipment_tracking',
      'set_custom_field',
      'set_party_role',
      'stop_shipment_tracking',
      'track_container',
    ]);
    expect(destructiveTools.sort()).toEqual([
      'cancel_tracking_request',
      'remove_reference_numbers',
      'set_custom_field',
      'set_party_role',
      'stop_shipment_tracking',
    ]);
  });

  it('marks the record edits as idempotent and track_container as not', () => {
    const tools = getRegisteredTools();

    expect(tools.set_party_role?.annotations?.idempotentHint).toBe(true);
    expect(tools.set_custom_field?.annotations?.idempotentHint).toBe(true);
    expect(tools.track_container?.annotations?.idempotentHint).toBe(false);
  });

  it('gives every tier C tool an optional confirmation_token input', () => {
    const tools = getRegisteredTools(TOOLSETS);

    for (const definition of REGISTRY.filter((tool) => tool.tier === 'C')) {
      const schema = tools[definition.name]?.inputSchema;
      expect(schema, definition.name).toBeDefined();
      const jsonSchema = z.toJSONSchema(schema!, { io: 'input' }) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(jsonSchema.properties, definition.name).toHaveProperty(
        'confirmation_token',
      );
      expect(jsonSchema.required ?? [], definition.name).not.toContain(
        'confirmation_token',
      );
    }
  });

  it('marks only search_docs as open world', () => {
    expect(
      TOOL_REGISTRY.filter((tool) => tool.annotations.openWorldHint).map(
        (tool) => tool.name,
      ),
    ).toEqual(['search_docs']);
  });

  it('never names a tool from an opt-in toolset in the store submissions', () => {
    const optIn = REGISTRY.filter(
      (tool) => !DEFAULT_TOOLSETS.includes(tool.toolset),
    ).map((tool) => tool.name);
    expect(optIn).toEqual(
      expect.arrayContaining([
        'relink_document',
        'update_document',
        'list_webhooks',
        'list_webhook_notifications',
      ]),
    );

    for (const file of [
      'chatgpt-app-submission.json',
      'claude-connector-submission.json',
    ]) {
      const text = readFileSync(
        new URL(`../../../${file}`, import.meta.url),
        'utf8',
      );
      for (const name of optIn) {
        expect(text, `${name} in ${file}`).not.toMatch(
          new RegExp(`\\b${name}\\b`),
        );
      }
    }
  });

  it('lists exactly the default toolset tools, with live annotations, in the store submissions', () => {
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
      subtitle: 'Track shipping containers',
      category: 'BUSINESS',
    });
    expect(chatGpt.app_info.description).toContain('Terminal49 helps users');
    // Final directory review requires exactly 5 positive and 3 negative cases,
    // although the import schema only declares minimums.
    expect(chatGpt.test_cases).toHaveLength(5);
    expect(chatGpt.negative_test_cases).toHaveLength(3);
    const caseFor = (tool: string) =>
      chatGpt.test_cases.find((testCase) => testCase.tools_triggered === tool);
    expect(caseFor('search_container')?.expected_output).toContain(
      'Otherwise, clearly reports zero matches',
    );
    expect(caseFor('track_container')?.expected_output).toContain(
      'no request was created',
    );
    const triggered = new Set(
      chatGpt.test_cases.flatMap((testCase) =>
        testCase.tools_triggered.split(',').map((name) => name.trim()),
      ),
    );
    expect(triggered).toContain('summarize_containers');
    expect(triggered).toContain('list_parties');
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
    // Tool names are listing details in the Claude directory; a new or
    // renamed tool needs a listing edit in the developer portal.
    expect(claude.listing.tool_names).toEqual(Object.keys(tools).sort());
  });
});
