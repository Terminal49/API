# AskT49 for Microsoft 365 Copilot

Maintain and provision the AskT49 declarative agent for Microsoft 365 Copilot.
Microsoft hosts the agent and calls `https://mcp.terminal49.com` using the user's
OAuth connection. Tool definitions are discovered from the server at runtime.

This directory owns the Microsoft app manifests, instructions, icons, and
provisioning configuration. The MCP server and gateway remain in `packages/mcp/`
and `api/`; they own tools and authentication. This integration has no hosted
runtime, npm workspace, or copied tool catalog. Microsoft's Agents Toolkit
packages and validates the app. It is independent of any Teams bot.

## Provision a development installation

You need Node 24, a Microsoft 365 account with Copilot access and custom app
upload enabled, and a Terminal49 account. Run commands from this directory.

1. Copy the environment templates once. Preserve these files on subsequent
   runs so updates reuse the existing app and OAuth registration.

   ```sh
   cp env/.env.dev.example env/.env.dev
   cp env/.env.dev.user.example env/.env.dev.user
   chmod 600 env/.env.dev.user
   ```

2. Obtain a confidential OAuth client from the Terminal49 authorization service
   (WorkOS), or reuse the client from an existing installation. Configure:

   | Setting | Value |
   | --- | --- |
   | Redirect URI | `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect` |
   | Grant types | `authorization_code`, `refresh_token` |
   | Response type | `code` |
   | Token endpoint authentication | `client_secret_post` |
   | Scopes | `openid profile email offline_access` |

   Set its client ID and secret in `env/.env.dev.user`. Neither environment
   files nor generated packages are committed. Do not put credentials in the
   manifests; the plugin contains only a Microsoft OAuth vault reference.

3. Sign in to Microsoft and provision:

   ```sh
   npx --yes --package @microsoft/m365agentstoolkit-cli@1.1.18 atk auth login m365
   npx --yes --package @microsoft/m365agentstoolkit-cli@1.1.18 atk provision --env dev
   ```

   Provisioning registers the app and OAuth configuration, packages and validates
   it, and installs it for Microsoft 365 testing. It writes the registration IDs
   to the local environment. The final `oauth/update` step keeps an existing
   registration aligned, because `oauth/register` only creates new records.

4. Open AskT49 in Microsoft 365 Copilot, connect your Terminal49 account, and ask
   whether a shipping line is supported. Confirm a successful tool result in
   Copilot's developer diagnostics (`-developer on`).

## Package an existing installation

After editing manifests or instructions, increment `appPackage/manifest.json`'s
`version`. Use the same environment to preserve the installed app identity.

```sh
npx --yes --package @microsoft/m365agentstoolkit-cli@1.1.18 atk package --env dev
npx --yes --package @microsoft/m365agentstoolkit-cli@1.1.18 atk validate --package-file appPackage/build/appPackage.dev.zip
```

The ZIP contains three resolved manifests and two icons. Inspect it before
sharing; it must not contain environment files, credentials, or a tool catalog.
Run `atk provision --env dev` again to update the test installation.

## OAuth compatibility and release checks

Microsoft requires `applicableToApps: AnyApp` for remote MCP OAuth. Binding the
registration to a Teams or Microsoft 365 app ID caused `TokenFetchFailed` app-ID
mismatches during testing. `targetAudience: HomeTenant` restricts the
development registration to your Microsoft tenant. PKCE remains enabled.

For cross-tenant distribution, create a separate release environment and OAuth
client, set `TEAMSFX_ENV` to that environment's name and
both `targetAudience` entries in `m365agents.yml` to `AnyTenant`, and provision
with the matching `--env`.
The app's display name remains **AskT49**. Store submission is a separate Partner
Center operation; provisioning does not publish a public listing.

Initial OAuth and a carrier lookup passed in Copilot. Version 1.0.3 also passed
dynamic discovery in a fresh chat using an existing connection: the carrier tool
returned `200 OK` for Hapag-Lloyd / HLCU. Version 1.0.4 names the app AskT49.
Before public submission, verify fresh-user dynamic sign-in, container and fleet
queries, account isolation, expired-session reconnect, and declined write
confirmation. Use demo records for writes. Agent instructions are guidance;
Terminal49 must enforce authorization and write permissions on the server.

- [Microsoft MCP plugins](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/build-mcp-plugins)
- [Microsoft OAuth configuration](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/plugin-authentication-oauth)
