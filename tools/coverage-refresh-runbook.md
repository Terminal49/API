# Recurring coverage refresh

Status: the Monday 09:00 Pacific verification follow-up exists. Automatic source refresh is **not operational**. The export helper has local protocol tests, but installation in the source project, a real full export, private artifact retrieval and importer normalization remain unverified. This document specifies the required procedure; it does not configure those systems.

## Owners and handoffs

| Responsibility | Owner | Required handoff |
| --- | --- | --- |
| Source execution and export installation | Hex project editor, to be assigned before activation | Verified run metadata, complete private bundle and schema version |
| Current integration configuration and capability declarations | Integration maintainer for each source | Reviewed declarations, enablement and credential conditions, source revision |
| Bundle validation, normalization and draft proposal | API coverage maintainer | Validation report, generated diff and private evidence references |
| Status changes and publication approval | Coverage data owner and docs reviewer | Explicit approval of proposed entities, fields and conditions |
| Deployment and post-publication verification | Release owner | Separate merge/deploy authorization and deployed revision |

These are required roles, not confirmed personnel assignments. The coverage maintainer must record each assigned owner and private artifact destination before enabling automatic refresh. The scheduled follow-up may continue verification while installation is blocked, but it must not invent fresh data.

## Install the source producer

The Hex connector used for the investigation can read source logic and run an analysis thread. It cannot install or execute a cell in the original source project. A project editor must complete these steps inside that project:

1. Review the prepared private `export_full_coverage` helper. Add a private Python cell after the six complete materialized output frames. Do not use browser previews, `.head()`, or an analysis-thread reconstruction of the source tables.
2. Bind the verified project ID, source run ID and timezone-qualified source run start timestamp from the actual source execution record. Record the query/code revision and observation window. Do not substitute the export time or invent a runtime metadata variable.
3. Supply exactly these full frames: `coverage_app`, `coverage_detail_app`, `rail_coverage_app`, `rail_coverage_detail_app`, `line_coverage_app`, and `line_coverage_detail_app`. Retain independently captured full-source row counts from that execution. Counts inferred from received previews cannot prove completeness.
4. Invoke the helper with those frames, verified metadata, expected counts and a new private output directory. It must produce six JSON files, six CSV files and a manifest. Record schema version, counts, SHA-256 checksums, `runStartedAt` and distinct `exportedAt`. Never overwrite an earlier run bundle.
5. Configure an approved private artifact upload and retrieval mechanism. Prove that the consumer retrieves the same immutable bundle by run ID and verifies its checksums. A cell that writes only local files is insufficient.
6. Implement the normalization adapter into the generator's `--importHex` contract. Validate it with the complete bundle and reviewed integration registry. Do not map dashboard symbols directly into public support declarations.
7. Complete one supervised export, retrieval, validation, normalization and draft-PR cycle. Confirm pandas serialization on the real frames; local protocol fixtures do not prove the Hex runtime. Record the actual successful evidence timestamps and unresolved conditions. Only then enable recurring source execution and retrieval with the assigned owners.

Installation, source execution, artifact retrieval and the adapter are still outstanding. The scheduled follow-up alone is not a substitute. No production query, tracking request or publication is needed to run this PR's local checker tests.

## Validate every weekly bundle

Start with a checkout of the intended base revision and retain its Git SHA. The coverage maintainer validates the private bundle before generating any public proposal:

- Require one verified source execution and exactly the six table names above, each in both formats, plus a complete manifest. Reject missing, duplicate or unexpected tables. Match independent source counts with the manifest and parsed row counts; do not accept a 50-row preview when the source count is larger. An unexpected empty table requires source-owner review.
- Parse all files, verify every checksum and check JSON/CSV row equivalence after explicit null and numeric normalization. Reject nonfinite numeric values, duplicate entity/feature identities, malformed identifiers and summary/detail joins that silently discard rows.
- Require a versioned schema for each frame. Validate expected columns, types, nullability, identifiers, feature keys, status vocabulary, units and timestamp semantics. Unexpected columns or schema changes stop the run until the normalization mapping is reviewed. The real frame schema and adapter have not yet been pinned; recording and testing them is an activation prerequisite.
- Require timezone-qualified source execution and export timestamps. Reject future times and source runs older than seven days at consumption. Record `evidenceAt` from the verified source execution, not the checker clock, alongside the observation window and export time. Keep the previous published date on failure. A review date must remain separate from source freshness.
- Retain project/run IDs, source query/code revision, schema version, counts, hashes, current integration configuration evidence and declaration revision privately. Validate that all frames belong to that execution. Checksums alone prove file integrity, not provenance.
- Select only approved public fields for generated output. Keep raw SQL, customer/container identifiers, credentials, internal configuration and traffic evidence out of this public repository and PR descriptions.

## Reconcile capabilities and observations

Maintain distinct internal records for each exact entity and feature:

| Record | Meaning |
| --- | --- |
| Reviewed capability | Implemented field/milestone, current enablement, applicable conditions and reviewed source revision |
| Observation | Source-attributed successful data, observation window and source execution evidence time |
| Proposal | Public status derived under the reviewed policy, with unresolved conditions and private evidence references |

A parser method, a dashboard rate threshold or a low-volume default is not proof of production support. Missing traffic is not proof of non-support. An observation may corroborate a declaration; it must not silently replace one. Missing declarations, missing provenance or inconclusive observations remain explicitly `unknown`. Contradictions require integration-owner review rather than automatic promotion or downgrade. Do not relabel unknown as unsupported to remove gaps.

Join terminals by verified port location and terminal identifiers, and carriers by exact primary SCAC. Do not inherit status through a carrier alias or a terminal name. Preserve credential requirements, account-specific admission, product entitlements and rail-plan conditions. Current container terminal assignment must not be treated as historical discharge attribution. Carrier-reported LFD, terminal LFD and estimated LFD remain distinct features and sources.

## Propose, review and verify

1. Validate and normalize the fresh private bundle. Record explicit unknowns and unresolved conflicts in the private review report.
2. Run the importer with the approved reviewed maps, regenerate public tables and downloads, then run `npm run test:coverage` and `git diff --check`. Inspect every changed entity, status, identifier and source date. A generator passing its tests does not verify the source claims.
3. Open or update a draft proposal PR. Explain capability changes separately from observation changes, preserve conditions and link private evidence only through the approved internal review system. Keep tooling and docs in separate commits. No proposal is automatically published.
4. Require coverage-data and docs review before publication. The release owner needs separate authorization to merge/deploy. Unresolved integration attribution, source revision or schema conditions remain blockers.
5. After an authorized deployment, run `node tools/verify-deployed-coverage.mjs` from the exact deployed revision. Archive its JSON report and actual verification time. Check all browser downloads, complete Markdown references, entity headings and exact agent-index destinations. Report failure to the release owner; do not claim success from local regeneration alone.

## Failure and stale behavior

Any missing artifact, failed fetch, schema/count/hash mismatch, stale run, unknown provenance or access failure stops data refresh. Keep the last reviewed public snapshot and its date. Record the failing stage, run ID if known, responsible owner and evidence timestamp privately. Never reimport an old bundle as new or silently skip a missing table. A data conflict can produce a review proposal while public status remains unchanged.

The weekly follow-up can continue independent deployed-content checks and report actionable failures. Resume source refresh only after the source owner repairs the problem and a fresh complete run passes every gate. End-to-end refresh is operational only after the supervised cycle above has been demonstrated and the recurring producer/retriever is configured.
