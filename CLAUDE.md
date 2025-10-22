# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the Terminal49 API documentation repository. It contains modular OpenAPI specifications, MDX documentation files, and automated workflows for generating and deploying documentation to Postman and Mintlify (docs.terminal49.com).

**Important:** This repository contains documentation only - no actual API implementation code. The production API runs at `https://api.terminal49.com/v2`.

## Core Concepts

Terminal49 provides container and shipment tracking via two methods:

1. **API** - Direct REST API access with webhooks for real-time updates
2. **DataSync** - Automated data synchronization to customer databases/data warehouses

The API follows JSONAPI specifications and supports tracking shipments, containers, webhooks, tracking requests, and related entities (ports, terminals, vessels, shipping lines, parties).

## Repository Structure

```
docs/
├── openapi/                  # Modular OpenAPI YAML sources (SOURCE OF TRUTH)
│   ├── index.yaml            # Root OpenAPI document
│   ├── paths/                # One file per REST endpoint
│   └── components/
│       ├── schemas/          # Reusable schema definitions
│       └── securitySchemes/  # Authentication descriptions
├── openapi.json              # Auto-generated bundle (DO NOT EDIT DIRECTLY)
├── mint.json                 # Mintlify docs configuration
├── home.mdx                  # Documentation homepage
├── api-docs/                 # API documentation (MDX files)
│   ├── getting-started/
│   ├── in-depth-guides/
│   ├── useful-info/
│   └── api-reference/        # Organized by resource type
└── datasync/                 # DataSync documentation (MDX files)
    └── table-properties/

tools/
├── openapi_bundle.py         # Python bundler (production, used in CI)
└── openapi_yaml.py           # Minimal YAML parser

scripts/
├── split_openapi.py          # Convert monolithic JSON to modular YAML
└── pre-commit.sh             # Pre-commit hook for auto-bundling

tests/
└── test_openapi_bundle.py    # Regression test for bundle consistency

justfile                      # Task runner (like Make, but better)
package.json                  # Bun/Node.js dependencies (optional dev tools)
.watchmanconfig               # File watching configuration

Terminal49-API.postman_collection.json  # Auto-generated from openapi.json
.github/workflows/
├── generate_postman.yml      # Auto-generates Postman collection on openapi.json changes
├── deploy_postman.yml        # Deploys collection to Postman API on main branch
└── openapi-validation.yml    # Validates OpenAPI YAML on PRs
```

## **Critical: Modular OpenAPI Workflow**

### Source of Truth

**⚠️ The YAML files in `docs/openapi/` are the ONLY source of truth!**

- ✅ **Edit:** `docs/openapi/**/*.yaml` files
- ❌ **Never edit:** `docs/openapi.json` (it's auto-generated)

The `docs/openapi.json` file is bundled from modular YAML sources. If you edit it directly, your changes will be overwritten!

### Hybrid Bundling Approach

We support **two bundling methods** – developers choose their preference:

1. **Python Bundler** (Production, CI/CD)

   - Zero dependencies, fast, proven
   - Used in GitHub Actions
   - Command: `just bundle` or `python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json`

2. **Redocly CLI** (Optional, Development)
   - Industry standard, better error messages, more features
   - Requires Bun/Node.js
   - Command: `just bundle-redocly` or `bun redocly bundle docs/openapi/index.yaml -o docs/openapi.json`

Both produce **identical output**. Use whichever you prefer during development.

### Task Runner: Justfile

We use `just` (modern alternative to Make) for task running:

```bash
just --list          # Show all commands
just setup           # First-time setup
just bundle          # Bundle with Python
just bundle-redocly  # Bundle with Redocly CLI
just lint            # Lint with Spectral
just validate        # Bundle + lint + test
just watch           # Auto-bundle on file changes
just preview         # Preview OpenAPI with Redocly
just preview-mintlify # Preview full docs with Mintlify
just dev             # Bundle + lint + preview (recommended workflow)
```

For full command list, see `justfile`.

**Recommended Development Workflow:**

```bash
just dev
# This bundles OpenAPI, runs linting, then starts Mintlify preview
# Opens http://localhost:3000 with full documentation
# Perfect for active development
```

### Pre-commit Hook

Install once to auto-bundle on commit:

```bash
just install-hooks
```

The hook automatically:

- Detects OpenAPI YAML changes
- Regenerates `docs/openapi.json`
- Validates the bundle
- Stages the updated JSON

## Common Workflows

### Updating API Documentation

1. **Edit OpenAPI specs:**

   ```bash
   # Edit modular YAML sources
   vim docs/openapi/paths/shipments.yaml
   vim docs/openapi/components/schemas/shipment.yaml
   ```

2. **Bundle and validate:**

   ```bash
   just validate   # or: just bundle && just lint && just test
   ```

3. **Commit:**

   ```bash
   git add docs/openapi/
   git commit -m "feat: update shipment schema"
   # Pre-commit hook auto-bundles if installed
   ```

4. **Auto-generation triggers:**
   - When you push changes to `docs/openapi.json`, GitHub Actions generates `Terminal49-API.postman_collection.json`
   - When merged to `main`, the Postman collection deploys to the Postman API

### Adding a New Endpoint

1. Create `docs/openapi/paths/your-endpoint.yaml`
2. Add path reference in `docs/openapi/index.yaml`:
   ```yaml
   paths:
     /your_endpoint:
       $ref: "./paths/your-endpoint.yaml"
   ```
3. Bundle and validate: `just validate`
4. Commit both YAML and bundled JSON

### Adding a New Schema

1. Create `docs/openapi/components/schemas/your-model.yaml`
2. Add schema reference in `docs/openapi/index.yaml`:
   ```yaml
   components:
     schemas:
       your_model:
         $ref: "./components/schemas/your-model.yaml"
   ```
3. Bundle and validate: `just validate`
4. Commit both YAML and bundled JSON

### Editing Documentation Content

MDX files in `docs/api-docs/` and `docs/datasync/` are manually edited:

- Follow the existing structure in `mint.json`
- Include proper frontmatter (title, og:title, og:description)
- Reference API endpoints using absolute paths like `/api-docs/api-reference/shipments/list-shipments`

### Working with Postman Collections

The Postman collection is **auto-generated** - never edit `Terminal49-API.postman_collection.json` directly!

To manually regenerate (if needed):

```bash
just postman
# or: openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags
```

## Important Files

- **docs/openapi/index.yaml** - Root OpenAPI spec (references all modular files)
- **docs/openapi/paths/** - Individual endpoint definitions
- **docs/openapi/components/schemas/** - Reusable data models
- **docs/openapi.json** - Bundled output (auto-generated, don't edit)
- **justfile** - All available commands
- **tools/openapi_bundle.py** - Python bundler with validation
- **package.json** - Optional Bun/Node.js tools (Redocly, etc.)
- **scripts/pre-commit.sh** - Auto-bundling hook
- **docs/mint.json** - Navigation structure, tabs, branding
- **.spectral.mjs** - Stoplight linting configuration

## Development Setup

**First-time setup:**

```bash
just setup
```

This installs:

- Bun dependencies (Redocly CLI, Spectral, chokidar)
- Pre-commit hook for auto-bundling

**Manual setup:**

```bash
# Install Bun dependencies (optional)
bun install

# Install pre-commit hook
just install-hooks
```

## Validation & Testing

### Linting

Two linters available:

```bash
just lint              # Spectral (default, fast)
just lint-redocly      # Redocly CLI (better errors, requires Bun)
just lint-all          # Run both
```

### Schema Validation

The Python bundler includes automatic validation:

- Checks schema structure (type, properties, etc.)
- Validates `$ref` resolution
- Detects circular references
- Provides helpful error messages with context

To skip validation (faster):

```bash
just bundle-fast
```

### Testing

```bash
just test              # Run regression test
just validate          # Bundle + lint + test
```

## Authentication

API uses Token-based auth with header format:

```
Authorization: Token YOUR_API_KEY
```

API keys are obtained from https://app.terminal49.com/developers/api-keys

## Rate Limiting

The API has a **100 requests/minute** rate limit for tracking requests. This is documented in the OpenAPI spec and should be mentioned when adding documentation about tracking requests.

## Deployment

Documentation is deployed via:

1. **Mintlify** - Hosts docs.terminal49.com (configured via `mint.json`)
2. **Render** - Legacy Redoc deployment (see `render.yaml` and `Dockerfile`)
3. **Postman** - Collection synced via GitHub Actions to Postman API

## Key API Resources

Primary entities tracked in the system:

- **Shipments** - Bill of lading (BOL) tracking
- **Containers** - Individual container tracking with transport events
- **Tracking Requests** - Requests to track new shipments
- **Webhooks** - Event subscriptions for real-time updates
- **Transport Events** - Container movement events (empty out, vessel loaded, etc.)
- **Ports, Terminals, Vessels** - Reference data
- **Parties** - Business entities (customers, consignees, etc.)

## Commit Conventions

Follow conventional commits style:

- `feat:` - New features or endpoints
- `fix:` - Bug fixes in documentation
- `chore:` - Maintenance, auto-generated files
- Use `[skip ci]` to prevent workflow triggers on auto-generated commits

## GitHub Actions

Workflows require secrets:

- `POSTMAN_API_KEY` - For deploying to Postman
- `POSTMAN_COLLECTION_UID` - Collection identifier: `5900de09-f05a-4528-8b12-9ad1d0477023`

Workflows use `[skip ci]` in auto-generated commits to prevent infinite loops.

## Performance Notes

**Bundling speed** (9700+ line spec):

- Python bundler: ~100-200ms
- Redocly CLI: ~150-300ms

**Linting speed:**

- Spectral: ~1-2s for 1MB spec
- Redocly CLI: <1s for 1MB spec

Both are fast enough for local development. Python is used in CI for zero Node.js dependency.

## Troubleshooting

### "Referenced file not found"

- Check path is correct relative to current file
- Verify filename/extension match exactly (case-sensitive)
- See enhanced error message for tips

### "Circular $ref detected"

- A file references itself through a $ref chain
- Check the reference chain in the error message
- Restructure schemas to break the cycle

### Bundle out of sync

- Run `just bundle` to regenerate
- Install pre-commit hook to automate: `just install-hooks`
- Check CI will fail if bundle doesn't match

### Watchman not working

- Ensure `.watchmanconfig` exists
- Check Watchman daemon: `watchman watch-list`
- Try: `watchman shutdown-server && just watch`

## Data Files

CSV files contain supported shipping lines and terminals:

- `Terminal49 Shiping Line Support.csv` [sic - typo in filename]
- `Terminal49 Terminal Support.csv`

These are reference data used in documentation or validation.

## Getting Help

- **Justfile commands:** `just --list` or `just help`
- **OpenAPI workflow:** `docs/openapi/README.md`
- **Detailed guide:** `docs/openapi/DEVELOPER_GUIDE.md`
- **Python bundler:** `python -m tools.openapi_bundle --help`
- **Redocly docs:** https://redocly.com/docs/cli

## When Claude Code Works on This Repo

### Adding/Editing Endpoints

1. Always edit YAML files in `docs/openapi/`
2. Never edit `docs/openapi.json` directly
3. After editing, run `just validate`
4. Commit both YAML sources and bundled JSON

### Reviewing Code

- Check that `docs/openapi.json` is in sync with YAML sources
- Verify CI passes (lint + bundle test)
- Suggest running `just validate` if changes seem incomplete

### Troubleshooting Build Failures

- Check if `just bundle` succeeds locally
- Look for helpful error messages (enhanced in Python bundler)
- Verify all `$ref` paths are correct

### Documentation Changes

- OpenAPI changes go in `docs/openapi/**/*.yaml`
- Human-readable guides go in `docs/api-docs/**/*.mdx`
- Keep `mint.json` structure aligned with file organization

**When to suggest these tools to developers**:

- Suggest `rg` over `grep` for code searches
- Suggest `fd` over `find` for file discovery
- Suggest `ast-grep` for refactoring that needs to understand code structure
- Suggest `jq`/`yq` when parsing JSON/YAML in scripts
