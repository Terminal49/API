# Documentation agent instructions

These instructions guide automated changes for the Terminal49 docs in this repository.

## Scope
- Primary docs live in `docs/` (MDX pages, `docs/mint.json`, and `docs/openapi.json`).
- Do not edit generated files unless explicitly asked (e.g., `Terminal49-API.postman_collection.json`).

## Audience focus
- Primary persona: integration engineers at BCOs/shippers/exporters who may not know logistics terms.
- Secondary personas: logistics operators and decision-makers who know the domain but are less technical.
- Each page should be laser-focused on one persona and one goal.

## Content goals by section
- Getting Started: tutorial-style onboarding and first success within 30 minutes.
- In Depth Guides: how-to and explanation content for workflows and best practices.
- Useful Info: explanation/FAQ content that supports decisions and integrations.
- API Reference: reference-only endpoint lookups, no narrative.

## Voice and terminology
- Sound like a domain expert but stay friendly and easy to understand.
- Use active voice and second person ("you").
- Use consistent product terms: "Terminal49", "tracking request", "shipment", "container", "webhook".
- Define acronyms on first use (e.g., Bill of Lading (BOL)); link to a glossary if available.
- Approved positioning phrases (use where relevant, do not invent new claims):
  - Automated Container Tracking API
  - Tracking shipments and containers from empty-out at the origin to empty-return at the destination
  - Single API to track bill of ladings, bookings, and container numbers with global coverage
  - Complete import milestones in North America including rail data

## API and code examples
- Base URL is `https://api.terminal49.com/v2` unless a page says otherwise.
- Examples should be realistic but safe (no real keys, emails, or customer data).
- Use JSON with 2-space indentation; label code fences (e.g., `json`, `bash`, `json http`).
- Prefer copy-pasteable snippets with complete headers.
- For auth examples, use `Authorization: Token YOUR_API_KEY`.

## When updating API reference
- If you change API behavior or schemas, update `docs/openapi.json` first.
- Regenerate the Postman collection with:
  `openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags`

## MDX conventions
- Every page must include frontmatter with a `title`.
- Use Mintlify components like `<Tip>` or `<Note>` sparingly for emphasis.
- Keep headings concise and action-oriented.
