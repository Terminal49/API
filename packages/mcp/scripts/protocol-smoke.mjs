import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createTerminal49McpServer } from '../dist/server.js';

const protocolVersion = process.env.MCP_PROTOCOL_VERSION;
if (!protocolVersion) {
  throw new Error('MCP_PROTOCOL_VERSION is required');
}

const isModern = protocolVersion === '2026-07-28';
const expectedHandshake = isModern ? 'server/discover' : 'initialize';
const observedRequests = [];

const handler = createMcpHandler(
  () => createTerminal49McpServer('ci-test-token', 'https://api.test'),
  {
    legacy: 'stateless',
    responseMode: 'json',
  },
);
const client = new Client(
  { name: 'terminal49-protocol-ci', version: '1.0.0' },
  isModern
    ? { versionNegotiation: { mode: { pin: protocolVersion } } }
    : { supportedProtocolVersions: [protocolVersion] },
);
const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.test/mcp'),
  {
    fetch: async (url, init) => {
      const requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (requestBody?.method) {
        observedRequests.push(requestBody.method);
      }

      const response = await handler.fetch(new Request(url, init));
      const responseBody = await response.clone().text();
      if (
        response.status === 400 ||
        /unsupported protocol version/i.test(responseBody)
      ) {
        throw new Error(
          `Protocol ${protocolVersion} was rejected (${response.status}): ${responseBody}`,
        );
      }
      return response;
    },
  },
);

try {
  await client.connect(transport);

  if (client.getNegotiatedProtocolVersion() !== protocolVersion) {
    throw new Error(
      `Expected ${protocolVersion}, negotiated ${client.getNegotiatedProtocolVersion() ?? 'nothing'}`,
    );
  }
  if (!observedRequests.includes(expectedHandshake)) {
    throw new Error(
      `Expected ${expectedHandshake} POST for ${protocolVersion}; observed ${observedRequests.join(', ')}`,
    );
  }

  const { tools } = await client.listTools();
  if (tools.length !== 10) {
    throw new Error(
      `Expected 10 tools over ${protocolVersion}, received ${tools.length}`,
    );
  }

  console.log(
    `MCP ${protocolVersion}: ${expectedHandshake} accepted; ${tools.length} tools listed`,
  );
} finally {
  await client.close();
  await handler.close();
}
