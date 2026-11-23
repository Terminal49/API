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
import { TOOL_REGISTRY } from './tools/registry.js';

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

  it('serves every registry tool', async () => {
    expect(toolNames(await startStdio())).toEqual(
      TOOL_REGISTRY.map((tool) => tool.name),
    );
  });

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

    it('warns and uses a random secret when the env secret is too short', async () => {
      vi.stubEnv('T49_MCP_CONFIRMATION_SECRET', 'short-secret');
      const [factory] = await startStdio();

      await expect(cancel(factory!)).resolves.toMatchObject({
        status: 'confirmation_required',
      });
      const stderr = vi.mocked(console.error).mock.calls.flat().join('\n');
      expect(stderr).toContain(
        'WARNING: T49_MCP_CONFIRMATION_SECRET is shorter than 32 characters',
      );
      expect(stderr).not.toContain('short-secret');
    });
  });
});
