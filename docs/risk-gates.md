# Pull request risk gates

Terminal49 uses deterministic path labels to decide the review policy for each
pull request. Model scoring is observational until it has enough labeled data
to calibrate.

## Authoritative path risk

`PR Risk Classifier` applies exactly one merge-policy label. The highest-risk
changed path determines the pull request label:

| Label | Typical paths | Merge policy |
| --- | --- | --- |
| `risk:low` | Pure documentation under `docs/**`, excluding OpenAPI and MCP or SDK capability docs | Agent auto-merge eligible after all required checks pass; no human review required |
| `risk:medium` | Everything not explicitly low or high, including MCP and SDK capability docs | Human review required; no agent auto-merge |
| `risk:high` | Workflow and repository controls, root package and lockfiles, OpenAPI, the MCP server, OAuth/API gateway, SDK public exports, deploy configuration, and agent-trust/risk policy | `Risk Gate` requires current-head approval from a human with repository write access; never agent auto-merge |

The full executable policy is in
`scripts/ci/classify-pr-risk.mjs`. Classification is conservative: an
unrecognized path is medium, and an empty file list fails to medium. A manual
`risk:high` promotion is sticky when the classifier reruns.

`CODEOWNERS` identifies owners for high-risk paths. CODEOWNERS review and Risk
Gate are complementary: Risk Gate specifically verifies that an approving
human has write access and approved the pull request's current head commit.
Pushing another commit invalidates that approval.

## Shadow scoring

`Shadow Risk` applies one of `risk-shadow:low`, `risk-shadow:medium`, or
`risk-shadow:high` and maintains a sticky comparison comment. These labels:

- never change the authoritative `risk:*` label;
- never block or enable a merge;
- never count as approval; and
- remain shadow-only until roughly 50 pull requests have human-reviewed labels.

When the `JEV_API_KEY` repository secret is available, the workflow sends
bounded pull request metadata and diff text to Jev's fixed API endpoint for a
three-level score. Pull request content is treated as untrusted data. The key
is never read from pull request code or printed.

Without that secret, or if Jev is unavailable or returns an invalid response,
the workflow uses a documented deterministic heuristic based on change size,
non-documentation files, and security, deployment, API, or public-surface
terms. The sticky comment records whether Jev or the heuristic produced the
shadow label.

After the calibration sample is large enough, compare false-low and false-high
rates by path tier. Adjust shadow thresholds or prompts first. Do not give
shadow labels merge authority without a separate reviewed policy change.

## Auto-merge pathways

The policy has three explicit pathways:

1. `risk:low`: an agent may use repository auto-merge only when required CI
   (including `agent-verify`), `PR Risk Classifier`, and `Risk Gate` are green.
   Human review is not required.
2. `risk:medium`: human review is required. Agents must not enable auto-merge.
3. `risk:high`: a human with write access must approve the current head and
   Risk Gate must pass. Agents must never enable auto-merge.

`Auto-merge Eligibility` posts a non-blocking sticky report. It reads labels
and check results but never approves a pull request, calls a merge API, or
enables auto-merge.

> **Administrator follow-up:** Do not enable **Allow auto-merge** until CI
> (running `agent-verify`), PR Risk Classifier, and Risk Gate are required
> checks in the repository's **Main Rules** ruleset. Confirm those exact check
> names on a pull request before changing the ruleset.

## Extending the policy to another repository

1. Inventory that repository's auth, deployment, data-contract, package export,
   workflow, and verification control planes.
2. Port the classifier and tests, replacing path rules rather than copying API
   paths blindly.
3. Add matching CODEOWNERS entries and install the classifier and Risk Gate in
   shadow mode on test pull requests.
4. Require the deterministic checks in the default-branch ruleset.
5. Enable repository auto-merge only after low-risk pull requests prove the
   required checks are stable.
6. Collect about 50 human-reviewed pull requests before considering any use of
   fuzzy shadow scoring outside observation.
