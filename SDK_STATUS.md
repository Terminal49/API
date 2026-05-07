# Terminal49 TypeScript SDK Status

_Last updated: 2026-05-07_

## Summary

The Terminal49 TypeScript SDK is a released MVP for core shipment, container, and tracking-request workflows. It is published as `@terminal49/sdk@0.1.0` and is usable from Node.js 18+ applications.

It is not yet a full wrapper for every endpoint in the Terminal49 API.

## Package and source

- npm package: `@terminal49/sdk`
- Current published version: `0.1.0`
- Source directory: `sdks/typescript-sdk/`
- Public SDK docs: `docs/sdk/`
- SDK docs entry point: `docs/sdk/introduction.mdx`
- Methods reference: `docs/sdk/methods.mdx`
- Generated API reference: `docs/sdk/reference/`

## Supported today

### Client basics

- API-token authentication
- Configurable API base URL
- Optional custom `fetch` implementation
- Configurable retry count
- Automatic retries for `429` and `5xx` responses with exponential backoff
- Typed SDK errors:
  - `AuthenticationError`
  - `AuthorizationError`
  - `NotFoundError`
  - `ValidationError`
  - `RateLimitError`
  - `FeatureNotEnabledError`
  - `UpstreamError`
  - `Terminal49Error`
- JSON:API deserialization with `deserialize<T>()`
- Response formats:
  - `raw`
  - `mapped`
  - `both`
- Pagination options for list methods
- TypeDoc-based API reference generation with Mintlify-compatible MDX output

### Supported resource areas

#### Search

- `client.search(query)`

#### Shipments

Namespace methods:

- `client.shipments.get(id, includeContainers?, options?)`
- `client.shipments.list(filters?, options?)`
- `client.shipments.update(id, attrs, options?)`
- `client.shipments.stopTracking(id, options?)`
- `client.shipments.resumeTracking(id, options?)`

Direct methods:

- `client.getShipment(...)`
- `client.listShipments(...)`
- `client.updateShipment(...)`
- `client.stopTrackingShipment(...)`
- `client.resumeTrackingShipment(...)`

#### Containers

Namespace methods:

- `client.containers.get(id, include?, options?)`
- `client.containers.list(filters?, options?)`
- `client.containers.events(id, options?)`
- `client.containers.route(id, options?)`
- `client.containers.rawEvents(id, options?)`
- `client.containers.refresh(id, options?)`

Direct methods:

- `client.getContainer(...)`
- `client.listContainers(...)`
- `client.getContainerTransportEvents(...)`
- `client.getContainerRoute(...)`
- `client.getContainerRawEvents(...)`
- `client.refreshContainer(...)`

#### Tracking requests

Namespace methods:

- `client.trackingRequests.list(filters?, options?)`
- `client.trackingRequests.get(id, options?)`
- `client.trackingRequests.update(id, attrs, options?)`
- `client.trackingRequests.create(params)`
- `client.trackingRequests.inferNumber(number)`
- `client.trackingRequests.createFromInfer(number, options?)`

Direct methods:

- `client.listTrackingRequests(...)`
- `client.listTrackRequests(...)`
- `client.getTrackingRequest(...)`
- `client.updateTrackingRequest(...)`
- `client.createTrackingRequest(...)`
- `client.inferTrackingNumber(...)`
- `client.createTrackingRequestFromInfer(...)`

#### Shipping lines

- `client.shippingLines.list(search?, options?)`
- `client.listShippingLines(search?, options?)`

#### Convenience helpers

- `client.trackContainer(params)`
- `client.getDemurrage(containerId)`
- `client.getRailMilestones(containerId)`

## Not yet covered by SDK wrappers

The current SDK does not yet provide first-class wrapper methods for every API area in `docs/openapi.json`. Remaining areas include:

- Webhooks
  - list, get, create, edit, delete
  - list webhook IPs
  - trigger one-time webhook test delivery
- Webhook notifications
  - list notifications
  - get notification
  - get example payloads
- Custom fields
  - definitions
  - definition options
  - field values
  - shipment custom fields
  - container custom fields
- Documents
  - list, upload, get, edit, delete
  - download URL
  - document types
  - re-extract, re-classify, re-link, rotate
- Email submissions
- Document schemas
- Parties
- Ports
- Terminals
- Vessels
- Metro areas
- Single shipping line lookup
- Container update endpoint
- Container `map_geojson` endpoint
- Vessel future-position routing endpoints

## Gaps and follow-up work

1. **Regenerate SDK OpenAPI types**

   `sdks/typescript-sdk/src/generated/terminal49.ts` appears stale relative to `docs/openapi.json`.

   Example: generated types include `/containers/{id}/route`, while the current OpenAPI includes `/containers/{id}/map_geojson`.

2. **Add wrappers for remaining endpoint groups**

   Prioritize recently released API features first:

   - Custom Fields API
   - webhook trigger endpoint
   - documents API beta endpoints
   - map/routing endpoints

3. **Make mapped responses consistent**

   Some methods have mapped response helpers; others fall back to raw JSON:API even when `format: 'mapped'` is requested.

4. **Keep generated docs in sync**

   Regenerate TypeDoc output after public SDK API changes:

   ```bash
   npm run sdk:docs
   ```

5. **Run validation before release**

   Suggested validation commands:

   ```bash
   cd sdks/typescript-sdk
   npm ci
   npm run build
   npm test -- --run
   npm run lint
   cd ../../docs
   npx mintlify validate
   ```

6. **Version and publish next release**

   After the gaps above are addressed, bump `sdks/typescript-sdk/package.json` and publish a new SDK version.

## Bottom line

The SDK is production-usable for core Terminal49 tracking workflows: creating tracking requests, listing and fetching shipments and containers, reading transport events, and working with shipping lines.

It should be treated as a core-workflows SDK, not yet a complete Terminal49 API SDK.
