# MCP OAuth Test Client

Run a local OAuth 2.1 client for the hosted MCP flow:

```sh
node packages/mcp/scripts/oauth-test-client.mjs
```

Open `http://localhost:8787`, click `Authorize`, complete the WorkOS flow, then use the MCP buttons to call the resource with the issued access token.

## WorkOS prerequisites

In the WorkOS environment used by `WORKOS_AUTHORIZATION_SERVER_URL`:

- Enable MCP Auth with Client ID Metadata Document (CIMD). Keep Dynamic Client Registration (DCR) enabled for clients that do not yet support CIMD.
- Add `https://mcp.terminal49.com` as an MCP resource indicator.

Without the resource indicator, WorkOS issues the environment default audience instead of the MCP resource audience, and Terminal49 rejects the token.

## Defaults

- Client URL: `http://localhost:8787`
- Redirect URI: `http://localhost:8787/callback`
- MCP resource: `https://mcp.terminal49.com`
- Scope: `openid profile email offline_access`
- Client auth: public client with PKCE

## Environment

```sh
MCP_OAUTH_RESOURCE_URL=https://mcp.terminal49.com \
MCP_OAUTH_CLIENT_BASE_URL=http://localhost:8787 \
node packages/mcp/scripts/oauth-test-client.mjs
```

Useful overrides:

- `PORT`: local port, default `8787`
- `HOST`: local bind host, default `127.0.0.1`
- `MCP_OAUTH_RESOURCE_URL`: MCP resource URI, sent as the OAuth `resource` parameter
- `MCP_OAUTH_MCP_ENDPOINT_URL`: MCP HTTP endpoint to call after OAuth, defaults to `MCP_OAUTH_RESOURCE_URL`
- `MCP_OAUTH_PROTECTED_RESOURCE_METADATA_URL`: explicit protected-resource metadata URL
- `MCP_OAUTH_AUTHORIZATION_SERVER_URL`: explicit authorization server issuer
- `MCP_OAUTH_SCOPE`: OAuth scopes
- `MCP_OAUTH_CLIENT_ID`: manually configured OAuth client id
- `MCP_OAUTH_CLIENT_SECRET`: optional client secret
- `MCP_OAUTH_CLIENT_AUTH_METHOD`: `none`, `client_secret_post`, or `client_secret_basic`
- `MCP_OAUTH_DYNAMIC_REGISTRATION`: set `false` to disable DCR

## Registration Modes

By default the client discovers the authorization server from `/.well-known/oauth-protected-resource` and uses Dynamic Client Registration if the metadata exposes `registration_endpoint`.

Use DCR or CIMD for MCP testing. A manually configured `MCP_OAUTH_CLIENT_ID` is useful for generic OAuth client testing, but may not exercise WorkOS' MCP resource-indicator behavior.

For CIMD testing, the app serves metadata at:

```txt
http://localhost:8787/client-metadata.json
```

Because WorkOS cannot fetch your localhost URL from the cloud, expose this through a public HTTPS tunnel and use that tunnel URL as the OAuth `client_id`.
