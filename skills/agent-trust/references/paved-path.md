# Paved extension path

Use these sequences. Do not create a second registration, build, test, or
generation path.

## Add or change an OpenAPI endpoint

1. Edit `docs/openapi.json`, the API contract source of truth.
2. Run `npm run generate:types --workspace @terminal49/sdk`.
3. Add or update the SDK manager method and fixture-backed tests.
4. Update the relevant non-generated docs page. Regenerate SDK reference docs
   only through the existing docs script.
5. Update `feature-map.json` only when a public SDK package export or docs route
   changes.
6. Run `npm run agent-verify`.

## Add a package

1. Place it under `packages/*` or `sdks/*`.
2. Provide `build`, `type-check`, `test`, `lint`, and `format` scripts using the
   shared Vite+ stack. Keep lint and format configuration at the repository
   root; package-level Vitest configuration is allowed.
3. Add workspace dependencies normally so npm and Vite+ can see the dependency
   graph. If generated declarations are required, preserve explicit build
   ordering in the root task.
4. Update the root lockfile only. A standalone lockfile is allowed solely for a
   package whose consumer-compatibility CI installs it outside the workspace.
5. Add the package to CI and run `npm run agent-verify`.

## Add an MCP tool

1. Add one executor in `packages/mcp/src/tools/<tool-name>.ts`.
2. Register its name, schemas, annotations, and handler once in
   `packages/mcp/src/server.ts`.
3. Add behavior and contract coverage in
   `packages/mcp/src/tools/contracts.test.ts`. Test through the registered MCP
   surface when transport behavior changes.
4. Add the tool to `skills/agent-trust/feature-map.json`.
5. Update MCP docs when the public capability or recommended chaining changes.
6. Run `npm run agent-verify`; the final protocol step must report the updated
   tool count.

## Update the map

Change `skills/agent-trust/feature-map.json` in the same commit as an MCP tool,
SDK package export, or non-generated SDK/MCP navigation route. The verifier
rejects drift in either direction.
