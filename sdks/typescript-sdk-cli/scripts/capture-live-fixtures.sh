#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
node --import tsx "$SCRIPT_DIR/generate-fixtures.mjs"
