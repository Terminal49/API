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

The project pins its toolchain via `.tool-versions` (Node.js 20, Bun 1.1, Python 3.11). `just setup` runs `mise install`, installs the Python requirements from `requirements-dev.txt` (using `uv` when available), fetches Bun dependencies, and wires up the pre-commit hook. If your shell is not already managed by mise, run `mise shell` or prefix commands with `mise exec --` (e.g., `mise exec -- just lint`).

**Alternative commands:**
```bash
# Bundle OpenAPI only
just bundle

# Lint and validate
just validate

# Watch for changes and auto-bundle
just watch
```

**Traditional commands (without justfile):**
```bash
# Bundle with Python (production method)
python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json

# Validate OpenAPI with Mintlify CLI (expects bundled JSON)
npx -y mintlify openapi-check docs/openapi.json

# Preview with Mintlify
npx -y mintlify dev
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
   # or: python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json --no-validate
   #     && mintlify openapi-check docs/openapi.json
   ```

4. Commit both the YAML sources and regenerated `docs/openapi.json`

### Option 3: Watch Mode (Development)

For active development, auto-bundle on file changes:

```bash
just watch
# or: bun run watch
```

This watches `docs/openapi/**/*.yaml` and auto-runs the bundler whenever you save changes.

## Bundling

The Python bundler is used everywhere (local + CI) to generate `docs/openapi.json`. It performs schema validation while producing the bundle.

- Standard run: `just bundle`
- Skip validation (faster iteration): `just bundle-fast`
- Direct command: `python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json`

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

Mintlify's CLI is the single source of truth for OpenAPI validation. Always bundle before linting so the CLI operates on `docs/openapi.json`:

```bash
just lint
# or: python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json --no-validate \
#     && mintlify openapi-check docs/openapi.json
```

- Validates the bundled spec that Mintlify serves (ensures parity with production)
- Matches the validation Mintlify applies when rendering docs
- Requires Node.js ≥ 18 (use `nvm`, `asdf`, or Bun to provide a compatible runtime)

Run the linter as part of your workflow before committing or opening a PR.

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

1. Lints with Mintlify CLI
2. Bundles with Python
3. Validates bundle matches committed `openapi.json`

If you forget to bundle or have lint errors, CI will fail.

## Related Files

- `justfile` – Task runner with all commands
- `tools/openapi_bundle.py` – Python bundler (production)
- `tools/openapi_yaml.py` – Minimal YAML parser
- `tests/test_openapi_bundle.py` – Bundle regression test
- `scripts/pre-commit.sh` – Pre-commit hook for auto-bundling
- `package.json` – CLI scripts (Mintlify CLI, chokidar)
- `.tool-versions` – `mise`-managed Node.js/Bun/Python versions
- `requirements-dev.txt` – Python dependencies for the bundler (PyYAML)
- `.watchmanconfig` – Watchman file watching config

## Performance Comparison

**Bundling speed** (9700+ line OpenAPI spec):

- Python bundler: ~100-200ms

Both are fast enough for development. Python is used in CI for zero dependencies.

**Linting speed:**

- Mintlify CLI (`openapi-check`): ~1s for 1MB spec (depends on Node runtime)

## Additional Tools

### Preview Docs Locally

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

### Format YAML Files
```bash
just format
# or: bunx prettier --write "docs/openapi/**/*.yaml"
```

## Getting Help

- **Justfile commands:** `just --list` or `just help`
- **Python bundler:** `python -m tools.openapi_bundle --help`
- **Mintlify CLI:** `mintlify --help`

For detailed developer workflows, see `docs/openapi/DEVELOPER_GUIDE.md`.
