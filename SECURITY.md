# Security policy

## Report a vulnerability

Report security issues privately. Do not open a public issue or pull request.

- Preferred: use GitHub's [private vulnerability reporting](https://github.com/Terminal49/API/security/advisories/new) for this repository.
- Or email [support@terminal49.com](mailto:support@terminal49.com) with "Security" in the subject.

Include what you found, the steps to reproduce it, and the affected component, such as the API, the MCP server at `mcp.terminal49.com`, the TypeScript SDK, or the CLI. We acknowledge reports and keep you informed while we investigate.

## Scope

This repository contains the public API docs, the OpenAPI spec, the TypeScript SDK (`@terminal49/sdk`), the CLI (`@terminal49/cli`), and the MCP server with its OAuth gateway. We support the latest published version of each package.

## Secrets

Never commit API keys, tokens, or customer data. Secret scanning and push protection are enabled on this repository. If you commit a credential by mistake, revoke it in the [developer portal](https://app.terminal49.com/developers/api-keys) and tell us.
