# Changelog

All notable changes to `@terminal49/sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1](https://github.com/Terminal49/API/compare/sdk-v-v0.3.0...sdk-v-v0.3.1) (2026-06-26)


### Bug Fixes

* **sdk:** stop sending unsupported container/shipment filter keys + clamp page size + wire mapper includes ([#278](https://github.com/Terminal49/API/issues/278)) ([a019b5d](https://github.com/Terminal49/API/commit/a019b5da41124f35b39c9ae4107bc023ebd9ea2b))

## [0.3.0](https://github.com/Terminal49/API/compare/sdk-v-v0.2.0...sdk-v-v0.3.0) (2026-05-29)


### Features

* update MCP SDK and monitoring ([#227](https://github.com/Terminal49/API/issues/227)) ([4be5b33](https://github.com/Terminal49/API/commit/4be5b335c8f86cd955ea1f9a384d68d9826d6294))

## [0.2.0](https://github.com/Terminal49/API/compare/sdk-v-v0.1.0...sdk-v-v0.2.0) (2026-05-07)


### Features

* **sdk:** add TypeScript SDK + SDK Docs ([#174](https://github.com/Terminal49/API/issues/174)) ([e49ed54](https://github.com/Terminal49/API/commit/e49ed54c9918a8769ad007b0d90973c844d60372))

## [Unreleased]

### Added

- TypeDoc-generated API reference with Mintlify-compatible MDX output
- JSDoc comments on all public classes, interfaces, methods, and types
- `npm run docs` script for regenerating SDK reference pages

### Tests

- Regression test for `Content-Type` preservation through the auth interceptor.
  Pins the invariant that body-bearing requests reach the wire with their
  `Content-Type` intact (a class of bug that caused every write to 422 in an
  earlier `buildFetch`-based design before the architecture refactor moved
  header handling into `AuthInterceptor.onRequest`, which mutates
  `request.headers` in place).

## [0.1.0] — 2026-03-01

### Added

- `Terminal49Client` with resource namespaces: `shipments`, `containers`, `trackingRequests`, `shippingLines`
- Direct method aliases: `getShipment`, `listShipments`, `getContainer`, `listContainers`, etc.
- Convenience helpers: `trackContainer`, `getDemurrage`, `getRailMilestones`
- `search(query)` for cross-resource lookup
- `inferTrackingNumber` and `createTrackingRequestFromInfer` for auto-detect workflows
- Response formats: `raw`, `mapped`, `both`
- JSON:API deserialization via `deserialize<T>()`
- Typed errors: `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ValidationError`, `RateLimitError`, `FeatureNotEnabledError`, `UpstreamError`
- Automatic retry with exponential backoff for `429` and `5xx` responses
- Pagination support for list methods
- Configurable `fetch` implementation for testing and custom runtimes
- OpenAPI-generated types from `docs/openapi.json`
- CI matrix testing across Node 18, 20, 22, 24
- Publish workflow triggered by GitHub releases

[Unreleased]: https://github.com/Terminal49/API/compare/sdk-v0.1.0...HEAD
[0.1.0]: https://github.com/Terminal49/API/releases/tag/sdk-v0.1.0
