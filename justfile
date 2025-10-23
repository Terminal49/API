# Terminal49 API Documentation - Task Runner
# Usage: just <command>
# List all commands: just --list

# Default: show available commands
default:
    @just --list

# ========================================
# OpenAPI Bundling (Python - Production)
# ========================================

# Bundle OpenAPI using Python (production method, used in CI)
bundle:
    @echo "🔄 Bundling with Python..."
    python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json
    @echo "✅ Bundle complete"

# Bundle without schema validation (faster, use with caution)
bundle-fast:
    @echo "🔄 Bundling without validation..."
    python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json --no-validate
    @echo "✅ Bundle complete (validation skipped)"

# ========================================
# Linting & Validation
# ========================================

# Lint OpenAPI with Mintlify CLI
lint:
    @echo "🔄 Ensuring OpenAPI bundle is up to date..."
    @just bundle-fast
    @echo "🔍 Linting OpenAPI with Mintlify CLI..."
    npx -y mintlify openapi-check docs/openapi.json

# ========================================
# Testing
# ========================================

# Run OpenAPI bundle regression test
test:
    @echo "🧪 Running bundle regression test..."
    python -m unittest tests.test_openapi_bundle

# Validate everything (bundle + lint + test)
validate: bundle lint test
    @echo "✅ All validations passed"

# Full validation (kept for backwards compatibility)
validate-full:
    @just validate
    @echo "✅ All validations passed (full)"

# ========================================
# Development Workflow
# ========================================

# Watch for changes and auto-bundle (requires Bun + chokidar)
watch:
    @echo "👀 Watching docs/openapi/**/*.yaml for changes..."
    @echo "Press Ctrl+C to stop"
    bun run watch

# ========================================
# Documentation Preview
# ========================================

# Preview full docs with Mintlify (includes MDX content)
preview-mintlify:
    @echo "📦 Ensuring OpenAPI bundle is up to date..."
    @just bundle-fast
    @echo "📚 Starting Mintlify dev server..."
    @echo "Opens at http://localhost:3000"
    @echo "Mintlify will use docs/openapi.json"
    cd docs && npx -y mintlify dev

# Bundle, lint, then preview with Mintlify
dev: bundle lint preview-mintlify

# Bundle, validate, then preview with Mintlify (thorough)
dev-full: validate preview-mintlify

# ========================================
# Git Hooks
# ========================================

# Install pre-commit hook
install-hooks:
    @echo "🪝 Installing pre-commit hook..."
    cp scripts/pre-commit.sh .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    @echo "✅ Pre-commit hook installed"

# Uninstall pre-commit hook
uninstall-hooks:
    @echo "🗑️  Removing pre-commit hook..."
    rm -f .git/hooks/pre-commit
    @echo "✅ Pre-commit hook removed"

# ========================================
# Setup & Dependencies
# ========================================

# Setup development environment (Python + Bun + hooks)
setup:
    @echo "🚀 Setting up development environment..."
    @echo ""
    @echo "🛠️  Installing toolchain with mise..."
    mise install
    @echo ""
    @if command -v uv >/dev/null 2>&1; then \
        echo "🐍 Installing Python deps with uv..."; \
        uv pip install --upgrade --quiet -r requirements-dev.txt; \
    else \
        echo "🐍 Installing Python deps with pip..."; \
        python -m pip install --upgrade --quiet -r requirements-dev.txt; \
    fi
    @echo ""
    @echo "📦 Installing Bun dependencies..."
    bun install
    @echo ""
    @echo "🪝 Installing pre-commit hook..."
    @just install-hooks
    @echo ""
    @echo "✅ Setup complete!"
    @echo ""
    @echo "Try these commands:"
    @echo "  just bundle      - Bundle with Python (production)"
    @echo "  just lint        - Lint with Mintlify CLI"
    @echo "  just watch       - Auto-bundle on file changes"
    @echo "  just preview-mintlify - Preview docs locally"

# Install Bun dependencies
install:
    @echo "📦 Installing Bun dependencies..."
    bun install

# Update dependencies
update:
    @echo "⬆️  Updating dependencies..."
    bun update

# ========================================
# Utilities
# ========================================

# Split a monolithic openapi.json back into modular files (destructive!)
split:
    @echo "⚠️  This will overwrite existing YAML files!"
    @echo "Press Ctrl+C to cancel, or Enter to continue..."
    @read
    python scripts/split_openapi.py
    @echo "✅ Split complete"

# Clean generated files
clean:
    @echo "🧹 Cleaning generated files..."
    rm -f docs/openapi-dereferenced.json
    @echo "✅ Clean complete"

# Format YAML files (requires prettier)
format:
    @echo "💅 Formatting YAML files..."
    bunx prettier --write "docs/openapi/**/*.yaml"

# Check YAML formatting
format-check:
    @echo "🔍 Checking YAML formatting..."
    bunx prettier --check "docs/openapi/**/*.yaml"

# ========================================
# CI/CD Simulation
# ========================================

# Simulate CI workflow
ci: bundle lint test
    @echo "✅ CI workflow passed"

# Generate Postman collection (used in GitHub Actions)
postman:
    @echo "📮 Generating Postman collection..."
    openapi2postmanv2 -s docs/openapi.json -o Terminal49-API.postman_collection.json -p -O folderStrategy=Tags
    @echo "✅ Postman collection generated"

# ========================================
# Help & Documentation
# ========================================

# Show detailed help
help:
    @echo "Terminal49 API Documentation - Task Runner"
    @echo ""
    @echo "🚀 Quick Start:"
    @echo "  just dev             - Bundle + lint + preview with Mintlify"
    @echo "  just setup           - First-time setup (install deps + hooks)"
    @echo ""
    @echo "📦 Building:"
    @echo "  just bundle          - Bundle OpenAPI with Python (production)"
    @echo "  just validate        - Bundle + lint + test"
    @echo ""
    @echo "👀 Development:"
    @echo "  just watch           - Auto-bundle on file changes"
    @echo "  just preview-mintlify - Preview full docs with Mintlify"
    @echo ""
    @echo "🔍 Quality:"
    @echo "  just lint            - Lint with Mintlify CLI"
    @echo "  just test            - Run regression tests"
    @echo ""
    @echo "For full command list: just --list"
    @echo "For justfile documentation: cat justfile"
