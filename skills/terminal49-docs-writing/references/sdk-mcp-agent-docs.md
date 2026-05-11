# SDK, MCP, And Agent-Facing Docs

Use this guide for `docs/sdk/**`, `docs/mcp/**`, and docs intended for AI agents or developer tools.

## SDK docs

SDK docs should answer:

- How to install the package.
- Which runtime versions are supported.
- How to authenticate.
- How SDK methods map to REST API endpoints.
- How errors map to API responses.
- Where to find package metadata, source code, versioning, and license information.

Rules:

- Link to the npm package and public GitHub repo when available.
- State unsupported runtimes explicitly if support is not documented.
- Keep generated TypeScript API reference factual; avoid hand-editing generated output unless the generation source is unavailable.
- For quickstarts, show one complete path and link to method/reference pages for detail.

## MCP docs

MCP docs should be tool-setup focused and client-neutral:

- Include macOS, Windows, and Linux config paths when documenting local client setup.
- Include a generic "any MCP client" section with server URL and auth shape.
- Use canonical auth language unless a protocol-specific compatibility note is required.
- Map MCP tools to equivalent REST endpoints where useful.
- State paid feature/entitlement requirements for route or vessel tools.

## Agent-facing docs

Agent-facing pages should optimize for retrieval and precision:

- Use canonical event names, endpoint paths, and object names.
- Prefer compact tables for exact values.
- Avoid vague claims that agents cannot verify.
- Link to `llms.txt` or `llms-full.txt` only if those paths are actually served.
- Say when information is unavailable rather than inventing it.

## Checklist

- Are install commands and imports current?
- Are package/source links discoverable?
- Are client config paths cross-platform?
- Are REST equivalents linked?
- Are paid features and non-entitled behavior documented?
