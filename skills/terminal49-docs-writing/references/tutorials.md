# Tutorials

Tutorials are for learning by doing. Use them for Getting Started pages and first-success flows.

## Reader job

The reader wants to prove Terminal49 works for them. They may not understand JSON:API, tracking requests, SCACs, webhooks, or logistics milestones yet.

## Required shape

1. Name the outcome in the first paragraph.
2. State prerequisites before the first command or request.
3. Use one path through the product. Avoid branching.
4. Give copy-pasteable examples with complete headers.
5. Show the expected response or visible result.
6. Add troubleshooting only for common first-run failures.
7. Link out to reference pages instead of embedding full enum tables or schemas.

## Good tutorial patterns

- "In this tutorial, you will create a tracking request..."
- "By the end, you will have..."
- "Replace `YOUR_API_KEY`, `REQUEST_NUMBER`, and `SCAC`..."
- "A new request usually starts with `status: \"pending\"`..."

## Avoid

- Long conceptual introductions before the reader succeeds.
- Full object schemas, exhaustive event catalogs, or endpoint parameter tables.
- Multiple language samples unless the tutorial is specifically language-based.
- Sales language or claims that are not needed for first success.

## Terminal49 first-success sequence

For API onboarding, prefer this path:

1. Get an API key.
2. Create a tracking request.
3. List shipments or containers.
4. Register a webhook.
5. Link to deeper guides for production hardening.

## Tutorial checklist

- Does the reader have a concrete result within 30 minutes?
- Are placeholders safe and obvious?
- Does every request include `Authorization: Token YOUR_API_KEY`?
- Is the "why" short enough not to interrupt flow?
- Are deeper details linked to how-to, reference, or concept pages?
