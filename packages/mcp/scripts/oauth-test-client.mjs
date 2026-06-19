#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_RESOURCE_URL = 'https://mcp.terminal49.com';
const DEFAULT_SCOPE = 'openid profile email offline_access';
const DEFAULT_CLIENT_NAME = 'Terminal49 MCP OAuth Test Client';
const DEFAULT_CALLBACK_PATH = '/callback';
const DEFAULT_MCP_PROTOCOL_VERSION = '2025-06-18';
const SESSION_COOKIE = 't49_mcp_oauth_test_session';
const STATE_TTL_MS = 10 * 60 * 1000;

const sessions = new Map();
const registeredClients = new Map();

const settings = {
  port: numberEnv('PORT', DEFAULT_PORT),
  host: stringEnv('HOST', DEFAULT_HOST),
  baseUrl: trimTrailingSlash(
    stringEnv(
      'MCP_OAUTH_CLIENT_BASE_URL',
      `http://localhost:${numberEnv('PORT', DEFAULT_PORT)}`,
    ),
  ),
  callbackPath: stringEnv('MCP_OAUTH_CALLBACK_PATH', DEFAULT_CALLBACK_PATH),
  resourceUrl: trimTrailingSlash(stringEnv('MCP_OAUTH_RESOURCE_URL', DEFAULT_RESOURCE_URL)),
  // Resource (audience) stays the bare origin; the MCP calls go to the /mcp
  // route. Defaulting the endpoint to the origin would POST to `/`, which works
  // only via the root rewrite — be explicit so the test client targets /mcp.
  mcpEndpointUrl: trimTrailingSlash(stringEnv(
    'MCP_OAUTH_MCP_ENDPOINT_URL',
    `${trimTrailingSlash(stringEnv('MCP_OAUTH_RESOURCE_URL', DEFAULT_RESOURCE_URL))}/mcp`,
  )),
  protectedResourceMetadataUrl: optionalEnv('MCP_OAUTH_PROTECTED_RESOURCE_METADATA_URL'),
  authorizationServerUrl: optionalEnv('MCP_OAUTH_AUTHORIZATION_SERVER_URL'),
  scope: stringEnv('MCP_OAUTH_SCOPE', DEFAULT_SCOPE),
  clientName: stringEnv('MCP_OAUTH_CLIENT_NAME', DEFAULT_CLIENT_NAME),
  clientId: optionalEnv('MCP_OAUTH_CLIENT_ID'),
  clientSecret: optionalEnv('MCP_OAUTH_CLIENT_SECRET'),
  clientAuthMethod: optionalEnv('MCP_OAUTH_CLIENT_AUTH_METHOD'),
  dynamicRegistration: booleanEnv('MCP_OAUTH_DYNAMIC_REGISTRATION', true),
  registerEveryRun: booleanEnv('MCP_OAUTH_REGISTER_EVERY_RUN', false),
  mcpProtocolVersion: stringEnv('MCP_PROTOCOL_VERSION', DEFAULT_MCP_PROTOCOL_VERSION),
};

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function stringEnv(name, fallback) {
  return optionalEnv(name) ?? fallback;
}

function numberEnv(name, fallback) {
  const value = optionalEnv(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanEnv(name, fallback) {
  const value = optionalEnv(name);
  if (!value) {
    return fallback;
  }

  return !['0', 'false', 'no'].includes(value.toLowerCase());
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function callbackUrl() {
  return `${settings.baseUrl}${settings.callbackPath}`;
}

function base64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256(input) {
  return createHash('sha256').update(input).digest();
}

function randomUrlToken(byteLength = 32) {
  return base64Url(randomBytes(byteLength));
}

function parseCookies(header) {
  return Object.fromEntries(
    (header ?? '')
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf('=');
        if (separator === -1) {
          return [item, ''];
        }

        return [
          decodeURIComponent(item.slice(0, separator)),
          decodeURIComponent(item.slice(separator + 1)),
        ];
      }),
  );
}

function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const existingId = cookies[SESSION_COOKIE];
  const sessionId = existingId && sessions.has(existingId) ? existingId : randomUrlToken(24);

  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      pendingStates: new Map(),
      tokenResponse: undefined,
      discovery: undefined,
      client: undefined,
      messages: [],
    });
  }

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax`,
  );

  return sessions.get(sessionId);
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendHtml(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
  });
  res.end();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) {
      throw new Error('Request body is too large.');
    }

    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  const contentType = req.headers['content-type'] ?? '';

  if (contentType.includes('application/json')) {
    return rawBody ? JSON.parse(rawBody) : {};
  }

  return Object.fromEntries(new URLSearchParams(rawBody));
}

function protectedResourceMetadataUrl() {
  if (settings.protectedResourceMetadataUrl) {
    return settings.protectedResourceMetadataUrl;
  }

  const resource = new URL(settings.resourceUrl);
  return `${resource.origin}/.well-known/oauth-protected-resource`;
}

async function fetchJson(url, label, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const error = new Error(`${label} request failed with HTTP ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function discoverOAuthMetadata() {
  const resourceMetadata = await fetchJson(
    protectedResourceMetadataUrl(),
    'Protected resource metadata',
  );
  const authorizationServer =
    settings.authorizationServerUrl ||
    resourceMetadata.authorization_servers?.[0];

  if (!authorizationServer) {
    throw new Error('Protected resource metadata did not include authorization_servers.');
  }

  const authServerMetadataUrl = `${trimTrailingSlash(authorizationServer)}/.well-known/oauth-authorization-server`;
  const authorizationServerMetadata = await fetchJson(
    authServerMetadataUrl,
    'Authorization server metadata',
  );

  return {
    protectedResourceMetadataUrl: protectedResourceMetadataUrl(),
    protectedResourceMetadata: resourceMetadata,
    authorizationServer,
    authorizationServerMetadataUrl: authServerMetadataUrl,
    authorizationServerMetadata,
  };
}

function localClientMetadata() {
  return {
    client_name: settings.clientName,
    redirect_uris: [callbackUrl()],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
    scope: settings.scope,
  };
}

async function resolveOAuthClient(discovery) {
  if (settings.clientId) {
    return {
      source: 'environment',
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      token_endpoint_auth_method:
        settings.clientAuthMethod ||
        (settings.clientSecret ? 'client_secret_post' : 'none'),
    };
  }

  const registrationEndpoint = discovery.authorizationServerMetadata.registration_endpoint;
  if (!settings.dynamicRegistration || !registrationEndpoint) {
    throw new Error(
      [
        'No OAuth client is configured.',
        'Set MCP_OAUTH_CLIENT_ID or enable Dynamic Client Registration in the authorization server.',
        `This app also serves a client metadata document at ${settings.baseUrl}/client-metadata.json for CIMD testing through a public tunnel.`,
      ].join(' '),
    );
  }

  const cacheKey = [
    discovery.authorizationServerMetadata.issuer ?? discovery.authorizationServer,
    callbackUrl(),
    settings.resourceUrl,
    settings.scope,
  ].join('|');

  if (!settings.registerEveryRun && registeredClients.has(cacheKey)) {
    return registeredClients.get(cacheKey);
  }

  const response = await fetch(registrationEndpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(localClientMetadata()),
  });
  const responseText = await response.text();
  let registrationResponse;

  try {
    registrationResponse = responseText ? JSON.parse(responseText) : {};
  } catch {
    registrationResponse = { raw: responseText };
  }

  if (!response.ok) {
    const error = new Error(`Dynamic Client Registration failed with HTTP ${response.status}`);
    error.statusCode = response.status;
    error.payload = registrationResponse;
    throw error;
  }

  if (!registrationResponse.client_id) {
    throw new Error('Dynamic Client Registration response did not include client_id.');
  }

  const client = {
    source: 'dynamic_registration',
    registration_endpoint: registrationEndpoint,
    registration_response: registrationResponse,
    client_id: registrationResponse.client_id,
    client_secret: registrationResponse.client_secret,
    token_endpoint_auth_method:
      registrationResponse.token_endpoint_auth_method ||
      (registrationResponse.client_secret ? 'client_secret_post' : 'none'),
  };

  registeredClients.set(cacheKey, client);
  return client;
}

function authorizationUrl(discovery, client, state, codeChallenge) {
  const endpoint = discovery.authorizationServerMetadata.authorization_endpoint;
  if (!endpoint) {
    throw new Error('Authorization server metadata did not include authorization_endpoint.');
  }

  const url = new URL(endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', client.client_id);
  url.searchParams.set('redirect_uri', callbackUrl());
  url.searchParams.set('scope', settings.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('resource', settings.resourceUrl);
  return url.toString();
}

async function exchangeAuthorizationCode(discovery, client, code, codeVerifier) {
  const endpoint = discovery.authorizationServerMetadata.token_endpoint;
  if (!endpoint) {
    throw new Error('Authorization server metadata did not include token_endpoint.');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(),
    client_id: client.client_id,
    code_verifier: codeVerifier,
    resource: settings.resourceUrl,
  });
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  applyClientAuthentication(headers, body, client);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  });
  const responseText = await response.text();
  let payload;

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { raw: responseText };
  }

  if (!response.ok) {
    const error = new Error(`Token exchange failed with HTTP ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function refreshToken(discovery, client, tokenResponse) {
  if (!tokenResponse?.refresh_token) {
    throw new Error('No refresh_token is available.');
  }

  const endpoint = discovery.authorizationServerMetadata.token_endpoint;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokenResponse.refresh_token,
    client_id: client.client_id,
    resource: settings.resourceUrl,
  });
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  applyClientAuthentication(headers, body, client);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body,
  });
  const responseText = await response.text();
  let payload;

  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    payload = { raw: responseText };
  }

  if (!response.ok) {
    const error = new Error(`Refresh token exchange failed with HTTP ${response.status}`);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function applyClientAuthentication(headers, body, client) {
  const method = client.token_endpoint_auth_method || 'none';
  if (method === 'none') {
    return;
  }

  if (!client.client_secret) {
    throw new Error(`Client authentication method ${method} requires a client_secret.`);
  }

  if (method === 'client_secret_basic') {
    const credentials = Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64');
    headers.Authorization = `Basic ${credentials}`;
    return;
  }

  if (method === 'client_secret_post') {
    body.set('client_secret', client.client_secret);
    return;
  }

  throw new Error(`Unsupported token endpoint authentication method: ${method}`);
}

function decodeJwtPayload(token) {
  if (!token || token.split('.').length < 2) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

function redactToken(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  if (value.length <= 24) {
    return '[redacted]';
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

function redactedTokenResponse(tokenResponse) {
  if (!tokenResponse) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(tokenResponse).map(([key, value]) => [
      key,
      key.endsWith('token') ? redactToken(value) : value,
    ]),
  );
}

function redactedClient(client) {
  if (!client) {
    return undefined;
  }

  return {
    ...client,
    client_secret: client.client_secret ? '[redacted]' : undefined,
    registration_response: client.registration_response
      ? redactedTokenResponse(client.registration_response)
      : undefined,
  };
}

async function callMcp(tokenResponse, method, params = {}) {
  if (!tokenResponse?.access_token) {
    throw new Error('No access_token is available.');
  }

  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params,
  };

  const response = await fetch(settings.mcpEndpointUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${tokenResponse.access_token}`,
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': settings.mcpProtocolVersion,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: {
      'www-authenticate': response.headers.get('www-authenticate'),
      'mcp-session-id': response.headers.get('mcp-session-id'),
      'content-type': response.headers.get('content-type'),
    },
    body,
  };
}

function initializeParams() {
  return {
    protocolVersion: settings.mcpProtocolVersion,
    capabilities: {},
    clientInfo: {
      name: 'terminal49-mcp-oauth-test-client',
      version: '0.1.0',
    },
  };
}

function page(session) {
  const tokenPayload = decodeJwtPayload(session.tokenResponse?.access_token);
  const hasToken = Boolean(session.tokenResponse?.access_token);
  const messages = session.messages.splice(0);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Terminal49 MCP OAuth Test Client</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f5f7fb;
        color: #111827;
      }
      body {
        margin: 0;
      }
      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 24px;
      }
      header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 20px;
      }
      h1, h2 {
        margin: 0;
        letter-spacing: 0;
      }
      h1 {
        font-size: 24px;
        line-height: 1.2;
      }
      h2 {
        font-size: 15px;
        line-height: 1.3;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
      }
      .panel {
        background: #ffffff;
        border: 1px solid #d8dee9;
        border-radius: 8px;
        padding: 16px;
        min-width: 0;
      }
      .wide {
        grid-column: 1 / -1;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      a.button, button {
        appearance: none;
        border: 1px solid #1f2937;
        border-radius: 6px;
        background: #1f2937;
        color: #ffffff;
        cursor: pointer;
        font: inherit;
        font-size: 14px;
        line-height: 1;
        padding: 9px 12px;
        text-decoration: none;
      }
      button.secondary, a.secondary {
        background: #ffffff;
        color: #1f2937;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
      }
      dl {
        display: grid;
        grid-template-columns: 180px minmax(0, 1fr);
        gap: 8px 12px;
        margin: 12px 0 0;
      }
      dt {
        color: #4b5563;
        font-size: 13px;
      }
      dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
        font-size: 13px;
      }
      textarea, pre {
        box-sizing: border-box;
        width: 100%;
        border: 1px solid #d8dee9;
        border-radius: 6px;
        background: #0f172a;
        color: #e5e7eb;
        font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      }
      textarea {
        min-height: 140px;
        padding: 10px;
        resize: vertical;
      }
      pre {
        min-height: 220px;
        max-height: 520px;
        overflow: auto;
        padding: 12px;
        white-space: pre-wrap;
      }
      .status {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        border: 1px solid #d8dee9;
        padding: 5px 8px;
        font-size: 12px;
        background: #ffffff;
      }
      .ok {
        border-color: #047857;
        color: #047857;
      }
      .empty {
        border-color: #9ca3af;
        color: #4b5563;
      }
      .message {
        border-left: 3px solid #1f2937;
        padding: 8px 10px;
        background: #eef2ff;
        border-radius: 4px;
        margin: 0 0 10px;
        font-size: 13px;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          background: #111827;
          color: #f9fafb;
        }
        .panel, .status, button.secondary, a.secondary {
          background: #1f2937;
          border-color: #374151;
          color: #f9fafb;
        }
        button, a.button {
          border-color: #f9fafb;
          background: #f9fafb;
          color: #111827;
        }
        dt {
          color: #d1d5db;
        }
        .message {
          background: #172554;
        }
      }
      @media (max-width: 760px) {
        main {
          padding: 16px;
        }
        header, .grid {
          display: block;
        }
        .panel {
          margin-bottom: 16px;
        }
        dl {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>Terminal49 MCP OAuth Test Client</h1>
        </div>
        <span class="status ${hasToken ? 'ok' : 'empty'}">${hasToken ? 'Authorized' : 'No Token'}</span>
      </header>

      ${messages.map((message) => `<p class="message">${escapeHtml(message)}</p>`).join('')}

      <section class="grid">
        <div class="panel">
          <h2>OAuth</h2>
          <dl>
            <dt>Resource</dt>
            <dd>${escapeHtml(settings.resourceUrl)}</dd>
            <dt>MCP Endpoint</dt>
            <dd>${escapeHtml(settings.mcpEndpointUrl)}</dd>
            <dt>Metadata</dt>
            <dd>${escapeHtml(protectedResourceMetadataUrl())}</dd>
            <dt>Redirect URI</dt>
            <dd>${escapeHtml(callbackUrl())}</dd>
            <dt>Client Source</dt>
            <dd>${escapeHtml(session.client?.source ?? (settings.clientId ? 'environment' : 'pending'))}</dd>
          </dl>
          <div class="actions">
            <a class="button" href="/authorize">Authorize</a>
            <button class="secondary" type="button" onclick="loadDiscovery()">Discover</button>
            <button class="secondary" type="button" onclick="postAction('/api/refresh')" ${hasToken ? '' : 'disabled'}>Refresh</button>
            <button class="secondary" type="button" onclick="postAction('/api/clear')" ${hasToken ? '' : 'disabled'}>Clear</button>
          </div>
        </div>

        <div class="panel">
          <h2>Token</h2>
          <dl>
            <dt>Type</dt>
            <dd>${escapeHtml(session.tokenResponse?.token_type ?? '')}</dd>
            <dt>Expires In</dt>
            <dd>${escapeHtml(session.tokenResponse?.expires_in ?? '')}</dd>
            <dt>Scope</dt>
            <dd>${escapeHtml(session.tokenResponse?.scope ?? '')}</dd>
            <dt>Subject</dt>
            <dd>${escapeHtml(tokenPayload?.sub ?? '')}</dd>
            <dt>Audience</dt>
            <dd>${escapeHtml(JSON.stringify(tokenPayload?.aud ?? ''))}</dd>
            <dt>Account Claim</dt>
            <dd>${escapeHtml(tokenPayload?.['urn:terminal49:account_id'] ?? tokenPayload?.account_id ?? '')}</dd>
          </dl>
        </div>

        <div class="panel wide">
          <h2>MCP</h2>
          <div class="actions">
            <button type="button" onclick="callMcp('initialize')" ${hasToken ? '' : 'disabled'}>Initialize</button>
            <button type="button" onclick="callMcp('tools/list')" ${hasToken ? '' : 'disabled'}>Tools List</button>
            <button type="button" onclick="callMcp('prompts/list')" ${hasToken ? '' : 'disabled'}>Prompts List</button>
            <button type="button" onclick="callCustomMcp()" ${hasToken ? '' : 'disabled'}>Custom Call</button>
          </div>
          <textarea id="customPayload">{
  "method": "tools/list",
  "params": {}
}</textarea>
        </div>

        <div class="panel wide">
          <h2>Output</h2>
          <pre id="output">${escapeHtml(JSON.stringify({
            settings: visibleSettings(),
            client: redactedClient(session.client),
            token: redactedTokenResponse(session.tokenResponse),
            token_payload: tokenPayload,
            last_error: session.lastError,
          }, null, 2))}</pre>
        </div>
      </section>
    </main>
    <script>
      const output = document.getElementById('output');

      function show(payload) {
        output.textContent = JSON.stringify(payload, null, 2);
      }

      async function request(path, options = {}) {
        const response = await fetch(path, {
          headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
          ...options,
        });
        const text = await response.text();
        let payload;
        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { raw: text };
        }
        show({ status: response.status, ok: response.ok, payload });
        return { response, payload };
      }

      async function loadDiscovery() {
        await request('/api/discovery');
      }

      async function postAction(path) {
        const result = await request(path, { method: 'POST', body: '{}' });
        if (result.response.ok) {
          window.location.reload();
        }
      }

      async function callMcp(method) {
        const params = method === 'initialize'
          ? ${JSON.stringify(initializeParams())}
          : {};
        await request('/api/mcp-call', {
          method: 'POST',
          body: JSON.stringify({ method, params }),
        });
      }

      async function callCustomMcp() {
        let payload;
        try {
          payload = JSON.parse(document.getElementById('customPayload').value);
        } catch (error) {
          show({ error: error.message });
          return;
        }

        await request('/api/mcp-call', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
    </script>
  </body>
</html>`;
}

function visibleSettings() {
  return {
    base_url: settings.baseUrl,
    callback_url: callbackUrl(),
    resource_url: settings.resourceUrl,
    mcp_endpoint_url: settings.mcpEndpointUrl,
    protected_resource_metadata_url: protectedResourceMetadataUrl(),
    scope: settings.scope,
    dynamic_registration: settings.dynamicRegistration,
    configured_client_id: settings.clientId ? '[set]' : '[not set]',
    configured_client_secret: settings.clientSecret ? '[set]' : '[not set]',
  };
}

async function handleAuthorize(res, session) {
  const discovery = await discoverOAuthMetadata();
  const client = await resolveOAuthClient(discovery);
  const state = randomUrlToken(32);
  const codeVerifier = randomUrlToken(64);
  const codeChallenge = base64Url(sha256(codeVerifier));

  session.discovery = discovery;
  session.client = client;
  session.pendingStates.set(state, {
    codeVerifier,
    createdAt: Date.now(),
  });

  redirect(res, authorizationUrl(discovery, client, state, codeChallenge));
}

async function handleCallback(url, res, session) {
  const error = url.searchParams.get('error');
  if (error) {
    const description = url.searchParams.get('error_description') || error;
    throw new Error(`Authorization failed: ${description}`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    throw new Error('Callback is missing code or state.');
  }

  const pending = session.pendingStates.get(state);
  if (!pending) {
    throw new Error('OAuth state was not found.');
  }

  session.pendingStates.delete(state);
  if (Date.now() - pending.createdAt > STATE_TTL_MS) {
    throw new Error('OAuth state expired.');
  }

  const discovery = session.discovery ?? await discoverOAuthMetadata();
  const client = session.client ?? await resolveOAuthClient(discovery);
  const tokenResponse = await exchangeAuthorizationCode(discovery, client, code, pending.codeVerifier);

  session.discovery = discovery;
  session.client = client;
  session.tokenResponse = tokenResponse;
  session.messages.push('Authorization completed.');
  redirect(res, '/');
}

async function handleRefresh(res, session) {
  const discovery = session.discovery ?? await discoverOAuthMetadata();
  const client = session.client ?? await resolveOAuthClient(discovery);
  const tokenResponse = await refreshToken(discovery, client, session.tokenResponse);

  session.discovery = discovery;
  session.client = client;
  session.tokenResponse = {
    ...session.tokenResponse,
    ...tokenResponse,
    refresh_token: tokenResponse.refresh_token ?? session.tokenResponse?.refresh_token,
  };
  sendJson(res, 200, {
    token: redactedTokenResponse(session.tokenResponse),
    token_payload: decodeJwtPayload(session.tokenResponse.access_token),
  });
}

async function handleMcpCall(req, res, session) {
  const body = await readBody(req);
  const method = body.method || 'tools/list';
  const params = body.params ?? {};
  const result = await callMcp(session.tokenResponse, method, params);
  sendJson(res, result.ok ? 200 : 502, result);
}

function clearSession(session) {
  session.pendingStates.clear();
  session.tokenResponse = undefined;
  session.discovery = undefined;
  session.client = undefined;
  session.messages.push('Session cleared.');
}

async function route(req, res) {
  const session = getSession(req, res);
  const url = new URL(req.url, settings.baseUrl);

  try {
    if (req.method === 'GET' && url.pathname === '/') {
      sendHtml(res, 200, page(session));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/healthz') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/client-metadata.json') {
      sendJson(res, 200, localClientMetadata());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/discovery') {
      const discovery = await discoverOAuthMetadata();
      session.discovery = discovery;
      sendJson(res, 200, discovery);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/authorize') {
      await handleAuthorize(res, session);
      return;
    }

    if (req.method === 'GET' && url.pathname === settings.callbackPath) {
      await handleCallback(url, res, session);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      await handleRefresh(res, session);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/mcp-call') {
      await handleMcpCall(req, res, session);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/clear') {
      clearSession(session);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    const payload = {
      error: error.message,
      status_code: error.statusCode,
      payload: error.payload,
    };
    session.lastError = payload;
    console.error(JSON.stringify({ event: 'oauth_test_client.error', ...payload }));

    if (req.headers.accept?.includes('text/html')) {
      session.messages.push(error.message);
      sendHtml(res, 500, page(session));
      return;
    }

    sendJson(res, 500, payload);
  }
}

const server = createServer((req, res) => {
  void route(req, res);
});

server.listen(settings.port, settings.host, () => {
  const localUrl = `http://${settings.host}:${settings.port}`;
  console.log(`MCP OAuth test client listening on ${localUrl}`);
  console.log(`Browser URL: ${settings.baseUrl}`);
  console.log(`Redirect URI: ${callbackUrl()}`);
  console.log(`MCP resource: ${settings.resourceUrl}`);
});
