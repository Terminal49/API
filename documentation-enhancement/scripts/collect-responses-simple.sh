#!/bin/bash

# Terminal49 API Response Collection Script

API_KEY="kJVzEaVQzRmyGCwcXVcTJAwU"
BASE_URL="https://api.terminal49.com/v2"
OUTPUT_DIR="api-responses"

mkdir -p "$OUTPUT_DIR"/{shipments,containers,tracking-requests,webhooks,reference-data,errors,pagination}

echo "Terminal49 API Response Collection"
echo "=================================="
echo "Output directory: $OUTPUT_DIR"
echo ""

# Function to make API request
api_request() {
    local method=$1
    local endpoint=$2
    local output_file=$3
    local description=$4
    
    echo ""
    echo "$description"
    echo "Method: $method"
    echo "Endpoint: $endpoint"
    
    # URL encode parameters
    encoded_endpoint=$(echo "$endpoint" | sed 's/\[/%5B/g' | sed 's/\]/%5D/g')
    
    curl -s -X "$method" \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/vnd.api+json" \
        -H "Accept: application/vnd.api+json" \
        -o "$OUTPUT_DIR/$output_file" \
        -w "Status: %{http_code}\n" \
        "${BASE_URL}${encoded_endpoint}"
    
    echo "Saved to: $OUTPUT_DIR/$output_file"
}

echo ""
echo "=== SHIPMENTS ENDPOINTS ==="
echo "==========================="

api_request "GET" "/shipments?page[size]=5" \
    "shipments/list-basic.json" \
    "List shipments (basic)"

api_request "GET" "/shipments?page[size]=3&include=containers" \
    "shipments/list-with-includes.json" \
    "List shipments with container includes"

api_request "GET" "/shipments?page[size]=5&filter[shipping_line_scac]=MSCU" \
    "shipments/list-filtered.json" \
    "List shipments filtered by shipping line"

echo ""
echo "=== CONTAINERS ENDPOINTS ==="
echo "============================"

api_request "GET" "/containers?page[size]=5" \
    "containers/list-basic.json" \
    "List containers (basic)"

api_request "GET" "/containers?page[size]=3&include=transport_events" \
    "containers/list-with-events.json" \
    "List containers with transport events"

echo ""
echo "=== TRACKING REQUESTS ==="
echo "========================="

api_request "GET" "/tracking_requests?page[size]=5" \
    "tracking-requests/list-basic.json" \
    "List tracking requests"

echo ""
echo "=== WEBHOOKS ==="
echo "================"

api_request "GET" "/webhooks" \
    "webhooks/list.json" \
    "List configured webhooks"

api_request "GET" "/webhook_notifications/examples" \
    "webhooks/notification-examples.json" \
    "Get webhook notification examples"

echo ""
echo "=== REFERENCE DATA ==="
echo "====================="

api_request "GET" "/shipping_lines" \
    "reference-data/shipping-lines.json" \
    "List all shipping lines"

api_request "GET" "/ports?page[size]=20" \
    "reference-data/ports-list.json" \
    "List ports"

api_request "GET" "/ports?q=Los%20Angeles&page[size]=10" \
    "reference-data/ports-search.json" \
    "Search ports by name"

api_request "GET" "/terminals?page[size]=10" \
    "reference-data/terminals-list.json" \
    "List terminals"

api_request "GET" "/vessels?page[size]=10" \
    "reference-data/vessels-list.json" \
    "List vessels"

api_request "GET" "/parties" \
    "reference-data/parties.json" \
    "List parties/customers"

echo ""
echo "=== PAGINATION TESTS ==="
echo "========================"

api_request "GET" "/shipments?page[size]=1" \
    "pagination/shipments-size-1.json" \
    "Test pagination with size 1"

api_request "GET" "/shipments?page[size]=25" \
    "pagination/shipments-size-25.json" \
    "Test pagination with size 25"

api_request "GET" "/shipments?page[size]=5&page[number]=2" \
    "pagination/shipments-page-2.json" \
    "Test pagination page 2"

echo ""
echo "=== ERROR SCENARIOS ==="
echo "======================="

api_request "GET" "/invalid_endpoint" \
    "errors/404-not-found.json" \
    "Test 404 Not Found"

api_request "GET" "/shipments/invalid-id-12345" \
    "errors/404-resource-not-found.json" \
    "Test 404 Resource Not Found"

echo ""
echo "=================================="
echo "API response collection complete!"
echo "All responses saved in: $OUTPUT_DIR/"