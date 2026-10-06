---
name: terminal49-agent-trust
description: Use when adding or changing API/OpenAPI endpoints, npm packages, MCP tools, SDK entrypoints, or their docs in the Terminal49/API repository.
---

# Terminal49 agent trust

Extend this repository through one paved path and prove the change with the
same command CI runs.

## Before editing

1. Read [the paved path](references/paved-path.md) for the surface you are
   changing.
2. Read [the feature map](feature-map.json) to confirm the registered MCP
   tools, SDK exports, and docs routes, and to find an existing tool's source.
3. Keep generated files generated. Change `docs/openapi.json` before SDK types,
   Postman, or SDK reference output.

## Verification

Run:

```bash
npm run agent-verify
```

Use `npm run agent-verify:quick` only while iterating. The full command is the
completion gate and must pass before a code change is handed off.

The verifier checks:

- feature-map, toolchain-pin, and root-config ownership rules
- Vite+ format/lint and authoritative TypeScript checks
- SDK, MCP, and CLI builds and tests
- OpenAPI-to-SDK type generation drift
- an offline MCP initialize plus `tools/list` protocol smoke

## P-Stack

Follow [the repository P-Stack wiring](references/pstack.md) for non-trivial
investigation, implementation, verification, and lesson encoding. Model choices
and reasoning budget are user-local; never commit a teammate's model slugs.
