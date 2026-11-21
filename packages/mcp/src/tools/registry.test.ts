import { describe, expect, it } from 'vite-plus/test';
import { createTerminal49McpServer } from '../server.js';
import { populatedToolsets, TOOL_REGISTRY } from './registry.js';

type RegisteredTool = {
  title?: string;
  annotations?: Record<string, boolean>;
};

function registeredTools(): Record<string, RegisteredTool> {
  // SAFETY: McpServer keeps registered tools in this map. The registry-order
  // test fails loudly if the SDK renames it.
  return (createTerminal49McpServer('token') as any)._registeredTools;
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

  it('serves every registry tool to every session', () => {
    expect(Object.keys(registeredTools())).toHaveLength(TOOL_REGISTRY.length);
  });

  it('registers the write and tracking lifecycle tools unconditionally', () => {
    const names = Object.keys(registeredTools());

    for (const name of [
      'track_container',
      'set_party_role',
      'set_custom_field',
      'update_record',
      'stop_shipment_tracking',
      'resume_shipment_tracking',
      'cancel_tracking_request',
    ]) {
      expect(names, name).toContain(name);
    }
  });

  it('reports the toolsets that have tools, in TOOLSETS order', () => {
    expect(populatedToolsets()).toEqual([
      'core',
      'documents',
      'operations',
      'tracking_lifecycle',
      'trade',
    ]);
  });
});
