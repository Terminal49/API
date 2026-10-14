# Verify deployed coverage

Run this read-only check from a checkout of the deployed revision:

```sh
node tools/verify-deployed-coverage.mjs > coverage-verification.json
```

The command checks all four coverage pages, their complete Markdown references, the agent index, and JSON/CSV links extracted from the deployed pages. It compares tables, identifiers and downloads with this checkout. A missing link, failed HTTP request, incomplete index or data mismatch produces a nonzero exit code and a JSON report. Requests time out after 30 seconds. No credentials are required.

To check another deployment, pass its docs base URL:

```sh
node tools/verify-deployed-coverage.mjs https://example.com/docs/
```

Use the revision deployed at that URL. An unmerged data change will correctly report a mismatch against production. This checks published content and discoverability; it does not validate source integration capabilities, UI interaction, or data freshness. It does not refresh data or publish changes.

Run the deterministic checker tests separately from live network checks:

```sh
node --test tools/verify-deployed-coverage.test.mjs
```
