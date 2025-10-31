#!/bin/bash
# Example HTTP client for Terminal49 MCP server
#
# Usage:
#   export T49_API_TOKEN=your_token_here
#   ./examples/http_client.sh

set -e

API_TOKEN="${T49_API_TOKEN:-your_token_here}"
MCP_URL="${MCP_URL:-http://localhost:3001/mcp}"

echo "==> Testing Terminal49 MCP Server (HTTP)"
echo "==> URL: $MCP_URL"
echo ""

# Test 1: List Tools
echo "========================================="
echo "TEST 1: List Tools"
echo "========================================="
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }' | jq .

echo ""
echo ""

# Test 2: Call get_container
echo "========================================="
echo "TEST 2: Call get_container"
echo "========================================="
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "get_container",
      "arguments": {
        "id": "123e4567-e89b-12d3-a456-426614174000"
      }
    },
    "id": 2
  }' | jq .

echo ""
echo ""

# Test 3: Read Resource
echo "========================================="
echo "TEST 3: Read Resource"
echo "========================================="
curl -s -X POST "$MCP_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "resources/read",
    "params": {
      "uri": "t49:container/123e4567-e89b-12d3-a456-426614174000"
    },
    "id": 3
  }' | jq .

echo ""
echo "========================================="
echo "Tests complete!"
echo "========================================="
