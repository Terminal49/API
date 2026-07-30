import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const instrumentMock = vi.fn();
const postHogConstructed = vi.fn();
const flushMock = vi.fn().mockResolvedValue(undefined);
const shutdownMock = vi.fn().mockResolvedValue(undefined);

// Only `instrument` and the `PostHog` client are faked. The event/property name
// constants come from the real package on purpose, so a rename upstream fails
// these tests instead of silently un-redacting a field.
vi.mock('@posthog/mcp', async () => {
  const actual =
    await vi.importActual<typeof import('@posthog/mcp')>('@posthog/mcp');

  class FakePostHog {
    constructor(apiKey: string, options: unknown) {
      postHogConstructed(apiKey, options);
    }

    flush = flushMock;
    shutdown = shutdownMock;
  }

  return { ...actual, instrument: instrumentMock, PostHog: FakePostHog };
});

/** Re-import with fresh module state, since the client is a module-level singleton. */
async function loadPostHogModule() {
  vi.resetModules();
  return import('./posthog.js');
}

function fakeServer(): McpServer {
  return { _registeredTools: {} } as unknown as McpServer;
}

/** The options object handed to `instrument()` on the most recent call. */
function lastInstrumentOptions() {
  const call = instrumentMock.mock.calls.at(-1);
  expect(call).toBeDefined();
  return call![2] as {
    context: boolean;
    enableExceptionAutocapture: boolean;
    identify?: { distinctId: string };
    logger?: (message: string) => void;
    beforeSend: (event: {
      event: string;
      properties: Record<string, unknown>;
    }) => unknown;
  };
}

describe('PostHog MCP analytics', () => {
  beforeEach(() => {
    instrumentMock.mockClear();
    postHogConstructed.mockClear();
    flushMock.mockClear();
    shutdownMock.mockClear();
  });

  describe('when unconfigured', () => {
    it('does not initialize without POSTHOG_PROJECT_API_KEY', async () => {
      const posthog = await loadPostHogModule();

      expect(posthog.initializePostHogFromEnv({})).toBe(false);
      expect(posthog.isPostHogInitialized()).toBe(false);
      expect(postHogConstructed).not.toHaveBeenCalled();
    });

    it('treats a blank key as unset', async () => {
      const posthog = await loadPostHogModule();

      expect(
        posthog.initializePostHogFromEnv({ POSTHOG_PROJECT_API_KEY: '   ' }),
      ).toBe(false);
      expect(postHogConstructed).not.toHaveBeenCalled();
    });

    it('stays off when POSTHOG_ENABLED is false even with a key set', async () => {
      const posthog = await loadPostHogModule();

      expect(
        posthog.initializePostHogFromEnv({
          POSTHOG_PROJECT_API_KEY: 'phc_test',
          POSTHOG_ENABLED: 'false',
        }),
      ).toBe(false);
      expect(postHogConstructed).not.toHaveBeenCalled();
    });

    it('returns the server untouched and never calls instrument()', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({});

      const server = fakeServer();
      expect(posthog.instrumentMcpServerWithPostHog(server)).toBe(server);
      expect(instrumentMock).not.toHaveBeenCalled();
    });

    it('flush and shutdown resolve without touching a client', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({});

      await expect(posthog.flushPostHogEvents()).resolves.toBeUndefined();
      await expect(posthog.shutdownPostHog()).resolves.toBeUndefined();
      expect(flushMock).not.toHaveBeenCalled();
      expect(shutdownMock).not.toHaveBeenCalled();
    });
  });

  describe('when configured', () => {
    it('defaults to the first-party ingestion proxy', async () => {
      const posthog = await loadPostHogModule();

      expect(
        posthog.initializePostHogFromEnv({
          POSTHOG_PROJECT_API_KEY: 'phc_test',
        }),
      ).toBe(true);
      expect(posthog.isPostHogInitialized()).toBe(true);
      expect(postHogConstructed).toHaveBeenCalledWith(
        'phc_test',
        expect.objectContaining({
          host: 'https://f.terminal49.com',
          // Sentry owns error tracking; PostHog must not install global handlers.
          enableExceptionAutocapture: false,
        }),
      );
    });

    it('honours a POSTHOG_HOST override', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({
        POSTHOG_PROJECT_API_KEY: 'phc_test',
        POSTHOG_HOST: 'https://eu.i.posthog.com',
      });

      expect(postHogConstructed).toHaveBeenCalledWith(
        'phc_test',
        expect.objectContaining({ host: 'https://eu.i.posthog.com' }),
      );
    });

    it('does not inject the context argument into tool schemas', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({
        POSTHOG_PROJECT_API_KEY: 'phc_test',
      });
      posthog.instrumentMcpServerWithPostHog(fakeServer(), {}, {});

      const options = lastInstrumentOptions();
      // `context: true` would add a *required* parameter to every tool's
      // advertised inputSchema, changing this server's public MCP contract.
      expect(options.context).toBe(false);
      expect(options.enableExceptionAutocapture).toBe(false);
    });

    it('returns the same server instance it was given', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({
        POSTHOG_PROJECT_API_KEY: 'phc_test',
      });

      const server = fakeServer();
      expect(posthog.instrumentMcpServerWithPostHog(server, {}, {})).toBe(
        server,
      );
      expect(instrumentMock).toHaveBeenCalledTimes(1);
    });

    it('passes a distinctId through as a static identity', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({
        POSTHOG_PROJECT_API_KEY: 'phc_test',
      });
      posthog.instrumentMcpServerWithPostHog(
        fakeServer(),
        { distinctId: 'acct_123' },
        {},
      );

      expect(lastInstrumentOptions().identify).toEqual({
        distinctId: 'acct_123',
      });
    });

    it('keeps the logger silent unless POSTHOG_DEBUG is set', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({
        POSTHOG_PROJECT_API_KEY: 'phc_test',
      });

      posthog.instrumentMcpServerWithPostHog(fakeServer(), {}, {});
      expect(lastInstrumentOptions().logger).toBeUndefined();

      posthog.instrumentMcpServerWithPostHog(
        fakeServer(),
        {},
        { POSTHOG_DEBUG: 'true' },
      );
      expect(lastInstrumentOptions().logger).toBeTypeOf('function');
    });

    it('survives instrument() throwing', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({
        POSTHOG_PROJECT_API_KEY: 'phc_test',
      });
      instrumentMock.mockImplementationOnce(() => {
        throw new Error('boom');
      });

      const server = fakeServer();
      expect(() =>
        posthog.instrumentMcpServerWithPostHog(server, {}, {}),
      ).not.toThrow();
    });

    it('flushes the client per request', async () => {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({
        POSTHOG_PROJECT_API_KEY: 'phc_test',
      });

      await posthog.flushPostHogEvents();
      expect(flushMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('beforeSend redaction', () => {
    async function redact(event: {
      event: string;
      properties: Record<string, unknown>;
    }) {
      const posthog = await loadPostHogModule();
      posthog.initializePostHogFromEnv({
        POSTHOG_PROJECT_API_KEY: 'phc_test',
      });
      posthog.instrumentMcpServerWithPostHog(fakeServer(), {}, {});

      return lastInstrumentOptions().beforeSend(event);
    }

    it('strips tool arguments, responses and error messages', async () => {
      const result = (await redact({
        event: '$mcp_tool_call',
        properties: {
          $mcp_tool_name: 'search_container',
          $mcp_duration_ms: 42,
          $mcp_is_error: false,
          // Customer identifiers must never leave the process.
          $mcp_parameters: { query: 'CAIU2885402' },
          $mcp_response: { containers: [{ number: 'CAIU2885402' }] },
          $mcp_error_message: 'No container found for CAIU2885402',
        },
      })) as { properties: Record<string, unknown> };

      expect(result.properties).not.toHaveProperty('$mcp_parameters');
      expect(result.properties).not.toHaveProperty('$mcp_response');
      expect(result.properties).not.toHaveProperty('$mcp_error_message');

      // The analytics-useful properties survive.
      expect(result.properties.$mcp_tool_name).toBe('search_container');
      expect(result.properties.$mcp_duration_ms).toBe(42);
      expect(result.properties.$mcp_is_error).toBe(false);

      expect(JSON.stringify(result)).not.toContain('CAIU2885402');
    });

    it('drops $exception events, which Sentry already owns', async () => {
      const result = await redact({
        event: '$exception',
        properties: { $exception_message: 'boom for CAIU2885402' },
      });

      expect(result).toBeNull();
    });

    it('leaves an event with nothing sensitive unchanged', async () => {
      const result = (await redact({
        event: '$mcp_initialize',
        properties: { $mcp_client_name: 'claude-code' },
      })) as { properties: Record<string, unknown> };

      expect(result.properties).toEqual({ $mcp_client_name: 'claude-code' });
    });
  });
});
