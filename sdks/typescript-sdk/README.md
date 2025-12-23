# Terminal49 TypeScript SDK

Typed, server-side client for the Terminal49 JSON:API, built with `openapi-fetch`, generated OpenAPI types, and JSONA deserialization. Can be used standalone or inside the MCP server.

## Installation

```bash
# from repo root using workspaces
npm install

# or inside the SDK package
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

### Methods
- `search(query)`
- `getContainer(id, include?)`
- `trackContainer({ containerNumber?, bookingNumber?, scac?, refNumbers? })`
- `getShipment(id, includeContainers?)`
- `listShipments(filters?)`
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

# Type-check
npm run type-check

# Tests
npm test

# Build
npm run build
```

## Publishing (prep)
- Add a `prepublishOnly` or `prepare` script to run `npm run build` so `dist/` is fresh.
- Ensure `files`/`exports` only ship built JS/typings (currently `main/types/exports` point to `dist/`).

## Notes
- Server-only: uses Node fetch (undici types) and targets Node 18+.
- Returns raw JSON:API documents by default; use `deserialize` for flattened objects or add your own mappers.
