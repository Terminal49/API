# Verify the policy on GitHub before activation

Use this trial to test real GitHub behavior after the reviewed controller is
installed on a disposable repository's default branch. Keep auto-merge
disabled and retain native required human review throughout the trial. Do not
merge any probe PR or use a bypass flag.

Before you start, you need an administrator who can configure native rules,
a PR author, a second human with write access, a third reviewer for revocation
cases, and a fork contributor. GitHub Actions must be enabled. Use public-safe
fixture data and no production credentials.

## Establish the baseline

1. Run `npm run agent-verify` on the installed revision.
2. Configure the native settings described in [the installation guide](risk-gates.md).
3. Run the read-only configuration verifier:

   ```bash
   node scripts/ci/read-risk-config.mjs OWNER/REPO > /tmp/risk-config.json
   cat /tmp/risk-config.json
   ```

4. Save the installed commit, the configuration output, the source ruleset
   IDs, bypass actors, and the required-check source IDs.
5. Open an unapproved PR with passing CI. Verify that GitHub's merge box denies
   merging for the author, the reviewer, and an administrator without bypass.

The baseline passes only when the verifier exits 0 and the real merge box
denies an unapproved merge. Green local tests or a green advisory job alone
cannot pass the baseline.

## Run adversarial PR probes

For every probe, save its PR URL, head and base SHAs, controller run URL, summary,
relevant review IDs and states, CI run ID and attempt, and the merge-box result.
Use the read commands below to capture API evidence.

| Probe | Change or event | Required observation |
| --- | --- | --- |
| Trusted source forgery | Change the policy workflow in the PR to report success and preserve its old job name. | The controller executes installed default-branch code. Risk is high and the unapproved PR remains blocked by native review. |
| Label race | Start with a documentation PR, then push an auth change while the old low label remains. Apply a forged low label too. | The next summary classifies the new auth head as high without reading labels for approval. Native latest-push protection blocks immediately, before refresh. |
| Rename | Rename `.github/CODEOWNERS` into `docs/codeowners.mdx`, then test the reverse direction. | Both directions classify as high. Missing or incomplete rename evidence is unknown and never a candidate. |
| Automation approval | Have an installed review bot approve a README or docs PR. | Required CODEOWNERS review still denies merging until a listed human owner approves. Confirm the default ownership entry covers these files. |
| Medium paths | Change `README.md`, then the existing MCP guide and SDK quickstart guide. | All require a current-head nonauthor human writer approval in the advisory evaluator. Native review denies the unapproved merge. |
| Approval lifecycle | Approve the current head, then submit a comment-only review. | The advisory approval remains satisfied. |
| Changes requested | Submit changes requested from the approving writer, then approve from another writer. | The unresolved changes request blocks the policy. The native merge box also denies the merge. |
| Dismissal | Dismiss the only current-head approval without changing the head. | Native review immediately denies the merge. Event or scheduled refresh later reports missing approval. |
| New head | Approve, then push a new commit. | Native stale and latest-push review protection denies merging. The controller rejects the old approval. |
| Permission loss | Remove the approving reviewer's write permission. | The next controller run does not count their approval. Inspect native behavior separately and retain human review if immediate denial is not demonstrated. |
| Skipped verification | Make a required CI job skip or finish neutral. Delete or rename a required job in another probe. | The policy refuses the candidate even if the overall run is green. |
| CI provenance | Produce a passing same-name job in a different workflow or from another App. | It cannot substitute for an actual required CI workflow/run/attempt and check-suite identity. |
| Rerun freshness | Rerun a failing CI attempt, then start another pending attempt. | A previous successful run or attempt does not substitute for the latest pending or failing evidence. |
| Shared head | Open two PRs with the same head SHA and different bases. | The controller withholds a candidate because commit-scoped check evidence is ambiguous. |
| Delayed delivery | Remove the review relay in a probe, then dismiss approval. Dispatch the controller manually and wait for a scheduled run. | Native review blocks during the delay. Manual and scheduled runs recover advisory evidence. Record the delay without claiming atomic delivery. |
| Duplicate delivery | Dispatch the same PR repeatedly without changing its head. | Each run reads fresh evidence and converges to one display risk label. No run enables auto-merge. |
| Fork | Open a fork PR and submit a review. | The trusted job executes no fork code with write credentials. Missing fork CI association blocks until trustworthy evidence exists. Offline CI can pass without preview secrets. |
| Dependabot | Open or use a dependency-update PR. | No App or preview credential is exposed. Manifests and lockfiles classify high. The PR stays ineligible for automated merge. |
| API failure | In the disposable controller, inject an unavailable review, permission, or check endpoint, then rerun. | The run fails without reporting a successful candidate. A stale label has no merge authority. |

Inspect PR and review evidence:

```bash
gh api repos/OWNER/REPO/pulls/NUMBER --jq '{head: .head.sha, base: .base.sha, merge: .merge_commit_sha, mergeable, mergeable_state, changed_files}'
gh api repos/OWNER/REPO/pulls/NUMBER/reviews --paginate --jq '.[] | {id, state, commit_id, reviewer: .user.login}'
gh api repos/OWNER/REPO/actions/runs/RUN_ID --jq '{id, workflow_id, path, event, head_sha, run_attempt, status, conclusion, pull_requests}'
gh api repos/OWNER/REPO/actions/runs/RUN_ID/attempts/ATTEMPT/jobs --paginate --jq '.jobs[] | {id, name, run_id, run_attempt, status, conclusion, check_run_url}'
gh api repos/OWNER/REPO/commits/HEAD_SHA/check-runs --paginate --jq '.check_runs[] | {name, head_sha, status, conclusion, app: .app.id, suite: .check_suite.id}'
```

A probe fails when the observed merge box permits an unapproved or revoked
merge, a summary calls missing evidence verified, or PR code runs with controller
credentials. Record the failure and repair it before changing policy.

## Test a future App publisher separately

The current patch does not implement this publisher. Keep this part blocked
until a separately reviewed implementation exists.

1. Restrict the publisher environment to the exact default branch. Keep the
   App key only there and give the App no merge permission.
2. Select the App's numeric identity as the required check source. Read the
   effective branch rule and confirm that identity.
3. Publish a failing App-owned check on a probe head. Produce a successful
   same-name Actions check on that head. Verify that GitHub still denies merge.
4. Verify a passing App check is attached to the current head or the accepted
   test-merge revision. Repeat after a new head and a changed base.
5. Repeat dismissal, changes request, permission loss, shared-head, delayed-event,
   and failed-publication probes. Native review must continue to deny merging
   during asynchronous refresh gaps.
6. Keep auto-merge disabled if any check source, head association, or revocation
   result is ambiguous.

An App trial proves source binding only after GitHub denies the forged check
in the real merge box. A passing App check alone does not authorize removing
native human review or implementing automatic merging.
