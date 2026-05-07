# Terminal49 TypeScript SDK

Typed, server-side client for the Terminal49 JSON:API, built with `openapi-fetch`, generated OpenAPI types, and JSONA deserialization. Can be used standalone or inside the MCP server.

## Installation

```bash
# install from npm (recommended)
npm install @terminal49/sdk

# or inside this repo
cd sdks/typescript-sdk
npm install
```

## Usage

```ts
import { Terminal49Client } from '@terminal49/sdk';

const client = new Terminal49Client({ apiToken: process.env.T49_API_TOKEN! });
const container = await client.getContainer('container-uuid', ['shipment']);
console.log(container); // raw JSON:API document

// Optional: deserialize JSON:API to plain objects
const simplified = client.deserialize<any>(container);
```

## Guide

For a full walkthrough (track a container, list shipments, pull events, and routing),
see the SDK quickstart in the docs site: `docs/api-docs/getting-started/sdk-quickstart.mdx`.

### Methods
- `search(query)`
- `getContainer(id, include?)`
- `trackContainer({ containerNumber?, bookingNumber?, scac?, refNumbers? })`
- `createTrackingRequest({ requestType, requestNumber, scac?, refNumbers?, shipmentTags? })`
- `inferTrackingNumber(number)`
- `createTrackingRequestFromInfer(number, { scac?, numberType?, refNumbers?, shipmentTags? })`
- `getShipment(id, includeContainers?)`
- `listShipments(filters?, options?)`
- `listContainers(filters?, options?)`
- `listTrackingRequests(filters?, options?)` / `listTrackRequests(filters?, options?)`
- `getContainerTransportEvents(id)`
- `getContainerRoute(id)`
- `listShippingLines(search?)`
- `getDemurrage(containerId)` (helper)
- `getRailMilestones(containerId)` (helper)
- `deserialize<T>(document)` → JSONA-based plain objects

### Examples

After building, run:
```bash
cd sdks/typescript-sdk
export T49_API_TOKEN=your_token
export T49_CONTAINER_ID=valid_container_uuid
npm run build
npm run example
```

`example.ts` prints the raw JSON:API response and a simplified view using `deserialize`.

## Development

```bash
# Generate types from OpenAPI
npm run generate:types

# Generate Mintlify-compatible TypeDoc pages
npm run docs

# Type-check
npm run type-check

# Tests
npm test

# Lint (Biome)
npm run lint

# Build
npm run build
```

## Testing

Unit tests:
```bash
cd sdks/typescript-sdk
npm test
```

Type checks and lint:
```bash
cd sdks/typescript-sdk
npm run type-check
npm run lint
```

Smoke tests (optional, require a token):
```bash
cd sdks/typescript-sdk
export T49_API_TOKEN=your_token
export T49_API_BASE_URL=https://api.terminal49.com/v2
export T49_INFER_NUMBER=your_tracking_number
export T49_RUN_SMOKE=1
npm run smoke
```

## Fixtures

Generate sanitized, production-based fixtures for tests:
```bash
cd sdks/typescript-sdk
export T49_API_TOKEN=your_token
export T49_API_BASE_URL=https://api.terminal49.com/v2
npm run fixtures:generate
```

This writes JSON:API fixtures to `src/fixtures/` with redacted IDs and numbers.
Numeric identifiers keep their original prefix while the last few characters are
obfuscated to preserve shape without exposing real values.
List endpoints are captured without `include` for performance guidance. Single-resource
fixtures include both base and `include` variants where supported.

## Documentation generation

The SDK uses TypeDoc with `typedoc-plugin-markdown` to generate Mintlify-compatible MDX pages.

```bash
cd sdks/typescript-sdk
npm run docs
```

Generated files are written to `../../docs/sdk/reference/` and are included in the Mintlify navigation in `docs/docs.json`.

From the repo root, you can also run:

```bash
npm run sdk:docs
```

## Releasing a new version

1. **Update the changelog** — add a new section to `CHANGELOG.md` under `[Unreleased]`,
   then rename it to the new version with today's date.

2. **Bump the version** in `package.json`:
   ```bash
   cd sdks/typescript-sdk
   npm version patch   # or minor / major
   ```

3. **Commit and push**:
   ```bash
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore: release @terminal49/sdk v$(node -p "require('./package.json').version")"
   git push
   ```

4. **Create a GitHub release** with tag `sdk-v<version>` (e.g. `sdk-v0.2.0`).
   The publish workflow will automatically:
   - Verify the tag matches `package.json`
   - Build and test
   - Publish to npm

5. **Regenerate docs** if the public API changed:
   ```bash
   npm run sdk:docs
   ```

## Notes
- Server-only: uses Node fetch (undici types) and targets Node 18+.
- Returns raw JSON:API documents by default; use `deserialize` for flattened objects or add your own mappers.
