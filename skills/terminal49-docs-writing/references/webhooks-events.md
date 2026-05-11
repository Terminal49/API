# Webhooks And Events

Webhook docs need clear separation:

- Concept: why webhooks beat polling.
- How-to: how to create, secure, and operate webhook consumers.
- Reference: canonical event names and payload shapes.
- Use cases: specific business workflows such as ETA or LFD alerts.

## Canonical pages

- Overview/explanation: `docs/api-docs/webhooks/overview.mdx`
- Setup/how-to: `docs/api-docs/in-depth-guides/webhooks.mdx`
- Event reference: `docs/api-docs/webhooks/event-catalog.mdx`
- Payload reference: `docs/api-docs/webhooks/payloads.mdx`
- Complete examples: `docs/api-docs/useful-info/webhook-events-examples.mdx`
- API reference: `docs/api-docs/api-reference/webhooks/*.mdx`

## Event naming

Use exact event names from OpenAPI and the event catalog. Do not shorten transport events.

Correct:

- `container.transport.vessel_arrived`
- `container.transport.rail_loaded`
- `container.pickup_lfd_rail.changed`
- `tracking_request.succeeded`

Incorrect:

- `vessel_arrived`
- `rail_loaded`
- `pickup_lfd_rail`

## Security content

Production webhook docs should cover:

- `X-T49-Webhook-Signature`
- HMAC SHA-256 over the raw request body
- Constant-time signature comparison
- Terminal49 webhook IP allowlisting via the API
- Idempotency by `data.id`
- Returning `2xx` only after safely accepting the event

## Retry content

State retry behavior where relevant:

- Terminal49 retries failed webhook deliveries up to 12 times.
- Any non-2xx response or timeout can trigger retries.
- Consumers must handle duplicate deliveries.

## Payload content

Use `webhook_notification` as the top-level resource. Teach handlers to inspect `data.attributes.event` first. Put full event examples in the examples page, not every guide.

## Webhook checklist

- Are event names exact and prefixed where needed?
- Is security visible before production use?
- Is the retry/idempotency model documented?
- Are payload examples separated from setup steps?
- Are `document.*` events linked to document processing docs?
