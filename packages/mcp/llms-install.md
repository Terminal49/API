# Installing the Terminal49 MCP server (for Cline and other AI agents)

Terminal49 is a **hosted, remote** MCP server. There is nothing to clone, build,
or run locally, and there are **no API keys or environment variables**. The user
signs in with their own Terminal49 account through OAuth in the browser.

- Server URL: `https://mcp.terminal49.com`
- Transport: Streamable HTTP
- Auth: OAuth 2.1 with PKCE (S256) and dynamic client registration, issued by
  `https://auth.terminal49.com`. The client discovers it from the server's
  `401` response (`WWW-Authenticate: resource_metadata=...`) and
  `https://mcp.terminal49.com/.well-known/oauth-protected-resource`.
- Docs: https://terminal49.com/docs/mcp/home

## Steps for Cline

1. Do not clone this repository or run `npm install`. The server is already hosted.
2. Add this entry under `mcpServers` in Cline's MCP settings file
   (`cline_mcp_settings.json`; in the IDE: MCP Servers → Configure →
   Configure MCP Servers; CLI: `~/.cline/data/settings/cline_mcp_settings.json`).
   Merge it with any servers already there; do not overwrite them.

   ```json
   {
     "mcpServers": {
       "terminal49": {
         "type": "streamableHttp",
         "url": "https://mcp.terminal49.com",
         "disabled": false,
         "autoApprove": []
       }
     }
   }
   ```

   Alternatively, in the Cline panel open **MCP Servers → Remote Servers**,
   enter the name `terminal49`, the URL `https://mcp.terminal49.com`, choose
   **Streamable HTTP**, and click **Add Server**.

3. Do **not** add an `Authorization` header and do not ask the user for an API
   key or token. Leave `oauthClient` unset: the authorization server supports
   dynamic client registration, so Cline registers itself.
4. When Cline reports that the server needs authorization, start the OAuth flow
   (the **Authorize** / **Authenticate** action on the server). A browser window
   opens at `auth.terminal49.com`. The user signs in with their Terminal49
   account and approves access. Tell the user this step needs them.
5. Verify the connection by calling the `whoami` tool. It returns the
   Terminal49 account the session is scoped to. Then try a lookup such as
   `search_container` with a container, booking or bill of lading number.

If the user doesn't have a Terminal49 account, they can sign up at
https://terminal49.com.

## What the user can ask

- "Where is container MSCU1234567, and when is its last free day?"
- "Which of my containers have holds at the terminal?"
- "What's arriving at Long Beach this week?"
- "Start tracking bill of lading MAEU123456789."

Lookup tools are read-only. `track_container` starts tracking a number the user
provides. Only call `set_party_role` or `set_custom_field` when the user
explicitly asks to change a record.

## Troubleshooting

- **401 Unauthorized:** the OAuth step hasn't been completed or the token
  expired. Re-run the authorization action; do not add a manual header.
- **Transport errors:** make sure `"type": "streamableHttp"` is set. Without it
  Cline defaults to the legacy SSE transport, which this server does not use.
- **A tool returns "not enabled":** some data (for example trade intelligence)
  is only available on accounts that have it turned on. Call `whoami` to see
  which features the account has.
