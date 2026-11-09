import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vite-plus/test';
import { createTerminal49McpServer } from './server.js';

async function listToolsResponse(): Promise<{
  body: string;
  instructions: string | undefined;
}> {
  const handler = createMcpHandler(
    () => createTerminal49McpServer('test-token', 'https://api.test'),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const bodies = new Map<string, string>();
  const client = new Client(
    { name: 'terminal49-tools-list-snapshot', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.test/mcp'),
    {
      fetch: async (url, init) => {
        const response = await handler.fetch(new Request(url, init));
        const { method } = JSON.parse(String(init?.body));
        if (method) {
          bodies.set(method, await response.clone().text());
        }
        return response;
      },
    },
  );

  let instructions: string | undefined;
  try {
    await client.connect(transport);
    instructions = client.getInstructions();
    await client.listTools();
  } finally {
    await client.close();
    await handler.close();
  }

  const body = bodies.get('tools/list');
  if (!body) {
    throw new Error('tools/list was not requested');
  }
  return { body, instructions };
}

describe('tools/list snapshot', () => {
  it('advertises the same tools, schemas and annotations byte for byte', async () => {
    const { body } = await listToolsResponse();

    await expect(body).toMatchFileSnapshot('./__snapshots__/tools-list.json');
  });

  it('sends the same default instructions byte for byte', async () => {
    const { instructions } = await listToolsResponse();

    await expect(instructions).toMatchFileSnapshot(
      './__snapshots__/instructions.txt',
    );
  });
});
