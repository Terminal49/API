# Install the PR trust policy safely

Use this guide to install the advisory policy and retain human review as the
merge boundary. The controller does not approve or merge pull requests. A
successful advisory Actions job is not an enforceable authorization check.

Before you start, you need repository administration access, a checkout of the
reviewed default branch, Node 24.11 or newer, and an authenticated GitHub CLI.
Complete the [GitHub trial](risk-gates-trial.md) before changing merge policy.

## Verify the patch locally

Run the same checks used by continuous integration, or CI:

```bash
npm ci
npm run agent-verify
```

For policy iteration, run `npm run test:risk-policy`. The full verifier runs
that suite through the root `npm test` command. The suite reproduces label
forgery, protected-file renames, missing medium-risk approval, review
revocation, stale evidence, and skipped verification. Local tests prove these
code paths. They do not prove GitHub event delivery or branch-rule enforcement.

## Install one advisory controller

Review and land the controller through normal human review. The default-branch
`Trust Policy Advisory` workflow replaces the separate classifier, approval
gate, and eligibility reporter. Remove retired required-check contexts when
you install the native rules below. Do not require the advisory job as merge
authority.

The controller resolves an immutable default-branch commit before checkout. It
installs no dependencies, executes no PR code, restores no cache or artifact,
and uses no App key. Its write permission changes display labels only.

Every reconciliation reads a fresh PR snapshot and evaluates these fields:

- The current head, base, draft state, and GitHub mergeability.
- Every changed file, including both paths of a rename, with exact file-count
  agreement. Empty, duplicate, malformed, and 3,000-file-limit evidence blocks.
- The complete review history and each human reviewer's current repository
  permission.
- The actual CI workflow, most recently updated run and its current attempt, associated PR head and base,
  and each mandatory job's check identity and successful conclusion.

The controller rereads that snapshot before writing a label or summary. A
change during collection reports unknown risk. An API failure fails the
workflow instead of publishing a candidate. Previously written display labels
can remain stale after an API failure, so no consumer may use them as approval.

The controller displays exactly one of these labels after a completed run:

| Label | Paths | Advisory review requirement |
| --- | --- | --- |
| `risk:low` | Documentation under `docs/` except capability and policy guides or OpenAPI | The evaluator can report a low-risk candidate. Native human review still applies. |
| `risk:medium` | Unrecognized paths, SDK and MCP docs, and the older MCP and SDK quickstart guides | A nonauthor human writer must approve the current head. |
| `risk:high` | Auth, MCP runtime, public SDK declarations, OpenAPI, deployment, workflows, package manifests and lockfiles, verifier code, and risk policy | A nonauthor human writer must approve the current head. |
| `risk:unknown` | Incomplete or changing evidence | Resolve the missing evidence and rerun. |

The executable path rules are in `scripts/ci/classify-pr-risk.mjs`. Labels are
outputs. Manual low, high, or conflicting labels do not change risk or grant
approval.

A later `COMMENTED` review preserves an earlier approval. A dismissed approval,
a new head commit, permission loss, or later changes request revokes it. An
unresolved writer's changes request blocks even when another writer approves.
Medium and high risk never become agent merge candidates.

CI evidence must have a completed `success` conclusion. Missing, pending,
skipped, neutral, stale, wrong-workflow, wrong-App, and duplicate job evidence
blocks the candidate. Fork and Dependabot PRs use the offline CI jobs. Their
credentialed preview jobs are not required because CI excludes them. A passing
preview job does not prove that an authenticated call ran when its credential
was unavailable. Review gateway changes with the separate live integration
verification before release.

## Configure native human protection

Keep repository auto-merge disabled. Protect the default branch with these
native requirements:

1. Require at least one human approval, CODEOWNERS approval, and resolution of
   review conversations.
2. Dismiss stale approvals on new commits and require approval of the latest
   reviewable push.
3. Require `Vite+ monorepo check` from the GitHub Actions App and require the
   branch to be up to date.
4. Remove bypass actors. If you use legacy branch protection, enforce the rules
   for administrators too.

The default CODEOWNERS entry covers every path with the listed human owners.
Keep that coverage during this rollout so an automation approval cannot replace
the required owner review on an otherwise unowned path.

These native settings apply to low risk as well. The custom policy cannot
provide an immediate merge-time review-revocation guarantee.

Read the installed configuration without changing it:

```bash
node scripts/ci/read-risk-config.mjs Terminal49/API > /tmp/api-risk-config.json
cat /tmp/api-risk-config.json
```

A configured repository reports `nativeHumanReviewConfigured: true` and exits
with code 0. An unprotected repository reports `false`, explains the missing
review and status-check settings, and exits with code 1. Authentication,
permission, or network failure also exits with code 1 and does not establish
any policy. The report always sets `autoMergeEligible: false`.

The command reads effective branch rules, their source rulesets and bypass
actors, legacy protection, and the repository auto-merge setting. It cannot
prove actual merge-box behavior. Complete the trial even when it returns true.

## Check event delivery and recover missed runs

PR updates and CI completion trigger the default-branch controller. The
unprivileged `Trust Review Signal` workflow executes no policy and only asks
the controller to refresh after a review. A PR can remove this relay.

Hourly scheduled and manual reconciliation inspect current open PRs when an
event is missed. GitHub may replace pending concurrency runs, delay schedules,
or omit a fork run's PR association. These triggers provide eventual refresh.
They cannot atomically revoke a report after a same-head review dismissal.
Native human protection must deny the merge during that interval.

If a summary is missing, inspect the controller's Actions log. Rerun it from
the default branch with the PR number, then inspect the new head and base in
the summary. Keep merging blocked if collection or publication fails.

## Keep Jev observational

`Shadow Risk` writes only `risk-shadow:*` labels and a comparison comment. It
uses the trusted default-branch script and validates complete rename-aware
files. With `JEV_API_KEY` configured, it sends bounded public PR metadata and
diff text to Jev. Without the key, or on an invalid response, it uses its
heuristic fallback.

Neither output influences deterministic classification, human approval, or
merge permission. Calibrate against human-reviewed examples before proposing
any change to that boundary.

## Defer automated merging

This patch has no dedicated App publisher, credential setup, merge actuator,
or low-risk review exemption. Every summary reports auto-merge ineligible.
Adding an environment variable cannot activate merging.

A future enforceable publisher needs a dedicated App identity and a protected
environment restricted to the exact default branch. Keep its private key only
in that environment. Do not put the key in repository or organization secrets
reachable by PR workflows. Bind the required check to the App's numeric source
identity and read the rule back.

GitHub Actions can produce the same job name from a modified PR workflow.
Matching a name or the shared GitHub Actions App does not establish policy
ownership. Complete the source-forgery and review-revocation trials before
adding an App publisher. Removing low-risk human review also requires a
separate design that authorizes the merge against current evidence.
