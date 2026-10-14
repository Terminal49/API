# Verify deployed coverage

Run this read-only check from a checkout of the deployed revision:

```sh
node tools/verify-deployed-coverage.mjs > coverage-verification.json
```

The command requires actual JSON/CSV anchors on all four rendered coverage pages. It checks downloads from both the page Markdown and data references, including unexpected JSON/CSV filenames. It compares ordered entity headings, identifiers, feature tables and snapshots with this checkout. Agent-index entries must point to the exact deployment page or its `.md` endpoint, not another host or a matching path prefix. Missing links, failed HTTP requests, incomplete indexes and data mismatches produce a nonzero exit code and a JSON report. Requests time out after 30 seconds. No credentials are required.

To check another deployment, pass its docs base URL:

```sh
node tools/verify-deployed-coverage.mjs https://example.com/docs/
```

Use the revision deployed at that URL. An unmerged data change will correctly report a mismatch against production. This checks published content and discoverability; it does not validate source integration capabilities, UI interaction, or data freshness. It does not refresh data or publish changes.

The [recurring refresh runbook](coverage-refresh-runbook.md) defines owners, evidence freshness, six-table validation, source provenance and proposal review. Source export installation, retrieval and normalization remain unverified. Run local tests without production access; a live check is a separate authorized action.

Run the deterministic checker tests separately from live network checks:

```sh
node --test tools/verify-deployed-coverage.test.mjs
```
