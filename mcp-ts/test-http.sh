#!/bin/bash
# HTTP test script for local Vercel dev server
# Usage: ./test-http.sh [container_id]

set -e

API_TOKEN="${T49_API_TOKEN}"
MCP_URL="${MCP_URL:-http://localhost:3000/api/mcp}"
CONTAINER_ID="${1:-123e4567-e89b-12d3-a456-426614174000}"

if [ -z "$API_TOKEN" ]; then
  echo "❌ ERROR: T49_API_TOKEN environment variable is required"
  echo "Set it with: export T49_API_TOKEN=your_token_here"
  exit 1
fi

echo "🚀 Testing Terminal49 MCP Server (HTTP)"
echo "URL: $MCP_URL"
echo "Container ID: $CONTAINER_ID"
echo ""

# Test 1: Initialize
echo "=========================================="
echo "Test 1: Initialize"
echo "=========================================="
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {"name": "test", "version": "1.0"}
    },
    "id": 1
  }' | jq .

echo ""
echo ""

# Test 2: List Tools
echo "=========================================="
echo "Test 2: List Tools"
echo "=========================================="
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 2
  }' | jq .

echo ""
echo ""

# Test 3: List Resources
echo "=========================================="
echo "Test 3: List Resources"
echo "=========================================="
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/list",
    "id": 3
  }' | jq .

echo ""
echo ""

# Test 4: Get Container
echo "=========================================="
echo "Test 4: Get Container (ID: $CONTAINER_ID)"
echo "=========================================="
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"get_container\",
      \"arguments\": {
        \"id\": \"$CONTAINER_ID\"
      }
    },
    \"id\": 4
  }" | jq .

echo ""
echo ""

# Test 5: Read Resource
echo "=========================================="
echo "Test 5: Read Resource (t49:container/$CONTAINER_ID)"
echo "=========================================="
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"method\": \"resources/read\",
    \"params\": {
      \"uri\": \"t49:container/$CONTAINER_ID\"
    },
    \"id\": 5
  }" | jq .

echo ""
echo "=========================================="
echo "✅ All tests complete!"
echo "=========================================="
