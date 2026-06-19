# WorkOS MCP Auth — Production Setup

How to configure WorkOS AuthKit + the Vercel deployment so ChatGPT and Claude
connectors can authenticate against `https://mcp.terminal49.com`.

The gateway is an OAuth 2.1 **Resource Server**; WorkOS AuthKit is the
**Authorization Server**. The gateway's code is spec-compliant on its own — the
items below are dashboard/env config that gate whether clients can connect. Any
one of them, missing, silently breaks the connection.

Canonical reference: <https://workos.com/docs/authkit/mcp>

## Canonical connector URL

Use the **root origin** as the connector URL everywhere:

```
https://mcp.terminal49.com
```

The server also responds at `/mcp` and `/api/mcp`, but the root origin is the
OAuth **resource identifier**. The entered URL, the PRM `resource`, the WorkOS
Resource Indicator, and the token `aud` must all be this exact string. Using
`/mcp` risks a client deriving `resource=…/mcp`, which won't match and gets the
token rejected.

## 1. WorkOS dashboard

In the WorkOS environment referenced by `WORKOS_AUTHORIZATION_SERVER_URL`:

- [ ] **Dynamic Client Registration (DCR)** — *Connect → Configuration*. **Off by
  default.** ChatGPT relies on it; Claude uses DCR or CIMD. Without it, neither
  client can self-register and the connection fails.
- [ ] **Client ID Metadata Document (CIMD)** — optional but recommended; reduces
  Claude's per-connection client sprawl. Requires the AS metadata to advertise
  `client_id_metadata_document_supported: true` and `none` in
  `token_endpoint_auth_methods_supported`.
- [ ] **Resource Indicator** — register `https://mcp.terminal49.com` exactly.
  This is load-bearing: without it WorkOS mints the environment-default audience,
  the token `aud` won't match, and `/connected-clients/resolve` rejects every
  token. Register any staging/preview resource hosts you also expect.
- [ ] **Redirect URIs** — automatic with DCR. If you pin clients (CIMD /
  pre-registered), allowlist `https://claude.ai/api/mcp/auth_callback`,
  `https://claude.com/api/mcp/auth_callback`, the ChatGPT connector callback, and
  `http://localhost`/`http://127.0.0.1` loopback for Claude Code.

## 2. Vercel environment variables

| Variable | Value | Why |
|----------|-------|-----|
| `WORKOS_AUTHORIZATION_SERVER_URL` (or `WORKOS_ISSUER`) | the AuthKit issuer **origin** (no path) | Clients fetch AS metadata at `<issuer>/.well-known/oauth-authorization-server` |
| `WORKOS_MCP_RESOURCE` | `https://mcp.terminal49.com` | **Pin it** so the resource is never Host-derived (preview domains would mint the wrong audience) |
| `T49_MCP_AUTHKIT_ENABLED` | `true` | Otherwise a WorkOS `Bearer` token is treated as a passthrough API key and fails |
| `T49_CONNECTED_CLIENTS_RESOLVE_SECRET` | the resolve shared secret | Required to call `/connected-clients/resolve` |
| `T49_MCP_ALLOWED_HOSTS` | include `mcp.terminal49.com` (if set at all) | Host allowlist; missing host → 403 |
| `T49_MCP_SCOPES_SUPPORTED` | **leave unset** | WorkOS only issues `openid/profile/email/offline_access`; advertising `mcp:tools` etc. causes `invalid_scope` |

## 3. Smoke tests

```sh
ISSUER="<WORKOS_AUTHORIZATION_SERVER_URL>"

# AS metadata: 200 with registration_endpoint + S256
curl -s "$ISSUER/.well-known/oauth-authorization-server" \
  | jq '{registration_endpoint, code_challenge_methods_supported}'

# DCR is open: expect 201 + client_id
curl -s -X POST "$ISSUER/oauth2/register" \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"smoke","redirect_uris":["https://example.com/cb"],"grant_types":["authorization_code"],"response_types":["code"]}'

# PRM: resource + authorization_servers
curl -s https://mcp.terminal49.com/.well-known/oauth-protected-resource | jq

# 401 challenge points at the PRM
curl -si https://mcp.terminal49.com/mcp | grep -i www-authenticate

# After an OAuth flow, decode the access token and confirm:
#   aud == https://mcp.terminal49.com
```

## 4. Per-client notes

- **ChatGPT (Apps SDK)** and **Claude connectors** connect **server-side** — no
  browser CORS concerns. Both use PRM discovery; the 401 + `WWW-Authenticate`
  challenge drives the flow. Connector URL = `https://mcp.terminal49.com`.
- **claude.ai / Claude Desktop cannot paste a static API key** — they must use
  the WorkOS OAuth flow. The `Token`-scheme passthrough and `T49_MCP_CLIENT_SECRET`
  paths only serve the Anthropic **Messages API** connector and non-Claude clients.
- **Anthropic Messages API connector** forwards a pre-obtained token; it needs
  header `anthropic-beta: mcp-client-2025-11-20`, and that token must carry the
  `https://mcp.terminal49.com` audience.
- **Rollout:** existing API-key users on `Authorization: Bearer <key>` (old docs)
  break the moment `T49_MCP_AUTHKIT_ENABLED=true`. Migrate them to the `Token`
  scheme **before** enabling AuthKit.

See [OAUTH_TEST_CLIENT.md](./OAUTH_TEST_CLIENT.md) to exercise the full flow locally.
