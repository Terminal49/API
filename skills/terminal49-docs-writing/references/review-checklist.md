# Review Checklist

Use this before finishing any Terminal49 docs change.

## Content quality

- Page has one reader, one job, and one page type.
- Title and first paragraph match the job.
- Headings are scannable and action-oriented.
- Acronyms are defined on first use.
- Claims are specific and source-backed.
- Examples use placeholders and public-safe data.
- API examples include `Authorization: Token YOUR_API_KEY`.
- Internal docs links use `/docs/...` in MDX content.

## Diataxis fit

- Tutorial: first success, concrete steps, expected result.
- How-to: prerequisites, steps, decisions, failure modes.
- Reference: exact values, fields, errors, limits, neutral voice.
- Concept: mental model, tradeoffs, links to implementation.

## Terminal49 consistency

- Use `Terminal49`, `tracking request`, `shipment`, `container`, and `webhook` consistently.
- Event names match OpenAPI and the event catalog.
- Rate limits and retry behavior match the rate limit docs.
- Auth uses `Token`, not `Bearer`, unless documenting backward compatibility for a specific protocol.
- Entitlements and non-entitled behavior are stated or linked for paid features.

## Repository checks

Run the checks that apply:

```bash
git diff --check
node -e "JSON.parse(require('fs').readFileSync('docs/docs.json','utf8')); JSON.parse(require('fs').readFileSync('docs/openapi.json','utf8'));"
```

If OpenAPI changed:

```bash
openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags
```

If local commands fail because tooling is missing or broken, report the exact blocker and which checks did pass.
