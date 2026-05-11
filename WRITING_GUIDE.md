# Terminal49 Documentation Writing Guide

This guide defines how we write and maintain Terminal49 docs. Follow it for new pages and major edits.

## Audience and page focus
- Primary persona: integration engineers at BCOs/shippers/exporters who may not know logistics terms.
- Secondary personas: logistics operators and decision-makers who know the domain but are less technical.
- Keep each page laser-focused on a single persona and a single goal.

## Information architecture and navigation
- Organize content by product line first, then user journey, then objects (e.g., API Docs -> Getting Started -> Containers).
- Getting Started is a tutorial path; In Depth Guides are how-to + explanations; Useful Info is reference + FAQs; API Reference is endpoint lookups only.
- Make these top tasks findable within 1-2 clicks:
  - Track a container
  - Track a bill of lading, booking, or master bill of lading
  - Integrate vessel ETA/arrival updates
  - Integrate vessel departure updates
  - Build or embed a routing map
  - Integrate milestones from empty-out to empty-return
  - Integrate import and export container milestones
- Update `docs/docs.json` navigation when you add or move pages.

## Choose the right doc type
Use the closest doc type before drafting:
- **Tutorials**: a guided first success. Start Here should get a new user tracking quickly and explain that Terminal49 is a comprehensive container tracking API for enterprise use cases.
- **How-to guides**: solve a specific problem with steps and prerequisites (e.g., set up webhook alerts for ETA changes).
- **Reference**: exact, complete API behavior; avoid narrative.
- **Concepts**: explain why something works (rate limits, lifecycle, data sources).

Use Diataxis as the decision test for every page:
- **Tutorial**: action that serves learning. Take responsibility for the reader's first success. Give a concrete outcome, small steps, and expected results. Keep explanations brief and link out.
- **How-to guide**: action that serves work. Assume the reader already knows the domain goal and needs a reliable sequence. Focus on the task, prerequisites, decisions, and failure modes.
- **Reference**: knowledge that serves work. Mirror the API or product surface. State facts, accepted values, limits, errors, examples, and links. Do not teach or persuade.
- **Concept**: knowledge that serves understanding. Explain why Terminal49 behaves the way it does, what tradeoffs exist, and how related ideas fit together. Keep the scope tightly bounded.

If a page mixes types, do not solve it by adding more content. Move or link the content to the right page type:
- Move enum tables, request fields, event names, limits, and error bodies into reference pages.
- Move "why" and background material into concept pages.
- Move step-by-step operational flows into how-to guides.
- Keep getting-started pages as tutorials with minimal branching and visible results.

## Voice, tone, and clarity
- Use second person and active voice.
- Sound like a domain expert while staying friendly and easy to understand.
- Prefer short sentences and short paragraphs (1-3 sentences).
- Avoid marketing language; be precise and direct.
- Use approved positioning phrases where relevant:
  - Automated Container Tracking API
  - Tracking shipments and containers from empty-out at the origin to empty-return at the destination
  - Single API to track bill of ladings, bookings, and container numbers with global coverage
  - Complete import milestones in North America including rail data

## Terminology, acronyms, and naming
- Use the canonical brand name: "Terminal49".
- Define acronyms on first use (e.g., Bill of Lading (BOL), Standard Carrier Alpha Code (SCAC)).
- Link to a glossary when available; otherwise add a short inline definition.
- Keep filenames in kebab-case and match the URL slug (e.g., `get-a-shipment.mdx`).

## API and example standards
- Use the production base URL: `https://api.terminal49.com/v2`.
- Show full headers when auth is required: `Authorization: Token YOUR_API_KEY`.
- Use JSON with 2-space indentation and realistic, sanitized values.
- If an example is partial, say so explicitly.
- Prefer copy-pasteable snippets with complete headers and request bodies.

## Structure and formatting
- MDX pages must include frontmatter with a `title`.
- Use H2/H3 headings to chunk content; keep headings action-oriented.
- Use numbered lists for steps, bullets for options.
- Put runnable commands in fenced code blocks with a language tag.
- Link to related pages when a topic is out of scope.

## Media and assets
- Use screenshots or diagrams only when they clarify a workflow.
- Store images in `docs/images/` and reference them with relative paths.
- Add descriptive alt text for accessibility.

## Review checklist
Before you open a PR:
- The page matches the right doc type and persona.
- Examples are copy-pasteable and safe.
- Headings are scannable and action-oriented.
- Acronyms are defined on first use.
- Related pages are linked where helpful.
- OpenAPI changes are reflected in `docs/openapi.json` and the Postman collection is regenerated.
