# Local Development & Testing with Claude

Three ways to test the Terminal49 MCP server locally with Claude Desktop. Pick by
what you want to exercise: **Path 1** the tools (stdio), **Path 2** the gateway +
passthrough auth, **Path 3** the real WorkOS OAuth (MCP auth).

> Claude Desktop **cannot reach `http://localhost` over an HTTP connector** — its
> remote connectors route through Anthropic's backend (`160.79.104.0/21`), which
> can't see your machine. So both local paths run a process **on your machine**:
> Path 1 runs the MCP server directly; Path 2 uses `mcp-remote` as a local
> stdio↔HTTP bridge to your gateway.

Substitute `<REPO>` with your checkout path (`git rev-parse --show-toplevel`),
and `<T49_API_KEY>` with a key from <https://app.terminal49.com/developers/api-keys>.
Claude Desktop config lives at
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).

---

## Path 1 — direct stdio (simplest; tests the tools)

Claude Desktop spawns the MCP server as a subprocess. It talks **straight to the
t49 API** — no gateway, no OAuth. Best for iterating on tool behavior.

```sh
# build once (stable spawn; GUI apps have a minimal PATH)
npm run build --workspace @terminal49/mcp
```

```jsonc
{
  "mcpServers": {
    "terminal49-local": {
      "command": "node",
      "args": ["<REPO>/packages/mcp/dist/index.js"],
      "env": {
        "T49_API_TOKEN": "<T49_API_KEY>",
        "T49_API_BASE_URL": "http://localhost:3000/v2"
      }
    }
  }
}
```

- Point `T49_API_BASE_URL` at your **local t49** (Rails default `:3000`), or drop
  it to use prod `https://api.terminal49.com/v2`.
- If Claude Desktop reports `node` not found, use the absolute path (`which node`).
- Live-reload variant (no build): `"command": "npx", "args": ["-y","tsx","<REPO>/packages/mcp/src/index.ts"]`.

Restart Claude Desktop, then ask: *"List the Terminal49 tools"* and
*"Track container CAIU1234567 with Maersk."*

---

## Path 2 — full local stack (Claude → gateway → t49)

Exercises the **HTTP gateway** (`api/mcp.ts`) and its auth resolution, matching
production wiring. `mcp-remote` runs locally and bridges Claude's stdio to your
local gateway over HTTP.

**1. Run t49 locally** (the other repo) on `:3000`.

**2. Run the gateway** (this repo). It defaults to `:3000`, so use a different
port to avoid clashing with t49:

```sh
vercel link            # once — pick terminal49/api
cp .env.local.example .env.local   # then edit (see that file)
vercel dev --listen 4000
```

**3. Point Claude at the gateway** via `mcp-remote` (passthrough auth: the
`Token` scheme forwards your API key straight through, AuthKit stays off):

```jsonc
{
  "mcpServers": {
    "terminal49-gateway-local": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "http://localhost:4000/mcp",
        "--header", "Authorization: Token <T49_API_KEY>"
      ]
    }
  }
}
```

This path tests gateway routing + auth + the tools, end to end, against local t49.

---

## Path 3 — WorkOS OAuth (the real MCP auth)

Drives the production auth path: the client runs the OAuth flow against WorkOS,
gets a Bearer access token, and the gateway exchanges it at
`/connected-clients/resolve` for the t49 API token + account id. No API key.

**Prerequisites**
- Local **t49** running with the `/connected-clients/resolve` endpoint (PR #2321),
  validating the token audience and sharing `T49_CONNECTED_CLIENTS_RESOLVE_SECRET`.
- A **WorkOS dev environment** with DCR enabled and a Resource Indicator
  registered (see [WORKOS_MCP_SETUP.md](./WORKOS_MCP_SETUP.md)). The indicator must
  equal the gateway's advertised `resource`.

**Why a tunnel.** WorkOS Resource Indicators are HTTPS, the PRM `resource_metadata`
URL must be fetchable by the client, and a native Claude Desktop connector
(Anthropic's backend) can't reach localhost. So expose the local gateway over
HTTPS:

```sh
cloudflared tunnel --url http://localhost:4000   # → https://<sub>.trycloudflare.com
# or: ngrok http 4000   (use a reserved domain for a URL that survives restarts)
```

Register that HTTPS URL in WorkOS as the Resource Indicator.

**Gateway env** (`.env.local`, then `vercel dev --listen 4000`):

```sh
T49_MCP_AUTHKIT_ENABLED=true
WORKOS_AUTHORIZATION_SERVER_URL=https://<your-tenant>.authkit.app
WORKOS_MCP_RESOURCE=https://<tunnel>          # == the registered Resource Indicator
T49_CONNECTED_CLIENTS_RESOLVE_SECRET=<matches local t49>
T49_API_BASE_URL=http://localhost:3000/v2     # local t49
```

**Drive the OAuth flow — three options:**

1. **Claude Desktop native connector (most realistic).** Settings → Connectors →
   Add custom connector → `https://<tunnel>`. Anthropic's backend runs DCR + PKCE,
   you consent in the browser, and it connects — exactly the real ChatGPT/Claude
   experience.
2. **`mcp-remote` (local OAuth client, best for debugging).** No `--header` — it
   *does* the OAuth instead of forwarding a key:
   ```jsonc
   { "command": "npx", "args": ["-y", "mcp-remote", "https://<tunnel>/mcp"] }
   ```
   It discovers the PRM, registers via DCR, opens a browser, stores the token, and
   calls the gateway — you watch the whole flow on your machine.
3. **Bundled test client (inspect the token).**
   ```sh
   MCP_OAUTH_RESOURCE_URL=https://<tunnel> \
   MCP_OAUTH_MCP_ENDPOINT_URL=https://<tunnel>/mcp \
   node packages/mcp/scripts/oauth-test-client.mjs
   ```

If `resolve` rejects the token, decode it: the `aud` claim must equal
`WORKOS_MCP_RESOURCE` == the WorkOS Resource Indicator == what the client sent as
`resource`. That three-way match is the whole game.

> Doing tool work, not auth? Use Path 1 or 2 — they don't need any of this.

---

## Quick verification (no Claude needed)

```sh
# stdio server boots and lists tools (no API token needed for tools/list):
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | T49_API_TOKEN=smoke npx tsx packages/mcp/src/index.ts | grep -o '"name":"[a-z_]*"'

# gateway (Path 2) responds over HTTP:
curl -s -X POST http://localhost:4000/mcp -H 'Authorization: Token <T49_API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 400
```

Or drive either with the MCP Inspector: `npx @modelcontextprotocol/inspector`.
