# Navigation And Information Architecture

Use this guide when editing `docs/docs.json`, landing pages, cards, cross-links, and page placement.

## Navigation model

- Getting Started: tutorials and first success.
- Tracking Fundamentals: concepts and core workflow explanations.
- Webhooks & Events: webhook concept, setup how-to, event reference, payload reference, use cases, best practices.
- Integrations & Embeds: task guides for maps, routing, documents, rail, widgets, and dashboard links.
- Platform & Reference: cross-cutting reference or decision support such as rate limits, pricing, entitlements, coverage, and test numbers.
- API Reference: endpoint lookup only.
- SDK, MCP, DataSync, Updates: product-specific surfaces.

## Canonical links

Published docs links should use `/docs/...` paths. Avoid bare `/api-docs/...`, `/sdk/...`, `/datasync/...`, or `/mcp/...` links in MDX content.

Inside `docs/docs.json`, keep page IDs without `/docs/` because Mintlify navigation expects page identifiers.

## Cross-linking rules

- Tutorial pages link to the next tutorial step and deeper references.
- How-to pages link to exact API reference endpoints.
- Reference pages link to related how-to or concept pages, but do not depend on them for required facts.
- Concept pages link to implementation guides and exact references.
- Landing pages should route by reader task, not internal taxonomy alone.

## Missing pages

If a page points to a nonexistent route:

1. Create the missing page if the target is a real documentation need.
2. Otherwise remove or replace the link.
3. Add the new page to `docs/docs.json`.

## Checklist

- Is the page in the right section for its job?
- Are related pages findable within one or two clicks?
- Are card links and markdown links canonical?
- Did new pages get added to `docs/docs.json`?
- Did generated or API reference pages avoid hand-written navigation drift?
