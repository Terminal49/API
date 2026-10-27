import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vite-plus/test';
import {
  buildServerInstructions,
  MAX_INSTRUCTIONS_BYTES,
} from './instructions.js';
import {
  createTerminal49McpServer,
  SERVER_IDENTITY,
  TERMINAL49_SERVER_INSTRUCTIONS,
  type Terminal49McpServerOptions,
} from './server.js';
import {
  selectTools,
  TOOL_REGISTRY,
  TOOLSETS,
  type Toolset,
} from './tools/registry.js';

async function connect<T>(
  options: Terminal49McpServerOptions,
  read: (client: Client) => Promise<T>,
): Promise<T> {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer(
        'token',
        'https://api.test',
        undefined,
        options,
      ),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const client = new Client({ name: 'instructions-test', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('https://mcp.test/mcp'), {
      fetch: (url, init) => handler.fetch(new Request(url, init)),
    }),
  );

  try {
    return await read(client);
  } finally {
    await client.close();
    await handler.close();
  }
}

function initializeInstructions(
  options: Terminal49McpServerOptions,
): Promise<string | undefined> {
  return connect(options, async (client) => client.getInstructions());
}

function mentionedTools(instructions: string): string[] {
  return TOOL_REGISTRY.map((tool) => tool.name).filter((name) =>
    new RegExp(`\\b${name}\\b`).test(instructions),
  );
}

function toolsetSubsets(): Toolset[][] {
  return Array.from({ length: 2 ** TOOLSETS.length }, (_, mask) =>
    TOOLSETS.filter((_toolset, index) => mask & (1 << index)),
  );
}

describe('server identity', () => {
  it('advertises a title, description, website and 512px icons at initialize', async () => {
    const serverInfo = await connect({}, async (client) =>
      client.getServerVersion(),
    );

    expect(serverInfo).toMatchObject(SERVER_IDENTITY);
    expect(serverInfo?.websiteUrl).toMatch(/^https:\/\//);
    for (const icon of serverInfo?.icons ?? []) {
      expect(icon.sizes).toContain('512x512');
    }
  });
});

describe('server instructions', () => {
  it('sends the full guide with the default toolsets', async () => {
    await expect(initializeInstructions({})).resolves.toBe(
      TERMINAL49_SERVER_INSTRUCTIONS,
    );
  });

  it('does not describe track_container in read-only mode', async () => {
    const instructions = await initializeInstructions({ readOnly: true });

    expect(instructions).not.toMatch(/track_container/);
    expect(instructions).toMatch(/search_container/);
    expect(instructions).toMatch(/only fetch/);
  });

  it('describes no tools when no toolset has tools', async () => {
    const instructions = await initializeInstructions({ toolsets: [] });

    expect(mentionedTools(instructions ?? '')).toEqual([]);
  });

  it('mentions only the tools a selection registers', () => {
    for (const toolsets of toolsetSubsets()) {
      for (const readOnly of [false, true]) {
        const tools = selectTools({ toolsets, readOnly });
        const instructions = buildServerInstructions(tools);

        expect(
          mentionedTools(instructions),
          `${toolsets.join(',')} readOnly=${readOnly}`,
        ).toEqual(
          mentionedTools(instructions).filter((name) =>
            tools.some((tool) => tool.name === name),
          ),
        );
      }
    }
  });

  it('stays within the 2 KB that Claude Code keeps for every selection', () => {
    for (const toolsets of toolsetSubsets()) {
      for (const readOnly of [false, true]) {
        const instructions = buildServerInstructions(
          selectTools({ toolsets, readOnly }),
        );

        expect(
          Buffer.byteLength(instructions, 'utf8'),
          `${toolsets.join(',')} readOnly=${readOnly}`,
        ).toBeLessThanOrEqual(MAX_INSTRUCTIONS_BYTES);
      }
    }
  });

  it('never mentions a tool that is left out', () => {
    for (const omitted of TOOL_REGISTRY) {
      const tools = TOOL_REGISTRY.filter((tool) => tool !== omitted);

      expect(mentionedTools(buildServerInstructions(tools))).not.toContain(
        omitted.name,
      );
    }
  });
});

describe('tool descriptions', () => {
  it('never name a tool the session does not register', async () => {
    for (const toolsets of toolsetSubsets()) {
      for (const readOnly of [false, true]) {
        const { tools } = await connect({ toolsets, readOnly }, (client) =>
          client.listTools(),
        );
        const registered = tools.map((tool) => tool.name);

        for (const tool of tools) {
          expect(
            mentionedTools(JSON.stringify(tool)).filter(
              (name) => !registered.includes(name),
            ),
            `${tool.name} with ${toolsets.join(',')} readOnly=${readOnly}`,
          ).toEqual([]);
        }
      }
    }
  }, 60_000);
});
