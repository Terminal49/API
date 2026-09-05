# Domain docs

This repository uses a **single-context** layout.

- **[`CONTEXT.md`](../../CONTEXT.md)** (repository root) — the domain vocabulary
  and the boundaries between the three things this repo ships. Read it before
  naming anything.
- **[`docs/adr/`](../adr/)** — architecture decision records. Read the relevant
  ADR before re-opening a decision it already settled.

There is no `CONTEXT-MAP.md`. The three products (documentation site, MCP
server + OAuth gateway, TypeScript SDK) share one domain — ocean container
tracking — so one context file covers them. If the MCP gateway's vocabulary
grows far enough apart to make that file unwieldy, split it then, not before.

Skills that read these files: `improve-codebase-architecture`, `diagnosing-bugs`,
`tdd`.
