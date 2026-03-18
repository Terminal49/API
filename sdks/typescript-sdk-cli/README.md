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
npm run dev -- t49 --help
```

## Authentication

Use any one of:

- `--token <token>`
- `T49_API_TOKEN` environment variable
- `t49 config set token <token>`

## Commands

- `t49 shipments get|list|update|stop-tracking|resume-tracking`
- `t49 containers get|list|events|route|raw-events|refresh|demurrage|rail`
- `t49 tracking-requests list|get|create|update|infer|create-from-infer`
- `t49 track <number>`
- `t49 shipping-lines list`
- `t49 search <query>`
- `t49 config path|get|set|list|clear|auth-status`
- `t49 commands`

`--json` returns stable JSON envelopes.

## Live Fixture Smoke Coverage

To validate output formatting against real read-only API payloads:

```bash
cd sdks/typescript-sdk-cli
export T49_API_TOKEN=TokenOrBearerValue
pnpm fixtures:capture:live
pnpm test
```

This captures JSON + table fixtures under:

- `test/fixtures/api/live/`
- `test/fixtures/table/live/`

Error fixtures are also captured for known read-only failure modes (for example 400/500 envelopes) so output behavior remains test-covered.
