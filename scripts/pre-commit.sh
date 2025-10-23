#!/usr/bin/env bash
# Pre-commit hook for OpenAPI bundling
# This ensures the bundled openapi.json is always in sync with the modular YAML sources

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Resolve a Python runtime (python, python3, or mise-managed)
run_python() {
    if command -v python >/dev/null 2>&1; then
        python "$@"
    elif command -v python3 >/dev/null 2>&1; then
        python3 "$@"
    elif command -v mise >/dev/null 2>&1; then
        mise exec -- python "$@"
    else
        echo -e "${RED}❌ No Python interpreter found. Install one via mise (just setup) or add python to PATH.${NC}"
        exit 1
    fi
}

# Check if any OpenAPI YAML files were modified
if git diff --cached --name-only | grep -q "^docs/openapi/.*\.yaml$"; then
    echo -e "${YELLOW}🔄 OpenAPI YAML files changed, regenerating bundle...${NC}"

    # Run the bundler
    if run_python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json; then
        echo -e "${GREEN}✅ Bundle regenerated successfully${NC}"

        # Check if the bundle changed
        if git diff --name-only docs/openapi.json | grep -q "openapi.json"; then
            echo -e "${YELLOW}📝 Staging updated openapi.json${NC}"
            git add docs/openapi.json
            echo -e "${GREEN}✅ Updated openapi.json staged for commit${NC}"
        else
            echo -e "${GREEN}✅ Bundle is already up to date${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to regenerate bundle${NC}"
        echo -e "${RED}Please fix the errors above and try again${NC}"
        exit 1
    fi
fi

# Check that openapi.json is in sync (extra safety check)
if git diff --cached --name-only | grep -q "^docs/openapi.json$"; then
    # If openapi.json is being committed, verify it matches the bundle
    echo -e "${YELLOW}🔍 Verifying openapi.json is in sync...${NC}"

    # Create a temp file with the freshly bundled version
    TEMP_BUNDLE=$(mktemp)
    run_python -m tools.openapi_bundle docs/openapi/index.yaml "$TEMP_BUNDLE" 2>/dev/null || {
        echo -e "${RED}❌ Failed to create verification bundle${NC}"
        rm -f "$TEMP_BUNDLE"
        exit 1
    }

    # Compare the staged version with the freshly bundled version
    if ! diff -q docs/openapi.json "$TEMP_BUNDLE" > /dev/null 2>&1; then
        echo -e "${RED}❌ openapi.json is out of sync with YAML sources!${NC}"
        echo -e "${YELLOW}Run: python -m tools.openapi_bundle docs/openapi/index.yaml docs/openapi.json${NC}"
        rm -f "$TEMP_BUNDLE"
        exit 1
    fi

    rm -f "$TEMP_BUNDLE"
    echo -e "${GREEN}✅ openapi.json is in sync${NC}"
fi

exit 0
