#!/bin/bash

# Load API key
API_KEY="kJVzEaVQzRmyGCwcXVcTJAwU"
BASE_URL="https://api.terminal49.com/v2"

# Create response directory
mkdir -p api-responses

echo "Testing Terminal49 API endpoints..."
echo "=================================================="

# Function to test endpoint and save response
test_endpoint() {
    local method=$1
    local endpoint=$2
    local name=$3
    local params=$4
    
    echo -e "\nTesting $method $endpoint"
    
    if [ -n "$params" ]; then
        url="${BASE_URL}${endpoint}?${params}"
    else
        url="${BASE_URL}${endpoint}"
    fi
    
    response=$(curl -s -w "\n%{http_code}" \
        -X "$method" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/vnd.api+json" \
        "$url")
    
    # Extract status code and body
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    echo "Status: $http_code"
    
    # Save response
    echo "$body" | jq . > "api-responses/${name}.json" 2>/dev/null || echo "$body" > "api-responses/${name}.json"
    
    # Show first 500 chars
    echo "Response preview:"
    echo "$body" | jq . 2>/dev/null | head -20 || echo "$body" | head -20
}

# Test key endpoints
test_endpoint "GET" "/shipments" "shipments-list" "page[size]=5"
test_endpoint "GET" "/containers" "containers-list" "page[size]=5"
test_endpoint "GET" "/shipping_lines" "shipping-lines-list" ""
test_endpoint "GET" "/webhooks" "webhooks-list" ""
test_endpoint "GET" "/tracking_requests" "tracking-requests-list" "page[size]=5"
test_endpoint "GET" "/parties" "parties-list" ""
test_endpoint "GET" "/webhook_notifications/examples" "webhook-examples" ""

echo -e "\n=================================================="
echo "API test complete! Responses saved in api-responses/"