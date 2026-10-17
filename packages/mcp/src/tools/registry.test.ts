import { describe, expect, it } from 'vite-plus/test';
import { createTerminal49McpServer } from '../server.js';
import {
  DEFAULT_TOOLSETS,
  defaultTools,
  selectTools,
  TOOL_REGISTRY,
  TOOLSETS,
} from './registry.js';

type RegisteredTool = {
  title?: string;
  annotations?: Record<string, boolean>;
};

function registeredTools(
  options: Parameters<typeof createTerminal49McpServer>[3] = {
    toolsets: TOOLSETS,
  },
): Record<string, RegisteredTool> {
  // SAFETY: McpServer keeps registered tools in this map. The registry-order
  // test fails loudly if the SDK renames it.
  return (
    createTerminal49McpServer('token', undefined, undefined, options) as any
  )._registeredTools;
}

describe('tool registry', () => {
  it('registers every registry tool in registry order', () => {
    expect(Object.keys(registeredTools())).toEqual(
      TOOL_REGISTRY.map((tool) => tool.name),
    );
  });

  it('takes each title and annotation set from the registry', () => {
    const tools = registeredTools();

    for (const definition of TOOL_REGISTRY) {
      expect(tools[definition.name]?.title, definition.name).toBe(
        definition.title,
      );
      expect(tools[definition.name]?.annotations, definition.name).toEqual(
        definition.annotations,
      );
    }
  });

  it('gives every tool a unique name', () => {
    const names = TOOL_REGISTRY.map((tool) => tool.name);

    expect(new Set(names).size).toBe(names.length);
  });

  it('registers the default toolsets when no toolsets are given', () => {
    expect(Object.keys(registeredTools({}))).toEqual(
      defaultTools().map((tool) => tool.name),
    );
    expect(defaultTools()).toEqual(
      TOOL_REGISTRY.filter((tool) => DEFAULT_TOOLSETS.includes(tool.toolset)),
    );
  });

  it('registers only tools in the requested toolsets', () => {
    expect(Object.keys(registeredTools({ toolsets: ['documents'] }))).toEqual(
      TOOL_REGISTRY.filter((tool) => tool.toolset === 'documents').map(
        (tool) => tool.name,
      ),
    );
    expect(Object.keys(registeredTools({ toolsets: [] }))).toEqual([]);
  });

  it('drops every tool that is not read-only in read-only mode', () => {
    const names = Object.keys(
      registeredTools({ toolsets: TOOLSETS, readOnly: true }),
    );

    expect(names).not.toContain('track_container');
    expect(names).toEqual(
      TOOL_REGISTRY.filter((tool) => tool.annotations.readOnlyHint).map(
        (tool) => tool.name,
      ),
    );
  });

  it('keeps registry order when selecting', () => {
    const selected = selectTools({ toolsets: TOOLSETS, readOnly: false });

    expect(selected).toEqual([...TOOL_REGISTRY]);
  });
});
