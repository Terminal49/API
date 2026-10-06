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
| `POSTHOG_PROJECT_API_KEY` | the PostHog project API key | Enables MCP tool-usage analytics. **Leave unset and the integration is inert** — no client, no network call |
| `POSTHOG_HOST` | optional; defaults to `https://f.terminal49.com` | First-party ingestion proxy, same host the docs site uses (`docs/docs.json`) |
| `POSTHOG_ENABLED` | optional; defaults to `true` | Set `false` to kill-switch analytics without removing the key |
| `POSTHOG_DEBUG` | optional; defaults to `false` | Verbose PostHog client logging; leave off in production |

## 3. Smoke tests

### Automated metadata smoke

```sh
ISSUER="<WORKOS_AUTHORIZATION_SERVER_URL>"

# AS metadata: 200 with registration_endpoint, S256, and refresh support
curl --fail --silent --show-error --location \
  "$ISSUER/.well-known/oauth-authorization-server" \
  | jq --exit-status '
      .registration_endpoint != null
      and (.code_challenge_methods_supported // [] | index("S256")) != null
      and (.grant_types_supported // [] | index("refresh_token")) != null
      and (.scopes_supported // [] | index("offline_access")) != null
    ' > /dev/null

# DCR is open: expect 201 + client_id. A refresh-capable client must register
# both authorization_code and refresh_token.
curl --fail --silent --show-error -X POST "$ISSUER/oauth2/register" \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"smoke","redirect_uris":["https://example.com/cb"],"grant_types":["authorization_code","refresh_token"],"response_types":["code"],"token_endpoint_auth_method":"none"}' \
  | jq --exit-status '.client_id != null' > /dev/null

# PRM: resource + authorization_servers
curl -s https://mcp.terminal49.com/.well-known/oauth-protected-resource | jq

# 401 challenge points at the PRM (must be POST — a GET to /mcp returns 405)
curl -si -X POST https://mcp.terminal49.com/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -i www-authenticate

# After an OAuth flow, decode the access token and confirm:
#   aud == https://mcp.terminal49.com
```

CI follows the preview deployment's authorization-server metadata redirect and
fails if `grant_types_supported` omits `refresh_token` or `scopes_supported`
omits `offline_access`. These capabilities belong in the WorkOS authorization
server metadata, not the Terminal49 Protected Resource Metadata (PRM).

### Human refresh smoke

Refresh requires a real user authorization. Do not store a user password in CI.
Run the local [OAuth test client](./OAUTH_TEST_CLIENT.md), which requests
`openid profile email offline_access` and registers both
`authorization_code` and `refresh_token` grant types.

1. Click **Authorize** and complete the WorkOS sign-in.
2. In the redacted token output, confirm the response contains a
   `refresh_token` and the access token `aud` is
   `https://mcp.terminal49.com`.
3. Click **Refresh**. The client posts `grant_type=refresh_token`, the current
   refresh token, and `resource=https://mcp.terminal49.com` to the discovered
   token endpoint using the same registered client.
4. Confirm the refreshed response contains a new `access_token` whose `aud`
   is still `https://mcp.terminal49.com`.
5. Click **Tools List** and confirm `tools/list` succeeds with the refreshed
   bearer token.
6. If WorkOS returns a replacement `refresh_token`, retain it for the next
   refresh. The local test client does this automatically; it keeps the
   previous refresh token only when the response omits a replacement.

The test client redacts tokens and client secrets in its browser output. Do not
copy credentials into CI output, shared shell history, or issue comments.

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
