# Changelog

## [0.2.0](https://github.com/Terminal49/API/compare/cli-v-v0.1.0...cli-v-v0.2.0) (2026-10-17)


### ⚠ BREAKING CHANGES

* **cli:** list commands with --format raw print the full JSON:API document under data, so the rows move from data to data.data (for example, jq '.data.data[]' instead of jq '.data[]'). With --format both, data.raw holds the full document instead of its row array. This affects containers, shipments, tracking-requests, parties, custom-fields, custom-field-definitions, and custom-field-options list, which printed only the rows before. shipping-lines, webhooks, and webhook-notifications list already printed the whole document in raw.
* **sdk:** documents.update no longer accepts documentTypeManual. Pass documentType instead.

### Bug Fixes

* **cli:** apply the review and live-test fixes from [#433](https://github.com/Terminal49/API/issues/433) ([#441](https://github.com/Terminal49/API/issues/441)) ([a91ae46](https://github.com/Terminal49/API/commit/a91ae4609f4f78b0b42f578a723adab3a7fa081c))
* **sdk:** apply the review and live-test fixes from [#433](https://github.com/Terminal49/API/issues/433) ([#439](https://github.com/Terminal49/API/issues/439)) ([375d216](https://github.com/Terminal49/API/commit/375d216e672b36a96b8b36ef8844f346f48a5eb5))

## [0.1.0](https://github.com/Terminal49/API/compare/cli-v-v0.1.0...cli-v-v0.1.0) (unreleased)

### Features

* Initial `@terminal49/cli` (`t49`) release for agent-friendly Terminal49 API access
