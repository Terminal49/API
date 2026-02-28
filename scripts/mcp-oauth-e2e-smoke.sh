#!/usr/bin/env bash

set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd jq

API_BASE_URL="${API_BASE_URL:-https://api.terminal49.com}"
MCP_BASE_URL="${MCP_BASE_URL:-https://mcp.terminal49.com/mcp}"
MCP_CLIENT_NAME="${MCP_CLIENT_NAME:-Terminal49 MCP Smoke Client}"
MCP_REDIRECT_URI="${MCP_REDIRECT_URI:-}"
MCP_ACCESS_TOKEN="${MCP_ACCESS_TOKEN:-}"

if [[ -z "${MCP_REDIRECT_URI}" ]]; then
  echo "Set MCP_REDIRECT_URI before running this script." >&2
  exit 1
fi

echo "==> Step 1: discovery metadata"
DISCOVERY_PAYLOAD="$(curl -fsS "${API_BASE_URL}/.well-known/oauth-authorization-server")"
echo "${DISCOVERY_PAYLOAD}" | jq .

echo "${DISCOVERY_PAYLOAD}" | jq -e '.issuer and .authorization_endpoint and .token_endpoint and .revocation_endpoint and .code_challenge_methods_supported' >/dev/null

RESOURCE_METADATA_URL="${API_BASE_URL}/.well-known/oauth-authorization-server"
echo "Discovery checks passed."

echo
echo "==> Step 2: dynamic client registration"
REGISTER_PAYLOAD="$(curl -fsS -X POST "${API_BASE_URL}/oauth/register" \
  -H 'Content-Type: application/json' \
  --data "{
    \"client_name\": \"${MCP_CLIENT_NAME}\",
    \"redirect_uris\": [\"${MCP_REDIRECT_URI}\"],
    \"grant_types\": [\"authorization_code\", \"refresh_token\"],
    \"response_types\": [\"code\"],
    \"token_endpoint_auth_method\": \"none\"
  }")"
echo "${REGISTER_PAYLOAD}" | jq .
CLIENT_ID="$(echo "${REGISTER_PAYLOAD}" | jq -r '.client_id')"
if [[ -z "${CLIENT_ID}" || "${CLIENT_ID}" == "null" ]]; then
  echo "Registration failed: missing client_id" >&2
  exit 1
fi
echo "Client registration checks passed."

echo
echo "==> Step 3: unauthenticated MCP request challenge"
CHALLENGE_HEADERS="$(mktemp)"
CHALLENGE_BODY="$(mktemp)"
CHALLENGE_STATUS="$(
  curl -sS -o "${CHALLENGE_BODY}" -D "${CHALLENGE_HEADERS}" \
    -w '%{http_code}' \
    -X POST "${MCP_BASE_URL}" \
    -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
)"

if [[ "${CHALLENGE_STATUS}" != "401" ]]; then
  echo "Expected 401 for unauthenticated MCP request, got ${CHALLENGE_STATUS}" >&2
  cat "${CHALLENGE_BODY}" >&2
  exit 1
fi

WWW_AUTH="$(grep -i '^WWW-Authenticate:' "${CHALLENGE_HEADERS}" | tr -d '\r' || true)"
echo "WWW-Authenticate: ${WWW_AUTH}"
if [[ "${WWW_AUTH}" != *"resource_metadata=\"${RESOURCE_METADATA_URL}\""* ]]; then
  echo "Challenge header does not include expected resource_metadata URL." >&2
  exit 1
fi
echo "Challenge checks passed."

echo
if [[ -z "${MCP_ACCESS_TOKEN}" ]]; then
  echo "==> Step 4 skipped: no MCP_ACCESS_TOKEN provided."
  echo "Provide MCP_ACCESS_TOKEN to validate authenticated initialize/tools/list."
  exit 0
fi

echo "==> Step 4: authenticated MCP initialize"
INIT_BODY="$(curl -fsS -X POST "${MCP_BASE_URL}" \
  -H "Authorization: Bearer ${MCP_ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}')"
echo "${INIT_BODY}" | jq .
echo "${INIT_BODY}" | jq -e 'has("result") and (.error|not)' >/dev/null

echo
echo "==> Step 5: authenticated MCP tools/list"
TOOLS_BODY="$(curl -fsS -X POST "${MCP_BASE_URL}" \
  -H "Authorization: Bearer ${MCP_ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')"
echo "${TOOLS_BODY}" | jq .
echo "${TOOLS_BODY}" | jq -e '.result.tools | length >= 1' >/dev/null

echo
echo "OAuth MCP smoke test complete."
