# Issue tracker

Issues for this repository live in **Linear**, not GitHub.

- **Workspace:** Terminal49
- **Team:** `Dev`
- **Access:** Linear MCP tools (`list_issues`, `get_issue`, `save_issue`, `list_issue_labels`, `list_issue_statuses`). Use the Linear MCP connection; there is no CLI fallback configured.

GitHub Issues on `Terminal49/API` are **not** the request surface. Do not open, close, or triage GitHub issues as part of an agent workflow. GitHub is used for code review (pull requests) only.

## Reading issues

```
list_issues(team: "Dev", query: "<search terms>")
get_issue(id: "DEV-1234", includeRelations: true)
```

Always search before creating. Duplicates are common because several projects
(MCP, API docs, SDK) file into the same team.

## Creating issues

```
save_issue(
  team: "Dev",
  title: "...",
  description: "<markdown body>",
  addLabels: ["ready-for-agent"],
  blockedBy: ["DEV-1234"],
)
```

Publish in **dependency order** so `blockedBy` can reference a real identifier.

Every agent-facing issue body uses this structure:

```markdown
## Parent
<link or identifier of the umbrella issue, or "none">

## What to build
<one paragraph: the vertical slice, end to end>

## Acceptance criteria
- [ ] ...
- [ ] ...

## Blocked by
<identifiers, or "nothing">
```

## Statuses on the Dev team

`Triage` · `Backlog` · `Todo` · `In Progress` · `In Review` · `Merged` · `Confirmed` · `Deployed` · `Canceled` · `Duplicate`

Linear's native **Triage** status is separate from the `needs-triage` label. The
label is authoritative for agent workflows; leave the status column to the
humans running the board. Do not move issues between statuses on someone's
behalf.

## Rules

- Never close or restructure a parent/umbrella issue.
- Never assign an issue to a human without being asked.
- Issue links (`linear.app/terminal49/...`) point at a **private** workspace. This
  repository is public — do not paste issue bodies, customer names, or account
  data into committed files.
