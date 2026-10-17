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
import { fakeApiFetch } from './test/fake-api.js';
import { meBody, tokenOf } from './test/write-context.js';
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
    vi.stubEnv('T49_MCP_CONFIRMATION_SECRET', '');
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ExitError(code);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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

  describe('confirmation secret', () => {
    const REQUEST_ID = '6c1f0d52-8a3e-4b9f-9d21-0e5f4a7b8c90';

    /** Calls cancel_tracking_request on a server from this factory. */
    async function cancel(
      factory: () => McpServer,
      confirmation_token?: string,
    ): Promise<unknown> {
      // SAFETY: McpServer keeps registered tools in this map. registry.test.ts
      // fails loudly if the SDK renames it.
      const tool = (factory() as any)._registeredTools.cancel_tracking_request;
      const result = await tool.handler(
        { tracking_request_id: REQUEST_ID, confirmation_token },
        {},
      );
      return result.structuredContent;
    }

    beforeEach(() => {
      vi.stubEnv('T49_MCP_TOOLSETS', 'operations');
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.stubGlobal(
        'fetch',
        fakeApiFetch({
          'GET /me': { body: meBody() },
          [`PATCH /tracking_requests/${REQUEST_ID}/cancel`]: { body: {} },
          [`GET /tracking_requests/${REQUEST_ID}`]: {
            body: {
              data: {
                id: REQUEST_ID,
                type: 'tracking_request',
                attributes: { status: 'pending' },
              },
            },
          },
        }).fetch,
      );
    });

    it('makes a random secret per process when the env sets none', async () => {
      const [first] = await startStdio();
      const [second] = await startStdio();

      const preview = await cancel(first!);
      expect(preview).toMatchObject({ status: 'confirmation_required' });
      // A new process has a new secret, so an old token no longer matches.
      await expect(cancel(second!, tokenOf(preview))).resolves.toMatchObject({
        error: 'invalid_confirmation',
        reason: 'mismatch',
      });
    });

    it('uses T49_MCP_CONFIRMATION_SECRET when it is set', async () => {
      vi.stubEnv(
        'T49_MCP_CONFIRMATION_SECRET',
        'a-test-secret-that-is-long-enough-to-sign',
      );
      const [first] = await startStdio();
      const [second] = await startStdio();

      const preview = await cancel(first!);
      await expect(cancel(second!, tokenOf(preview))).resolves.toMatchObject({
        status: 'cancelled',
      });
    });

    it('refuses tier C writes when the env secret is too short', async () => {
      vi.stubEnv('T49_MCP_CONFIRMATION_SECRET', 'short-secret');
      const [factory] = await startStdio();

      await expect(cancel(factory!)).resolves.toMatchObject({
        error: 'not_permitted',
      });
    });
  });
});
