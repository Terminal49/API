# Terminal49 CLI

`@terminal49/cli` is a command-line interface for Terminal49 APIs, designed for humans and automation agents.

## Installation

Use npm:

```bash
npm install -g @terminal49/cli
```

Or run from source:

```bash
cd sdks/typescript-sdk-cli
npm run dev -- --help
```

## Authentication

Use one of:

- `T49_API_TOKEN` environment variable
- `t49 config set token <token>`
- `--token <token>`

Prefer the environment variable or config file for tokens. `--token` is useful for one-off calls, but command-line arguments can be visible to other local processes through tools such as `ps`.

Token handling follows the SDK:

- A raw token is sent as `Authorization: Token <token>`.
- A value already prefixed with `Token ` or `Bearer ` is sent unchanged.
- For user-scoped bearer tokens, pass `--account-id <id>`, set `T49_ACCOUNT_ID`, or set `accountId` in config. The SDK sends this as `x-account-id`.

## Configuration

Config lives at the path printed by:

```bash
t49 config path
```

Config subcommands:

- `t49 config path`
- `t49 config get <key> [--reveal]`
- `t49 config set <key> <value>`
- `t49 config list [--reveal]`
- `t49 config clear`
- `t49 config auth-status`
- `t49 config client-check`

Allowed config keys are: `token`, `baseUrl`, `defaultFormat`, `maxRetries`, `accountId`, `timeoutMs`.

Environment variables:

- `T49_API_TOKEN`
- `T49_API_BASE_URL`
- `T49_ACCOUNT_ID`

Resolution precedence:

- Token: `--token` > `T49_API_TOKEN` > config `token`
- Base URL: `--base-url` > `T49_API_BASE_URL` > config `baseUrl`
- Account ID: `--account-id` > `T49_ACCOUNT_ID` > config `accountId`
- Response format: `--format` > config `defaultFormat` > `mapped`
- Max retries: `--max-retries` > config `maxRetries` > SDK default
- Timeout: `--timeout` > config `timeoutMs` > SDK default

## Global Flags

- `--json` emits JSON envelopes.
- `--table` forces table output.
- `--compact` minifies JSON output.
- `--fields <fields>` projects comma-separated fields. JSON output keeps only those fields, except that when the output has an `items` array, as `commands` does, it projects each entry in `items` and keeps the other top-level keys. A table shows one column per field path, named by the path as you typed it. When the paths share an array, such as `ports.name` on `containers route` or `data.id` on a `--format raw` list, the table prints one row per element.
- `--format <raw|mapped|both>` selects SDK response format.
- `--token <token>` overrides auth config.
- `--base-url <url>` overrides the API base URL.
- `--account-id <id>` sends an account id for user-scoped bearer tokens.
- `--timeout <ms>` sets request timeout in milliseconds.
- `--max-retries <n>` sets retry attempts for 429/5xx responses. `0` disables retries.

`--json` and `--table` are mutually exclusive. Without either flag, the CLI prints tables to a TTY and JSON to pipes.

Every command, including `config` and `commands`, honors `--json`, `--table`, `--compact`, and `--fields`. The one exception is `--all`, which always prints whole rows as newline-delimited JSON and ignores `--table`, `--compact`, `--fields`, and `--format`.

`--quiet`, `--verbose`, and `--no-color` were removed.

Paginated list commands (`containers`, `shipments`, `tracking-requests`, `parties`, `webhooks`, and `webhook-notifications`) support:

- `--page <n>` selects a page for normal list output.
- `--page-size <n>` selects page size for normal list output and `--all`.

`containers list`, `shipments list`, `tracking-requests list`, and `parties list` also support:

- `--all` emits all pages as newline-delimited JSON, one item per line, without the normal JSON envelope.
- `--max-pages <n>` limits pages fetched by `--all`.
- `--max-rows <n>` limits rows emitted by `--all`.

The API returns `shipping-lines`, `custom-fields`, `custom-field-definitions`, and `custom-field-options` lists whole, so those commands have no paging flags.

## JSON Output

Success output in JSON mode:

```json
{
  "ok": true,
  "command": "shipments.get",
  "data": {},
  "pagination": {},
  "meta": {}
}
```

`pagination` and `meta` are omitted when unavailable.

Every list command shapes `data` the same way:

- `--format mapped` prints the array of mapped rows.
- `--format raw` prints the whole JSON:API document, including `included`, `links`, and `meta`. Project its rows with paths such as `--fields data.id`.
- `--format both` prints `{ "raw": <document>, "mapped": <rows> }`.

List commands also copy the document's `links` and `meta` into `pagination`.

Error output:

```json
{
  "ok": false,
  "error": {
    "code": "AUTH_ERROR",
    "message": "Missing authentication token.",
    "details": {},
    "retryable": true,
    "retryAfterMs": 1000
  }
}
```

`details`, `retryable`, and `retryAfterMs` are omitted when unavailable. With `--json`, or when stderr is not a terminal, stderr carries only this JSON. Otherwise a terminal gets one `CODE: message` line, and usage errors add a `(run --help for usage)` line. A bad value for a global option (`--format`, `--max-retries`, `--timeout`, and so on) that comes before `--json` is reported before `--json` is read, so a terminal gets the line form. Rate-limit errors use `retryable: true` and include `retryAfterMs` when exposed by the SDK.

## Exit Codes

- `0` success
- `1` general or unknown error
- `2` usage or argument error
- `3` authentication or authorization error
- `4` rate limited
- `5` not found
- `6` validation error
- `7` reserved
- `8` upstream/server error
- `9` network/connection error

Stable error codes include `USAGE_ERROR`, `NETWORK_ERROR`, `AUTH_ERROR`, `RATE_LIMITED`, `VALIDATION_ERROR`, `NOT_FOUND`, `UPSTREAM_ERROR`, and `INTERNAL_ERROR`.

## Commands

- `t49 shipments get|list|update|stop-tracking|resume-tracking|custom-fields|set-custom-field`
  - `shipments update <id> --attr key=value...` splits each pair on its first `=`. A value that starts with `[`, `{`, or `"` is parsed as JSON, and so are `true`, `false`, and `null` on keys other than `ref_numbers` and `tags`. Other values stay strings. `ref_numbers` and `tags` are arrays of strings: a plain value, including `true`, `false`, or `null`, adds one string element, and repeated pairs add more, as in `--attr tags=urgent --attr tags=hazmat` or `--attr 'ref_numbers=["PO-1","PO-2"]'`. A JSON value for them must be a string or an array of strings, and `--attr tags=[]` sends an empty array. An `--attr` key replaces the same key from `--payload`.
- `t49 containers get|list|events|route|map|raw-events|refresh|demurrage|rail|custom-fields|set-custom-field` (`map` is deprecated: with `--json` it prints the raw GeoJSON FeatureCollection, the same as `route --format raw --json`. In table mode both print only the collection type. In table mode, `route` prints the ports and a Current vessel table.)
- `t49 shipments set-custom-field <id> <api-slug> --value <json>` and `t49 containers set-custom-field <id> <api-slug> --value <json>` take the custom field definition's `api_slug`, such as `priority`. A definition id also works: the CLI looks up its `api_slug` first.
- `t49 tracking-requests list|get|create|update|infer|create-from-infer`
- `t49 track <number>`
- `t49 shipping-lines list [--search <text>]`. The API has no search parameter, so `--search` fetches every line and keeps those whose SCAC, alternative SCACs, name, or short name contain the text, ignoring case.
- `t49 webhooks list|get|create|update|delete|ips`
- `t49 webhook-notifications list|get|examples`. `examples` requires `--event <event>`, a webhook event name such as `container.transport.vessel_arrived`.
- `t49 vessels get|get-by-imo|future-positions|future-positions-coords`. `future-positions` requires `--port-id` and `--previous-port-id`. `future-positions-coords` also requires `--latitude` and `--longitude`. In table mode both print the vessel name and IMO, then one row per estimated position.
- `t49 ports get`
- `t49 terminals get`
- `t49 parties list|get`
- `t49 metro-areas get`
- `t49 custom-fields list|get|create|update|delete`
- `t49 custom-field-definitions list|get|create|update|delete`. `list` prints your account definitions, and `list --templates` prints the Terminal49 templates you can copy with `template_id`.
- `t49 custom-field-options list|get|create|update|delete`
- `t49 search <query>`
- `t49 config path|get|set|list|clear|auth-status|client-check`
- `t49 commands`

## Live Fixture Smoke Coverage

To validate output formatting against real read-only API payloads:

```bash
cd sdks/typescript-sdk-cli
export T49_API_TOKEN=Token YOUR_API_KEY
npm run fixtures:capture:live
npm test
```

This captures JSON and table fixtures under:

- `test/fixtures/api/live/`
- `test/fixtures/table/live/`

Error fixtures are also captured for known read-only failure modes so output behavior remains test-covered.
