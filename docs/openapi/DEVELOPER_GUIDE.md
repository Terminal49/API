# OpenAPI Developer Guide

This guide provides detailed workflows for working with Terminal49's modular OpenAPI specification.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Understanding the Architecture](#understanding-the-architecture)
- [Development Workflows](#development-workflows)
- [Best Practices](#best-practices)
- [Advanced Topics](#advanced-topics)
- [Troubleshooting](#troubleshooting)

## Quick Reference

### Most Common Commands

```bash
# Setup (first time only)
just setup

# Bundle OpenAPI
just bundle              # Python (production method)
just bundle-redocly      # Redocly CLI (optional)

# Validate everything
just validate            # Bundle + lint + test

# Development
just watch               # Auto-bundle on file changes
just preview             # Preview docs locally

# Maintenance
just lint                # Lint with Spectral
just test                # Run regression test
```

### File Locations Cheat Sheet

| What | Where |
|------|-------|
| Endpoint definitions | `docs/openapi/paths/*.yaml` |
| Data models (schemas) | `docs/openapi/components/schemas/*.yaml` |
| Root OpenAPI document | `docs/openapi/index.yaml` |
| Bundled output | `docs/openapi.json` (auto-generated) |
| Task commands | `justfile` (root directory) |
| Bundler implementation | `tools/openapi_bundle.py` |
| Pre-commit hook | `scripts/pre-commit.sh` |

## Understanding the Architecture

### Why Modular OpenAPI?

**Problem:** A 9700+ line `openapi.json` file is:
- Hard to navigate and edit
- Prone to merge conflicts
- Difficult to review in PRs
- Easy to introduce errors

**Solution:** Split into small, focused YAML files:
- One file per endpoint (`paths/shipments.yaml`)
- One file per schema (`components/schemas/shipment.yaml`)
- Easy to find, edit, and review
- Git diffs are meaningful

### How References Work

OpenAPI uses `$ref` to reference other parts of the specification.

**Internal references** (same file):
```yaml
# Points to #/components/schemas/shipment in bundled output
$ref: "#/components/schemas/shipment"
```

**External references** (different file):
```yaml
# Points to another YAML file
$ref: "./shipment.yaml"
$ref: "../schemas/container.yaml"
```

**Fragment references** (specific property):
```yaml
# Points to a nested property
$ref: "./shipment.yaml#/properties/id"
```

The bundler resolves all external `$ref`s into a single `openapi.json` file.

### The Two Bundlers

| Feature | Python Bundler | Redocly CLI |
|---------|---------------|-------------|
| **Production use** | ✅ Yes (CI/CD) | ❌ No (dev only) |
| **Dependencies** | None (stdlib only) | Requires Bun/Node.js |
| **Speed** | ~100-200ms | ~150-300ms |
| **Error messages** | Good (enhanced) | Excellent |
| **Extra features** | Schema validation | Lint, preview, stats |
| **Command** | `just bundle` | `just bundle-redocly` |

**Recommendation:** Use either during development, but Python is required for CI/CD.

## Development Workflows

### Workflow 1: Quick Edit (With Pre-commit Hook)

**Best for:** Small changes, fixing typos, updating examples

1. **Setup** (once):
   ```bash
   just install-hooks
   ```

2. **Edit** any YAML file:
   ```bash
   vim docs/openapi/paths/shipments.yaml
   ```

3. **Commit**:
   ```bash
   git add docs/openapi/
   git commit -m "fix: update shipment example"
   # Hook auto-bundles and stages openapi.json
   ```

4. **Push**:
   ```bash
   git push
   ```

### Workflow 2: Active Development (With Watch Mode)

**Best for:** Adding new endpoints, refactoring schemas, bulk edits

1. **Start watch mode**:
   ```bash
   just watch
   # Watches docs/openapi/**/*.yaml, auto-bundles on save
   ```

2. **Edit** files in your editor – bundle updates automatically

3. **Check** the diff:
   ```bash
   git diff docs/openapi.json
   ```

4. **Validate** when done:
   ```bash
   just validate
   ```

5. **Commit**:
   ```bash
   git add docs/openapi/
   git commit -m "feat: add tracking status endpoint"
   git push
   ```

### Workflow 3: Large Refactoring (Manual Control)

**Best for:** Structural changes, testing different approaches

1. **Create a branch**:
   ```bash
   git checkout -b refactor/shipment-schema
   ```

2. **Make changes** to YAML files

3. **Bundle and check**:
   ```bash
   just bundle
   git diff docs/openapi.json
   ```

4. **Validate**:
   ```bash
   just validate
   # or run each step:
   just lint
   just test
   ```

5. **Iterate** until satisfied

6. **Commit and push**:
   ```bash
   git add docs/openapi/
   git commit -m "refactor: simplify shipment relationships"
   git push origin refactor/shipment-schema
   ```

7. **Create PR** for review

### Workflow 4: Preview Docs Locally

**Best for:** Seeing how changes look before deploying

#### Option A: Redocly Preview (OpenAPI Only)

1. **Start preview server**:
   ```bash
   just preview
   # Opens http://localhost:8080
   # Shows interactive API docs from openapi.json
   ```

2. **Make changes** to YAML files

3. **Rebuild** (in another terminal):
   ```bash
   just bundle
   ```

4. **Refresh** browser to see changes

#### Option B: Mintlify Preview (Full Documentation)

**Recommended for comprehensive preview**

1. **Quick start**:
   ```bash
   just dev
   # Bundles + lints + starts Mintlify preview
   # Opens http://localhost:3000
   ```

   This runs:
   - Bundle OpenAPI with Python
   - Lint with Spectral
   - Start Mintlify dev server

2. **Or with full validation**:
   ```bash
   just dev-full
   # Bundles + validates + tests + starts Mintlify
   # Use this before creating a PR
   ```

3. **Make changes** and Mintlify auto-reloads

4. **Commit** when satisfied

**Why Mintlify Preview?**
- ✅ Shows the full docs (OpenAPI + MDX content)
- ✅ Exact replica of docs.terminal49.com
- ✅ Auto-reloads on changes
- ✅ Tests navigation and layout

## Best Practices

### File Organization

**DO:**
- ✅ One endpoint per file: `paths/shipments.yaml`, `paths/shipments-id.yaml`
- ✅ One schema per file: `components/schemas/shipment.yaml`
- ✅ Use descriptive filenames that match the resource
- ✅ Group related paths in subdirectories if needed

**DON'T:**
- ❌ Put multiple endpoints in one file
- ❌ Put all schemas in `components/schemas.yaml`
- ❌ Use generic names like `endpoint1.yaml`

### Naming Conventions

**Paths:**
- Use kebab-case: `shipments-id-stop-tracking.yaml`
- Match the URL path: `/shipments/{id}/stop_tracking` → `shipments-id-stop-tracking.yaml`

**Schemas:**
- Use kebab-case: `shipping-line.yaml`
- Match the schema name: `shipping_line` → `shipping-line.yaml`

**Components:**
- Use kebab-case for files
- Use snake_case for OpenAPI identifiers

### Schema Design

**Keep schemas focused:**
```yaml
# Good: Focused schema
title: "Shipment model"
type: "object"
properties:
  id:
    type: "string"
    format: "uuid"
  bill_of_lading_number:
    type: "string"
```

**Use $ref for reusability:**
```yaml
# Good: Reuse common patterns
properties:
  port_of_lading:
    $ref: "#/components/schemas/port"
```

**Avoid deep nesting:**
```yaml
# Bad: Too deeply nested
properties:
  data:
    properties:
      attributes:
        properties:
          relationships:
            properties:
              # ... too deep!
```

Instead, extract to separate schemas and use `$ref`.

### Documentation

**Add descriptions:**
```yaml
# Good: Helpful description
pol_timezone:
  type: "string"
  description: "IANA tz database timezone (e.g., America/New_York)"
  nullable: true
```

**Include examples:**
```yaml
# Good: Real-world example
examples:
  En-route to NY:
    value:
      id: "62738624-7032-4a50-892e-c55826228c25"
      type: "shipment"
      # ... full example
```

**Mark deprecated fields:**
```yaml
# Good: Clear deprecation
q:
  schema:
    type: "string"
  in: "query"
  name: "q"
  description: "Search shipments (deprecated: use filter[] params instead)"
  deprecated: true
```

### Validation

**Always validate before committing:**
```bash
just validate
```

This runs:
1. Bundle with schema validation
2. Spectral lint
3. Regression test (ensures bundle matches)

**Check lint errors seriously:**
```bash
just lint
# Fix all errors and warnings
```

**Test CI locally:**
```bash
just ci
# Simulates GitHub Actions workflow
```

## Advanced Topics

### Custom Validation Rules

The Python bundler includes schema validation. To add custom rules, edit `tools/openapi_bundle.py`:

```python
def _validate_schema_file(path: Path, data: Any) -> None:
    # Add custom validation logic here
    if "deprecated" in data.get("attributes", {}):
        # Warn about deprecated fields
        pass
```

### Resolving Circular References

If you get "Circular $ref detected":

1. **Identify the chain** from error message:
   ```
   Reference chain:
     1. docs/openapi/components/schemas/shipment.yaml
     2. docs/openapi/components/schemas/container.yaml
     3. docs/openapi/components/schemas/shipment.yaml
   ```

2. **Break the cycle** by:
   - Using `nullable` instead of `$ref` for one direction
   - Extracting common properties to a base schema
   - Using `allOf` composition

3. **Example fix:**
   ```yaml
   # Before (circular):
   # shipment.yaml references container
   # container.yaml references shipment

   # After (break cycle):
   # shipment.yaml references container
   # container.yaml just includes shipment_id (string)
   ```

### Working with Large Schemas

For very large schemas (200+ lines):

1. **Split into logical sections:**
   ```
   components/schemas/
   ├── shipment/
   │   ├── base.yaml           # Core properties
   │   ├── relationships.yaml  # Relationship properties
   │   └── index.yaml          # Combines base + relationships
   ```

2. **Use composition:**
   ```yaml
   # shipment/index.yaml
   allOf:
     - $ref: "./base.yaml"
     - $ref: "./relationships.yaml"
   ```

### Programmatic Bundling

Use the Python bundler in scripts:

```python
from pathlib import Path
from tools.openapi_bundle import bundle_openapi, write_bundle

# Bundle to dict
spec = bundle_openapi(Path("docs/openapi/index.yaml"))

# Or write to file
write_bundle(
    Path("docs/openapi/index.yaml"),
    Path("docs/openapi.json"),
    validate_schemas=True
)
```

Use Redocly in Node.js:

```javascript
import { bundle, loadConfig } from '@redocly/openapi-core';

const config = await loadConfig();
const result = await bundle({
  ref: 'docs/openapi/index.yaml',
  config
});
```

### Automation Ideas

**Auto-format on save** (VS Code):
```json
// .vscode/settings.json
{
  "files.associations": {
    "*.yaml": "yaml"
  },
  "editor.formatOnSave": true
}
```

**Git pre-push hook** (extra safety):
```bash
# .git/hooks/pre-push
#!/bin/bash
just validate || {
  echo "Validation failed! Fix errors before pushing."
  exit 1
}
```

## Troubleshooting

### Problem: "Bundle is out of sync"

**Symptom:** CI fails with "Bundle doesn't match YAML sources"

**Solution:**
```bash
just bundle
git add docs/openapi.json
git commit --amend --no-edit
```

### Problem: "Referenced file not found"

**Symptom:**
```
Referenced file not found: ./schemas/shipment.yaml
  Referenced from: docs/openapi/paths/shipments.yaml
```

**Solutions:**
1. Check path is relative to current file
2. Verify file exists: `ls docs/openapi/components/schemas/shipment.yaml`
3. Check spelling and case (case-sensitive!)

### Problem: "Schema validation failed"

**Symptom:**
```
Schema file appears to be missing expected fields: container.yaml
Expected at least one of: type, properties, anyOf, oneOf, allOf, $ref, enum
```

**Solutions:**
1. Check schema has proper structure
2. Verify it's not missing `type: "object"` or `properties:`
3. Look at similar schemas for reference

### Problem: Watch mode not working

**Symptom:** Changes to YAML don't trigger rebuild

**Solutions:**
```bash
# Restart Watchman daemon
watchman shutdown-server
just watch

# Or use simple watch
bun run watch
```

### Problem: Merge conflicts in openapi.json

**Symptom:** Git conflicts in the 9700-line bundle

**Solution:**
```bash
# 1. Accept your YAML changes
git checkout --ours docs/openapi/
git checkout --theirs docs/openapi/

# 2. Rebuild from YAML
just bundle

# 3. Commit the regenerated bundle
git add docs/openapi.json
git commit
```

### Problem: Slow bundling

**Symptom:** Bundle takes >1s

**Solutions:**
```bash
# Skip validation (faster)
just bundle-fast

# Or use Redocly (faster bundler)
just bundle-redocly
```

## Getting More Help

- **README:** `docs/openapi/README.md`
- **Justfile commands:** `just --list` or `cat justfile`
- **Python bundler help:** `python -m tools.openapi_bundle --help`
- **Redocly docs:** https://redocly.com/docs/cli
- **OpenAPI spec:** https://spec.openapis.org/oas/v3.0.3
- **JSONAPI spec:** https://jsonapi.org/format/

## Contributing

When contributing OpenAPI changes:

1. **Follow existing patterns** in similar files
2. **Add examples** for new endpoints
3. **Document** all fields with descriptions
4. **Validate** before committing: `just validate`
5. **Test** that docs render correctly: `just preview`
6. **Keep PRs focused** – one feature/fix per PR

## Appendix: File Structure Example

Complete example of a new endpoint:

### 1. Create path file
```yaml
# docs/openapi/paths/tracking-status.yaml
get:
  summary: "Get tracking status"
  tags:
    - "Tracking"
  parameters:
    - name: "shipment_id"
      in: "query"
      required: true
      schema:
        type: "string"
        format: "uuid"
  responses:
    200:
      description: "OK"
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/tracking_status"
```

### 2. Create schema file
```yaml
# docs/openapi/components/schemas/tracking-status.yaml
title: "Tracking Status"
type: "object"
properties:
  status:
    type: "string"
    enum: ["pending", "in_transit", "delivered"]
  updated_at:
    type: "string"
    format: "date-time"
required:
  - "status"
```

### 3. Update index
```yaml
# docs/openapi/index.yaml (add to existing sections)
paths:
  /tracking_status:
    $ref: "./paths/tracking-status.yaml"

components:
  schemas:
    tracking_status:
      $ref: "./components/schemas/tracking-status.yaml"
```

### 4. Bundle and validate
```bash
just validate
```

### 5. Commit
```bash
git add docs/openapi/
git commit -m "feat: add tracking status endpoint"
```

Done! 🎉
