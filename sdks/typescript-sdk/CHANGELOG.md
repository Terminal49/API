# Changelog

All notable changes to `@terminal49/sdk` are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0](https://github.com/Terminal49/API/compare/sdk-v-v0.6.0...sdk-v-v0.7.0) (2026-10-25)


### ⚠ BREAKING CHANGES

* **sdk:** documents.update no longer accepts documentTypeManual. Pass documentType instead.
* **openapi:** in the exported `paths` type from @terminal49/sdk, DELETE /webhooks/{id}, /custom_fields/{id}, /custom_field_definitions/{id}, and /custom_field_definitions/{definition_id}/options/{option_id} answer 204 instead of 200, so their `responses[200]` keys become `responses[204]`. `components['schemas']['error'].title` becomes optional.

### Features

* **ci:** verify agent trust and preserve generated API contracts ([#384](https://github.com/Terminal49/API/issues/384)) ([00fd834](https://github.com/Terminal49/API/commit/00fd8348e9d5976ff9b96fe5be88f2a91e203476))
* **mcp:** core and document read tools, SDK cancel options ([#448](https://github.com/Terminal49/API/issues/448), [#450](https://github.com/Terminal49/API/issues/450)) ([#449](https://github.com/Terminal49/API/issues/449)) ([f07abf9](https://github.com/Terminal49/API/commit/f07abf95dfd83a0b8a05dc6deaf34543dbf85d8a))
* **mcp:** whoami tool and GET /me contract (SDK client.me()) ([#420](https://github.com/Terminal49/API/issues/420)) ([e5dfc3f](https://github.com/Terminal49/API/commit/e5dfc3f2f47a50f54602a4964b044bf94ec0588b))
* **sdk:** trade intelligence in the OpenAPI spec and TypeScript SDK ([#415](https://github.com/Terminal49/API/issues/415)) ([68e8458](https://github.com/Terminal49/API/commit/68e8458706b1edda2930fdef341b2189ac996095))


### Bug Fixes

* **mcp:** summarize_containers counts with one /v2/containers/summary call ([#418](https://github.com/Terminal49/API/issues/418)) ([6b56eae](https://github.com/Terminal49/API/commit/6b56eae5955d1b3241e845f4d28ffc3dde1f06a2))
* **mcp:** whoami rejected tracking_slots for free and trial accounts ([#460](https://github.com/Terminal49/API/issues/460)) ([d15274c](https://github.com/Terminal49/API/commit/d15274c79ec7f9aff6ed43e832b573a6ce297d30))
* preserve ignored-filter diagnostics and reject unscoped MCP results ([#484](https://github.com/Terminal49/API/issues/484)) ([352b9e6](https://github.com/Terminal49/API/commit/352b9e63422eced3052f4263f5bbcc3840a84f3a))
* **sdk:** apply the review and live-test fixes from [#433](https://github.com/Terminal49/API/issues/433) ([#439](https://github.com/Terminal49/API/issues/439)) ([375d216](https://github.com/Terminal49/API/commit/375d216e672b36a96b8b36ef8844f346f48a5eb5))
* **security:** harden MCP, SDK, CLI and workflow boundaries ([#487](https://github.com/Terminal49/API/issues/487)) ([c599f5a](https://github.com/Terminal49/API/commit/c599f5a606fa76f030de55419f0fceb793280f63))


### Documentation

* **openapi:** match the spec to live API behavior ([#438](https://github.com/Terminal49/API/issues/438)) ([9059a19](https://github.com/Terminal49/API/commit/9059a19ba4ecc33aed91538603fd03d2d250e0a1))

## [0.6.0](https://github.com/Terminal49/API/compare/sdk-v-v0.5.0...sdk-v-v0.6.0) (2026-10-08)


### Features

* **sdk:** complete verified shipment and container filters ([#396](https://github.com/Terminal49/API/issues/396)) ([659d6e6](https://github.com/Terminal49/API/commit/659d6e63c1ecb27eda9d93e3fe4d37250642a866))

## [0.5.0](https://github.com/Terminal49/API/compare/sdk-v-v0.4.0...sdk-v-v0.5.0) (2026-09-30)


### Features

* **mcp:** expose custom fields in get_container and get_shipment_details ([#386](https://github.com/Terminal49/API/issues/386)) ([1ef620c](https://github.com/Terminal49/API/commit/1ef620ca895626b21482ff6906f6030f8bdcab1e))

## [0.4.0](https://github.com/Terminal49/API/compare/sdk-v-v0.3.1...sdk-v-v0.4.0) (2026-08-22)


### Features

* **sdk:** publish the expanded client surface (terminals, vessels, webhooks, webhook notifications, mapTrackingRequest) that main has carried since 0.3.1, so the npm package matches the in-repo SDK the CLI and MCP server build against

## [0.3.1](https://github.com/Terminal49/API/compare/sdk-v-v0.3.0...sdk-v-v0.3.1) (2026-07-02)


### Bug Fixes

* **sdk:** correct JSON:API mapper relationship/attr paths + restore shipping-line capability flags ([#275](https://github.com/Terminal49/API/issues/275)) ([c7e748a](https://github.com/Terminal49/API/commit/c7e748a900844142b520de0c46ab9077e7585bb0))
* **sdk:** request timeout, network-error normalization, idempotent-only retries, Retry-After, bounded iterate ([#274](https://github.com/Terminal49/API/issues/274)) ([e9ac7a8](https://github.com/Terminal49/API/commit/e9ac7a81aaa90e60a4190d60d8bfd4c6a1035484))
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
