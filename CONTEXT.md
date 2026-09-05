# Context

The domain language of this repository, and the boundaries between the things
it ships. Use these words; don't invent synonyms.

> This is a **public** repository. Nothing here may contain API keys, customer
> names, account identifiers, or internal URLs.

## What ships from here

Three products with independent release paths:

| Product | Lives in | Ships to |
| --- | --- | --- |
| **Documentation** | `docs/` | Mintlify site, via the hosted Git integration |
| **MCP server + OAuth gateway** | `packages/mcp/`, `api/` | `mcp.terminal49.com` on Vercel |
| **TypeScript SDK** | `sdks/typescript-sdk/` | npm, as `@terminal49/sdk` |

The **Terminal49 API** itself (`api.terminal49.com/v2`) is a Rails application
in a **different repository**. Everything here is a client of it or a
description of it. Any change that needs a new endpoint or a new field on an
existing endpoint is cross-repo work, and an issue for it belongs to a human.

## Shipping vocabulary

- **Container** — a physical ocean container, identified by a container number
  (e.g. `CAIU2885402`). The unit most Terminal49 customers care about.
- **Shipment** — the carrier's grouping of containers under one **BOL** (bill of
  lading) or booking number. One shipment holds one or more containers.
- **Tracking request** — the record created when someone asks Terminal49 to
  start watching a number. It resolves into a shipment and its containers, or
  fails with a reason. Creating one is the only write the MCP server performs.
- **SCAC** — the four-letter carrier code (`MAEU` = Maersk). Carriers are
  addressed by SCAC everywhere, never by display name.
- **POL / POD** — port of lading / port of discharge.
- **Terminal** — the facility at a port that actually holds the container. A
  container's availability and holds are terminal-level facts, not carrier-level.
- **Transport event** — a carrier or terminal milestone: vessel loaded,
  departed, arrived, discharged, rail departed, delivered, empty returned.
  The event timeline is the primary evidence for where a container is.
- **LFD** — last free day. The deadline for pickup before **demurrage** accrues.
- **Demurrage / detention** — late fees, at the terminal and after pickup
  respectively.
- **Hold** — a customs, freight, or terminal block that prevents pickup even
  when the container has been discharged.
- **Route** — the multi-leg vessel itinerary, including transshipment ports.
  Route data is a **paid feature** and is not enabled on every account.

Carrier and terminal data is live and changes between calls. Two reads minutes
apart legitimately disagree; never treat a difference as a bug without checking
timestamps.

## MCP vocabulary

- **Tool** — one callable capability registered on the MCP server
  (`packages/mcp/src/tools/`). Ten today, one of which (`track_container`)
  writes.
- **Resource** — static reference content the server exposes for the model to
  read rather than call (`packages/mcp/src/resources/`): the milestone glossary,
  list-display guidance, query guidance.
- **`_response_contract`** — the steering block every tool result carries:
  presentation guidance, display hints (preferred format, default columns,
  column sets, sort), suggested follow-ups, and whether the total is reliable.
  It steers the calling model; it is not content to show the end user.
- **Canonical chain** — `search_container` to resolve an identifier into
  Terminal49 UUIDs, then `get_container` / `get_shipment_details` for a
  snapshot, then `get_container_transport_events` for the timeline. Fleet-level
  questions start at the `list_*` tools instead.

## Gateway vocabulary

The gateway (`api/`) is an OAuth 2.1 **Resource Server**. **WorkOS** is the
Authorization Server. Follow RFC 9728 / 8414 / 8707 / 6750.

- **Resource identifier** — the root origin `https://mcp.terminal49.com`, never
  the `/mcp` path. It has exactly one definition, in
  `packages/mcp/src/resource.ts`, so the PRM document and the
  `WWW-Authenticate` challenge can never diverge. Do not reintroduce per-file
  derivation.
- **PRM** — the RFC 9728 Protected Resource Metadata document served at
  `/.well-known/oauth-protected-resource`.
- **Connected client resolve** — the backend call that exchanges a caller's
  WorkOS access token for a Terminal49 API token plus an **account id**. Token
  audience enforcement happens in the backend, not here.
- **Three auth paths** — WorkOS AuthKit resolution, env-token plus client
  secret, and pass-through. All three end at a Terminal49 API token that scopes
  every subsequent call to one account.
- **Account id** — the Terminal49 account a request is acting on. The gateway
  already resolves it on the AuthKit path and currently spends it only on
  analytics; no MCP tool reports it back to the caller.

Never log a token. Return generic auth errors to clients and keep the detail in
the server log, correlated by request id.

## Conventions that bite

- `sdks/typescript-sdk/src/generated/**`, `docs/sdk/reference/**`, and
  `Terminal49-API.postman_collection.json` are **generated**. Change the source
  (`docs/openapi.json`) and regenerate.
- `CLAUDE.md` and `claude.md` are symlinks to `AGENTS.md`. There is one file.
- Vite+ resolves only the **root** `vite.config.ts` in this monorepo.
  Workspace-level configs are silently ignored.
