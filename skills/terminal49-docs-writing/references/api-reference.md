# API Reference

API reference pages are lookup material. They should be exact, complete, and neutral.

## Source of truth

Use `docs/openapi.json` first for endpoint behavior, schemas, parameters, auth, events, and examples. If API behavior changes, update OpenAPI before MDX reference prose and regenerate `Terminal49-API.postman_collection.json`.

## Required shape

Reference content should answer:

- What endpoint or resource is this?
- Which authentication scheme is required?
- What parameters and body fields are accepted?
- Which values are valid?
- What does success return?
- What errors can callers receive?
- What limits, entitlements, or side effects apply?

## Voice

Use concise factual statements:

- "Returns..."
- "Requires..."
- "Accepted values are..."
- "`Retry-After` is returned on `429` responses."

Avoid:

- "In this guide..."
- "Let's..."
- Long rationale.
- Marketing claims.

## Terminal49 reference rules

- Auth must be described as a Token-prefixed API key: `Authorization: Token YOUR_API_KEY`.
- Event names must match OpenAPI and the event catalog exactly.
- Resource names must match public API objects: `shipment`, `container`, `tracking_request`, `webhook`, etc.
- If a feature requires entitlement, state the entitlement and the exact non-entitled response when known.
- If a page documents a deprecated parameter or enum value, include replacement and sunset status if known. If unknown, say no sunset date is currently documented.

## Examples

Examples must be safe and runnable:

```bash
curl -s "https://api.terminal49.com/v2/shipments" \
  -H "Authorization: Token YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json"
```

Use realistic placeholder values, not real customer data.

## API reference checklist

- Did OpenAPI change first if behavior changed?
- Did the generated Postman collection get regenerated?
- Are parameter names, enum strings, and event names exact?
- Is the page free of tutorial-style narrative?
- Are related how-to or concept pages linked instead of duplicated?
