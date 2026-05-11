---
name: terminal49-docs-writing
description: Use when creating, editing, restructuring, or reviewing Terminal49 public documentation in this API docs repository, including Mintlify MDX pages, API reference text, SDK docs, MCP docs, DataSync docs, webhook docs, tutorials, how-to guides, concepts, reference pages, changelog/update posts, and agent-facing docs. Applies Diataxis page types, Terminal49 terminology, public-repo safety rules, and repo-specific verification expectations.
---

# Terminal49 Docs Writing

Use this skill for substantive Terminal49 documentation work. It turns general writing guidance into a repeatable workflow with type-specific standards.

## First pass

1. Identify the page type before editing: tutorial, how-to guide, reference, concept/explanation, release/update note, or landing/navigation page.
2. Load only the reference file(s) that match the task.
3. Ground claims in the repository source of truth:
   - API behavior and schemas: `docs/openapi.json`
   - Navigation: `docs/docs.json`
   - Public docs pages: `docs/**/*.mdx`
   - Generated Postman collection: regenerate from OpenAPI; do not edit manually
4. Use public-safe examples only. Never include real API keys, customer data, internal URLs, or proprietary information.
5. Keep canonical auth phrasing: `Authorization: Token YOUR_API_KEY`.
6. Keep canonical docs links under `/docs/...` when linking to published docs pages.

## Choose the right reference

- Tutorials and first-success onboarding: read `references/tutorials.md`.
- How-to guides and operational workflows: read `references/how-to-guides.md`.
- API endpoint/reference pages and OpenAPI text: read `references/api-reference.md`.
- Concept/explanation pages: read `references/concepts.md`.
- Webhook/event docs: read `references/webhooks-events.md`.
- SDK, MCP, and agent-facing docs: read `references/sdk-mcp-agent-docs.md`.
- DataSync and coverage docs: read `references/datasync-coverage.md`.
- Changelog, updates, release notes, and announcements: read `references/changelog-updates.md`.
- Landing pages, navigation, IA, and cross-linking: read `references/navigation-ia.md`.
- Final quality checks for any docs change: read `references/review-checklist.md`.

## Core Terminal49 standards

- Primary reader: integration engineers at shippers, BCOs, exporters, or logistics software teams. They may not know logistics acronyms.
- Secondary reader: logistics operators and decision-makers who understand the business but are less technical.
- Use second person and active voice.
- Define acronyms on first use: Bill of Lading (BOL), Standard Carrier Alpha Code (SCAC), Last Free Day (LFD), Port of Discharge (POD), Port of Lading (POL).
- Prefer exact behavior over marketing phrasing. Do not invent coverage, pricing, limits, events, schemas, or roadmap claims.
- If source data is missing, say what is missing and link to the closest verified reference.
- Keep one page focused on one reader and one job.

## Diataxis routing rules

- Tutorial: guided learning and first success. Keep the path narrow, concrete, and runnable.
- How-to guide: task completion for a reader who already has a goal. State prerequisites, steps, decisions, and failure modes.
- Reference: exact lookup material. Mirror the product or API surface. Avoid teaching and persuasion.
- Concept: understanding and mental model. Explain why the system behaves the way it does.

If content mixes page types, move or link instead of expanding the page:

- Move enum tables, event lists, fields, limits, and errors to reference.
- Move background and tradeoffs to concepts.
- Move operational recipes to how-to guides.
- Keep getting-started content as tutorials with visible results.

## Verification

Use focused verification based on touched files:

- Always run `git diff --check`.
- If `docs/docs.json`, `docs/openapi.json`, or generated JSON changes, parse the JSON.
- If `docs/openapi.json` changes, regenerate `Terminal49-API.postman_collection.json`.
- Run targeted `rg` checks for stale phrasing when replacing terminology.
- Run Mintlify or Spectral checks when available; if local tooling is blocked, report the exact blocker.
