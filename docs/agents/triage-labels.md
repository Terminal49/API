# Triage labels

These five labels already exist on the Linear **Dev** team with exactly these
names. Use them as-is; do not create variants.

| Label | Meaning |
| --- | --- |
| `needs-triage` | A maintainer still needs to evaluate this issue. Nobody should start work. |
| `needs-info` | Blocked on the reporter for more information. |
| `ready-for-agent` | Fully specified. An agent can pick it up and finish it unattended (AFK). |
| `ready-for-human` | Requires human judgment, a product decision, or access an agent does not have. |
| `wontfix` | Will not be actioned. |

## Choosing between `ready-for-agent` and `ready-for-human`

Label an issue `ready-for-agent` only when **all** of these hold:

- The acceptance criteria are checkable without asking anyone a question.
- Every dependency it needs already exists in this repository, or is listed
  under `## Blocked by` and is itself resolved.
- It does not require a pricing, packaging, entitlement, retention, or
  contract decision.
- It does not require changes to a repository the agent cannot reach (the
  Terminal49 Rails backend is a separate repository).

Otherwise use `ready-for-human`. When in doubt, `ready-for-human` — an agent
guessing at a product decision is worse than a stalled ticket.

## Other labels on the Dev team

The team also carries product-surface labels (`docs`, `DevEx`, `Infrastructure`,
`tooling`, `API`), a `wayfinder:*` family, and workflow labels (`decision`,
`discovery`, `ai-generated`). Add them when they clearly apply, but the five
above are the only ones that change how an agent behaves.
