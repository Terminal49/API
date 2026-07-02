# Concepts And Explanations

Concept pages explain why Terminal49 works the way it does. Use them for mental models, lifecycle explanations, data source behavior, rate limits, event timestamps, and logistics domain context.

## Reader job

The reader wants understanding before making design decisions.

## Required shape

1. Name the concept and why it matters.
2. Explain the model in plain language.
3. Define domain terms and acronyms.
4. Show how the concept affects integration design.
5. Link to how-to guides for implementation.
6. Link to reference pages for exact fields and values.

## Good concept patterns

- "Terminal49 tracking is asynchronous..."
- "A tracking request is the instruction to monitor a shipment or container..."
- "Transport events represent physical milestones..."
- "Use webhooks for state changes and list/get endpoints for lookup."

## Avoid

- Step-by-step setup instructions.
- Exhaustive field lists.
- Unverified roadmap, coverage, or performance claims.
- Vague language such as "seamless", "robust", or "best-in-class".

## Terminal49 concept topics

- Tracking request lifecycle.
- Container status derivation.
- Event timestamps and time zones.
- Webhooks vs polling.
- Data source availability and coverage limitations.
- Rate limiting and backoff strategy.
- Holds, fees, and release readiness.

## Concept checklist

- Can a reader make a better design decision after reading?
- Are logistics terms defined on first use?
- Are claims grounded in docs, OpenAPI, or checked-in source data?
- Are implementation steps moved to how-to guides?
- Are exact values moved to reference pages?
