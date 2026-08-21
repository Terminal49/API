import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

const endpoint = process.env.MCP_HTTP_ENDPOINT;
const protocolVersion = process.env.MCP_PROTOCOL_VERSION;
const token = process.env.MCP_HTTP_TOKEN;
const scheme = process.env.MCP_HTTP_AUTH_SCHEME || 'Token';

if (!endpoint) {
  throw new Error('MCP_HTTP_ENDPOINT is required');
}
if (!protocolVersion) {
  throw new Error('MCP_PROTOCOL_VERSION is required');
}
if (!token) {
  throw new Error(
    'MCP_HTTP_TOKEN is required because the deployed Terminal49 MCP rejects unauthenticated handshakes',
  );
}

const isModern = protocolVersion === '2026-07-28';
const expectedHandshake = isModern ? 'server/discover' : 'initialize';
const observedRequests = [];

const client = new Client(
  { name: 'terminal49-preview-protocol-ci', version: '1.0.0' },
  isModern
    ? { versionNegotiation: { mode: { pin: protocolVersion } } }
    : { supportedProtocolVersions: [protocolVersion] },
);
const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
  requestInit: {
    headers: {
      Authorization: `${scheme} ${token}`,
    },
  },
  fetch: async (url, init) => {
    const requestBody =
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    if (requestBody?.method) {
      observedRequests.push(requestBody.method);
    }

    const response = await fetch(url, init);
    const responseBody = await response.clone().text();
    if (
      response.status === 400 ||
      /unsupported protocol version/i.test(responseBody)
    ) {
      throw new Error(
        `Preview rejected ${protocolVersion} (${response.status}): ${responseBody}`,
      );
    }
    if (!response.ok) {
      throw new Error(
        `Preview request failed for ${protocolVersion} (${response.status}): ${responseBody}`,
      );
    }
    return response;
  },
});

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
      `Expected 10 preview tools over ${protocolVersion}, received ${tools.length}`,
    );
  }

  console.log(
    `Preview MCP ${protocolVersion}: ${expectedHandshake} accepted; ${tools.length} tools listed`,
  );
} finally {
  await client.close();
}
