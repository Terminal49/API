import type { McpServer } from '@modelcontextprotocol/server';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { runStdioServer } from './server.js';
import { defaultTools } from './tools/registry.js';

class ExitError extends Error {
  constructor(readonly code: string | number | null | undefined) {
    super(`process.exit(${code})`);
  }
}

/** Runs the stdio entry and returns the factory it hands to the transport. */
async function startStdio(): Promise<Array<() => McpServer>> {
  const factories: Array<() => McpServer> = [];
  await runStdioServer((factory) => {
    factories.push(factory);
  });
  return factories;
}

function toolNames(factories: Array<() => McpServer>): string[] {
  expect(factories).toHaveLength(1);
  // SAFETY: McpServer keeps registered tools in this map. registry.test.ts
  // fails loudly if the SDK renames it.
  return Object.keys((factories[0]!() as any)._registeredTools);
}

describe('runStdioServer', () => {
  beforeEach(() => {
    vi.stubEnv('T49_API_TOKEN', 'token');
    vi.stubEnv('T49_MCP_TOOLSETS', '');
    vi.stubEnv('T49_MCP_READ_ONLY', '');
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitError(code);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('serves the default toolsets when the env sets none', async () => {
    expect(toolNames(await startStdio())).toEqual(
      defaultTools().map((tool) => tool.name),
    );
  });

  it('serves only the toolsets named in T49_MCP_TOOLSETS', async () => {
    vi.stubEnv('T49_MCP_TOOLSETS', 'documents');

    expect(toolNames(await startStdio())).toEqual([
      'list_documents',
      'get_document',
    ]);
  });

  it('applies T49_MCP_READ_ONLY', async () => {
    vi.stubEnv('T49_MCP_READ_ONLY', 'true');

    const names = toolNames(await startStdio());

    expect(names).not.toContain('track_container');
    expect(names).toContain('search_container');
  });

  it.each(['core,admin', ','])(
    'exits with a config error that names a malformed env var: %j',
    async (value) => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      const serve = vi.fn();
      vi.stubEnv('T49_MCP_TOOLSETS', value);

      await expect(runStdioServer(serve)).rejects.toEqual(new ExitError(1));

      expect(error).toHaveBeenCalledWith(
        expect.stringMatching(/^ERROR: T49_MCP_TOOLSETS must list only/),
      );
      expect(serve).not.toHaveBeenCalled();
    },
  );
});
