/**
 * An MCP client connected to an in-process gateway, for tests that drive a
 * tool through the HTTP handler on either confirmation channel.
 */
import {
  Client,
  type ClientOptions,
  type ElicitRequest,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { vi } from 'vite-plus/test';
import {
  createTerminal49McpServer,
  type Terminal49McpServerOptions,
} from '../server.js';
import { TEST_CONFIRMATION_SECRET } from './write-context.js';

export type WireRequest = { method?: string; params?: Record<string, unknown> };

export interface Session {
  client: Client;
  /** Every tools/call request body the client sent, in order. */
  calls: WireRequest[];
  /** Every tools/call result the server answered, in order. */
  results: unknown[];
  close(): Promise<void>;
}

/**
 * Connects a client to an in-process gateway. `edit` rewrites a request body
 * before it reaches the server.
 */
export async function connect(
  options: ClientOptions,
  edit: (body: WireRequest) => WireRequest = (body) => body,
  serverOptions: Terminal49McpServerOptions = {},
): Promise<Session> {
  const handler = createMcpHandler(
    () =>
      createTerminal49McpServer(
        'fixture-token',
        'https://api.test',
        undefined,
        {
          toolsets: ['core', 'operations', 'tracking_lifecycle'],
          confirmationSecret: TEST_CONFIRMATION_SECRET,
          ...serverOptions,
        },
      ),
    { legacy: 'stateless', responseMode: 'json' },
  );
  const calls: WireRequest[] = [];
  const results: unknown[] = [];
  const client = new Client(
    { name: 'confirmation-test', version: '1.0.0' },
    options,
  );
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.test/mcp'),
    {
      fetch: async (url, init) => {
        const body: WireRequest =
          typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        const sent = body.method === 'tools/call' ? edit(body) : body;
        if (sent.method === 'tools/call') calls.push(sent);
        const response = await handler.fetch(
          new Request(url, { ...init, body: JSON.stringify(sent) }),
        );
        if (
          sent.method === 'tools/call' &&
          response.headers.get('content-type')?.includes('application/json')
        ) {
          results.push(JSON.parse(await response.clone().text()).result);
        }
        return response;
      },
    },
  );
  await client.connect(transport);
  return {
    client,
    calls,
    results,
    close: async () => {
      await client.close();
      await handler.close();
    },
  };
}

export const modern: ClientOptions = {
  versionNegotiation: { mode: { pin: '2026-07-28' } },
};

export const asksTheUser: ClientOptions = {
  ...modern,
  capabilities: { elicitation: { form: {} } },
};

export function answerWith(
  client: Client,
  result: {
    action: 'accept' | 'decline' | 'cancel';
    content?: Record<string, boolean>;
  },
) {
  const asked = vi.fn(async (_request: ElicitRequest) => result);
  client.setRequestHandler('elicitation/create', asked);
  return asked;
}
