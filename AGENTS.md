# Documentation Agent Instructions

> **This is a public repository.** Do not commit API keys, internal URLs, customer data, or any proprietary information. Use placeholders in all examples.

These instructions guide automated changes for the Terminal49 docs in this repository.

**For detailed writing standards, voice, terminology, and content guidelines, see [WRITING_GUIDE.md](WRITING_GUIDE.md).**

## Project Structure

- `docs/` holds the Mintlify site content and configuration.
- `docs/api-docs/`, `docs/datasync/`, `docs/sdk/`, `docs/mcp/`, and `docs/updates/` contain MDX pages grouped by product area.
- `docs/docs.json` defines navigation, branding, and tabs.
- `docs/openapi.json` is the source of truth for API reference content.
- `docs/images/` and `assets/images/` store images used by MDX pages.
- `Terminal49-API.postman_collection.json` is generated from the OpenAPI spec — do not edit manually.

## Scope

- Primary docs live in `docs/` (MDX pages, `docs/docs.json`, and `docs/openapi.json`).
- Do not edit generated files unless explicitly asked (e.g., `Terminal49-API.postman_collection.json`).

## Build and Development Commands

- Preview docs locally: `cd docs && mintlify dev`
- Generate Postman collection: `openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags`
- Lint the OpenAPI spec: `spectral lint --ruleset .spectral.mjs docs/openapi.json`

## When Updating API Reference

- If you change API behavior or schemas, update `docs/openapi.json` first.
- Regenerate the Postman collection with:
  `openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags`

## Commit and Pull Request Guidelines

- Commit history favors conventional prefixes such as `docs:` and `chore:`.
- Do not manually edit `Terminal49-API.postman_collection.json`; update `docs/openapi.json` and regenerate.
- PRs should include a short summary, linked issue/ticket if available, and screenshots for doc UI changes.

## Security

- Never commit real API keys; use placeholders like `Token YOUR_API_KEY` in examples.
- Postman deployment uses repository secrets; keep local credentials in your environment only.
