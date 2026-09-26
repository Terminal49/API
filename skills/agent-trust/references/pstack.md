# P-Stack wiring

P-Stack is a Cursor plugin, not a repository dependency. Install it in Cursor:

```text
/add-plugin pstack
```

Then run `/setup-pstack`. Choose the reasoning budget and models available to
your account. That command writes `~/.cursor/rules/pstack-models.mdc`; the file
is user-local and must not be committed.

Use the stack this way:

- `/poteto-mode` for a non-trivial feature, refactor, bug, or multi-phase task
- `/how` before changing an unfamiliar subsystem
- the repository's `npm run agent-verify` as the executable proof step
- `/reflect` after a costly task; encode accepted lessons in a guard, test,
  feature-map check, or verifier step instead of adding advisory prose

The repository does not pin model slugs. Re-run `/setup-pstack` to change the
budget or per-role model selection without changing the codebase.
