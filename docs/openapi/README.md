# OpenAPI Authoring Workflow

This repository maintains the API reference as a modular OpenAPI 3.0 specification. The
single `docs/openapi.json` file that Mintlify consumes is **auto-generated** from the YAML
sources in this folder.

**⚠️ Important:** The YAML files are the **source of truth**. Never edit `docs/openapi.json`
directly – it will be overwritten!

## Directory Layout

```
docs/openapi/
├── index.yaml              # Root document with info, servers, tags, shared components
├── paths/                  # One file per REST endpoint (you can create sub-folders)
├── components/
│   ├── schemas/            # Reusable schema definitions referenced from the paths
│   └── securitySchemes/    # Authentication descriptions
└── README.md               # You are here
```

All references between files use relative `$ref` pointers (e.g.,
`$ref: ../components/schemas/shipment.yaml`). Feel free to group related paths inside
subdirectories – the bundler resolves file references relative to where they are declared.

## Quick Start

**🚀 Recommended Development Workflow:**
```bash
# First-time setup
just setup

# Start developing (bundle + lint + preview)
just dev
# Opens http://localhost:3000 with full Mintlify documentation
# Auto-reloads on changes
```

**Alternative commands:**
```bash
# Bundle OpenAPI only
just bundle

# Lint and validate
just validate

# Watch for changes and auto-bundle
just watch

# Preview with Redocly (OpenAPI only)
just preview
```

**Traditional commands (without justfile):**
```bash
# Bundle with Python (production method)
python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json

# Or bundle with Redocly CLI (optional, requires Bun)
bun redocly bundle docs/openapi/index.yaml -o docs/openapi.json

# Preview with Mintlify
bun mintlify dev
```

## Editing Workflow

### Option 1: With Pre-commit Hook (Recommended)

1. Install the pre-commit hook once:
   ```bash
   just install-hooks
   # or: cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
   ```

2. Edit YAML files under `docs/openapi/`

3. Commit your changes – the hook automatically:
   - Regenerates `docs/openapi.json`
   - Validates the bundle
   - Stages the updated JSON file

### Option 2: Manual Workflow

1. Edit YAML file(s) under `docs/openapi/`

2. Regenerate the bundled JSON:
   ```bash
   just bundle
   # or: python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json
   ```

3. Validate your changes:
   ```bash
   just validate
   # or: spectral lint docs/openapi/index.yaml && python -m unittest tests.test_openapi_bundle
   ```

4. Commit both the YAML sources and regenerated `docs/openapi.json`

### Option 3: Watch Mode (Development)

For active development, auto-bundle on file changes:

```bash
just watch
# or: bun run watch
```

This watches `docs/openapi/**/*.yaml` and auto-runs the bundler whenever you save changes.

## Bundling Methods: Python vs. Redocly

We support **two bundling methods** – choose based on your workflow:

| Method | Command | Use Case | Pros | Cons |
|--------|---------|----------|------|------|
| **Python** | `just bundle` | Production, CI/CD | Zero dependencies, fast, proven | Fewer features |
| **Redocly** | `just bundle-redocly` | Local development | Industry standard, better errors, more features | Requires Node.js/Bun |

Both produce identical `docs/openapi.json` output. **CI/CD uses Python only** (no Node.js dependency).

## Adding New Endpoints or Schemas

### Adding a New Endpoint

1. Create `docs/openapi/paths/your-endpoint.yaml`
2. Define the path operation(s) (GET, POST, etc.)
3. Reference schemas using `$ref: "#/components/schemas/your-schema"`
4. Add the path to `docs/openapi/index.yaml`:
   ```yaml
   paths:
     /your_endpoint:
       $ref: "./paths/your-endpoint.yaml"
   ```
5. Bundle and validate: `just validate`

### Adding a New Schema

1. Create `docs/openapi/components/schemas/your-model.yaml`
2. Define the schema structure (type, properties, etc.)
3. Add the schema to `docs/openapi/index.yaml`:
   ```yaml
   components:
     schemas:
       your_model:
         $ref: "./components/schemas/your-model.yaml"
   ```
4. Reference it from paths: `$ref: "#/components/schemas/your_model"`
5. Bundle and validate: `just validate`

## Linting and Validation

We support **two linters** with different philosophies:

### Spectral (Primary Linter)
```bash
just lint
# or: bunx spectral lint docs/openapi/index.yaml
```

- **Used in CI/CD** - must pass for PRs to merge
- Uses `.spectral.mjs` ruleset
- Focused on OpenAPI spec compliance
- Less strict, more practical

### Redocly CLI (Optional, Stricter)
```bash
just lint-redocly
# or: bunx redocly lint docs/openapi/index.yaml
```

- **Optional** - for extra validation during development
- Uses `.redocly.yaml` config (customized for our API)
- Stricter rules, catches more style issues
- May show warnings that Spectral doesn't flag
- Requires Bun/Node.js

**Recommendation:** Run `just lint` (Spectral) before committing. Use `just lint-redocly` optionally for deeper validation.

### Run Both
```bash
just lint-all
# Runs Spectral + Redocly
```

## Schema Validation

The Python bundler includes automatic schema validation:

- Checks that schema files have expected structure (type, properties, etc.)
- Validates references are resolvable
- Detects circular references
- Shows helpful error messages with context

To skip validation (faster, use with caution):
```bash
just bundle-fast
```

## Common Patterns

### Internal References (Same File)
```yaml
# In docs/openapi/paths/shipments.yaml
$ref: "#/components/schemas/shipment"
```

### External References (Different File)
```yaml
# In docs/openapi/components/schemas/container.yaml
properties:
  shipment:
    $ref: "./shipment.yaml"
```

### Fragment References
```yaml
# Reference a specific property
$ref: "./shipment.yaml#/properties/id"
```

## Troubleshooting

### "Referenced file not found"
- Check the path is correct relative to the current file
- Verify filename and extension match exactly (case-sensitive)
- Ensure the file exists in your working directory

### "Circular $ref detected"
- A file is referencing itself through a chain of $refs
- Check the reference chain shown in the error message
- Restructure your schemas to break the cycle

### "Fragment not found"
- The path after `#` doesn't exist in the referenced file
- Check available keys shown in the error message
- Verify the fragment path is correct

### Bundle doesn't match after editing
- Run `just bundle` to regenerate
- Check for syntax errors in your YAML (run `just lint`)
- Verify all $refs point to existing files

## Re-splitting a Monolithic File

If you need to convert a monolithic `openapi.json` back to modular YAML files:

```bash
just split
# or: python scripts/split_openapi.py
```

⚠️ **Warning:** This overwrites existing YAML files!

## Continuous Integration

A GitHub Actions workflow (`.github/workflows/openapi-validation.yml`) runs on every PR:

1. Lints with Spectral
2. Bundles with Python
3. Validates bundle matches committed `openapi.json`

If you forget to bundle or have lint errors, CI will fail.

## Related Files

- `justfile` – Task runner with all commands
- `tools/openapi_bundle.py` – Python bundler (production)
- `tools/openapi_yaml.py` – Minimal YAML parser
- `tests/test_openapi_bundle.py` – Bundle regression test
- `scripts/pre-commit.sh` – Pre-commit hook for auto-bundling
- `package.json` – Bun/Node.js dependencies (Redocly, etc.)
- `.spectral.mjs` – Spectral lint configuration
- `.watchmanconfig` – Watchman file watching config

## Performance Comparison

**Bundling speed** (9700+ line OpenAPI spec):

- Python bundler: ~100-200ms
- Redocly CLI: ~150-300ms

Both are fast enough for development. Python is used in CI for zero dependencies.

**Linting speed:**

- Spectral: ~1-2s for 1MB spec
- Redocly CLI: <1s for 1MB spec

## Additional Tools

### Preview Docs Locally

Two preview options available:

**Redocly Preview** (OpenAPI only):
```bash
just preview
# Opens http://localhost:8080 with interactive API docs
# Only shows OpenAPI spec, no MDX content
```

**Mintlify Preview** (Full documentation):
```bash
just preview-mintlify
# Opens http://localhost:3000 with full docs
# Includes OpenAPI + MDX content + navigation
# This is what's deployed to docs.terminal49.com
```

**Quick Development Workflow:**
```bash
just dev
# Bundles OpenAPI + lints + starts Mintlify preview
# Perfect for active development with full docs preview

# Or with full validation:
just dev-full
# Bundles + validates + tests + starts Mintlify
```

### Show Spec Statistics
```bash
just stats
# Shows endpoints, schemas, operations count
```

### Format YAML Files
```bash
just format
# or: bunx prettier --write "docs/openapi/**/*.yaml"
```

## Getting Help

- **Justfile commands:** `just --list` or `just help`
- **Python bundler:** `python -m tools.openapi_bundle --help`
- **Redocly CLI:** `bun redocly --help`
- **Spectral docs:** https://docs.stoplight.io/docs/spectral
- **Redocly docs:** https://redocly.com/docs/cli

For detailed developer workflows, see `docs/openapi/DEVELOPER_GUIDE.md`.

