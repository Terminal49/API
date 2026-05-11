# How-To Guides

How-to guides help a reader complete a real integration task. Use them for operational workflows, production setup, troubleshooting, and implementation recipes.

## Reader job

The reader knows what they need to do and wants reliable steps, tradeoffs, and failure handling.

## Required shape

1. State the task and when to use the guide.
2. List prerequisites and required IDs, tokens, entitlements, or data.
3. Give a direct sequence of steps.
4. Include decision points only where the reader must choose.
5. Include failure modes and recovery steps.
6. Link to API reference for exact fields and endpoint details.

## Good how-to patterns

- "Use this guide when..."
- "Before you start, you need..."
- "If you receive `403`, check..."
- "Use `data.id` as the idempotency key..."

## Avoid

- Teaching basic concepts at length.
- Copying full API reference tables into the guide.
- Hiding prerequisites after the first command.
- Leaving a sales-gated or entitlement-gated step unexplained.

## Terminal49 how-to examples

- Set up webhooks.
- Verify webhook signatures.
- Build ETA alerts.
- Handle Last Free Day (LFD) changes.
- Use routing/map data after entitlement is enabled.
- Upload documents and handle extraction events.

## How-to checklist

- Does the title start from the user's task?
- Are prerequisites explicit before steps?
- Are all endpoint references linked to API reference pages?
- Are rate limits, retries, and idempotency covered when relevant?
- Are non-entitled and error responses documented or linked?
