# Paved extension path

Use these sequences. Do not create a second registration, build, test, or
generation path.

## Add or change an OpenAPI endpoint

1. Edit `docs/openapi.json`, the API contract source of truth.
2. Run `npm run generate:types --workspace @terminal49/sdk`.
   Commit the updated `src/generated/terminal49.ts`.
3. Add or update the SDK manager method and fixture-backed tests.
4. Update the relevant non-generated docs page. Regenerate SDK reference docs
   only through `npm run sdk:docs`.
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
   ordering in the root task. Add every workspace to its ordered
   `npm run build --workspace NAME` sequence; the guard rejects omissions.
4. Update the root lockfile only. A standalone lockfile is allowed solely for a
   package whose consumer-compatibility CI installs it outside the workspace.
5. Add the package to CI and run `npm run agent-verify`.

## Add an MCP tool

1. Add one executor in `packages/mcp/src/tools/<tool-name>.ts`.
2. Register its name, schemas, annotations, and handler once in
   `packages/mcp/src/server.ts`.
3. Add behavior and contract coverage in
   `packages/mcp/src/tools/contracts.test.ts`; these tests call executors
   directly. Use `npm run test:protocol --workspace @terminal49/mcp` for
   transport-level behavior.
4. Add the tool to `skills/agent-trust/feature-map.json`.
5. Update MCP docs when the public capability or recommended chaining changes.
6. Run `npm run agent-verify`; the final protocol step must report the updated
   tool count.

## Update the map

Change `skills/agent-trust/feature-map.json` in the same commit as an MCP tool,
SDK package export, or non-generated SDK/MCP navigation route. The verifier
rejects drift in either direction.

Each SDK entrypoint names its canonical `.ts` source under
`sdks/typescript-sdk/src/`. Declaration files are not entrypoint sources.
Sources cannot contain traversal or `node_modules` segments, backslashes,
or URL-reserved `%`, `#`, or `?` characters.
The verifier derives the JavaScript and declaration paths under `dist/` and
requires the package export's `default` and `types` targets to match.
Additional export conditions require an explicit verifier update.
`npm run test:agent-trust` exercises valid mappings and export redirections.
The full `npm run agent-verify` command runs these tests before workspace tests.

## Review and merge policy

Repository maintainers use [the trust-policy installation guide](risk-gates.md)
and [the GitHub verification trial](risk-gates-trial.md) before changing merge
protection. These guides describe advisory behavior and the separate native
review requirements.
