# Architecture decision records

One file per decision, numbered and never renumbered:
`NNNN-short-kebab-title.md`.

Record a decision here when it constrains future work and the reason would
otherwise be lost — a choice between two viable designs, a constraint accepted
on purpose, a path deliberately not taken. Do not record routine
implementation choices.

Supersede rather than edit: write a new ADR, set its status to `Accepted`, and
change the old one's status to `Superseded by NNNN`. The record of what we once
believed is the point.

## Template

```markdown
# NNNN. <Title>

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD

## Context
What forced a decision. The constraints that were real at the time.

## Decision
What we chose, in the active voice.

## Consequences
What this makes easy, what it makes hard, and what it rules out.
```
