# Repository Guidelines

This repository contains the Terminal49 public documentation site, including MDX pages, the OpenAPI spec, and generated Postman assets.

## Project Structure & Module Organization
- `docs/` holds the Mintlify site content and configuration.
- `docs/api-docs/`, `docs/datasync/`, and `docs/updates/` contain MDX pages grouped by product area.
- `docs/openapi.json` is the source of truth for API reference content.
- `docs/mint.json` defines navigation, branding, and tabs.
- `docs/images/` and `assets/images/` store images used by MDX pages.
- `Terminal49-API.postman_collection.json` is generated from the OpenAPI spec.
- `Dockerfile`, `nginx.conf`, and `render.yaml` support a Redoc/NGINX deployment path.

## Build, Test, and Development Commands
There are no repo-local build/test scripts. Common tasks:
- Generate the Postman collection (matches CI):
  `openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags`
- Lint the OpenAPI spec with Spectral (if installed):
  `spectral lint --ruleset .spectral.mjs docs/openapi.json`
- Build the Redoc image (requires `reference/terminal49/terminal49.v1.json`):
  `docker build -t terminal49-docs .`

## Coding Style & Naming Conventions
- MDX files use YAML frontmatter; include a `title` for every page.
- Use kebab-case filenames that match the URL slug (e.g., `get-a-shipment.mdx`).
- Keep JSON formatted with 2-space indentation (see `docs/openapi.json`).
- Prefer concise headings and consistent terminology (JSON:API, “tracking request”, etc.).

## Testing Guidelines
- No automated test suite is present.
- For OpenAPI edits, lint with Spectral and regenerate the Postman collection.
- For doc changes, verify locally in your docs preview workflow (Mintlify tooling if used internally).

## Commit & Pull Request Guidelines
- Commit history favors conventional prefixes such as `docs:` and `chore:`.
- Do not manually edit `Terminal49-API.postman_collection.json`; update `docs/openapi.json` and regenerate.
- PRs should include a short summary, linked issue/ticket if available, and screenshots for doc UI changes.

## Security & Configuration Tips
- Never commit real API keys; use placeholders like `Token YOUR_API_KEY` in examples.
- Postman deployment uses repository secrets; keep local credentials in your environment only.
