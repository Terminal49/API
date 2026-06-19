# Local Development & Testing with Claude

Two ways to test the Terminal49 MCP server locally with Claude Desktop. Pick by
what you want to exercise.

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

## Full WorkOS OAuth (not needed for tool testing)

The WorkOS Bearer/OAuth path (`T49_MCP_AUTHKIT_ENABLED=true`) can't be fully
reproduced on plain `localhost`: WorkOS must reach your gateway over HTTPS and the
OAuth `resource` must be an HTTPS URL registered as a Resource Indicator. To test
it, expose the gateway via a tunnel and use the registered HTTPS URL as the
resource — see [WORKOS_MCP_SETUP.md](./WORKOS_MCP_SETUP.md) and
[OAUTH_TEST_CLIENT.md](./OAUTH_TEST_CLIENT.md). Tool calls themselves never need
this; use Path 1 or 2.

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
