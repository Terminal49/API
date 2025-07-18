#!/bin/bash

# Terminal49 API Response Collection Script
# This script collects responses from all API endpoints for documentation improvement

# Configuration
API_KEY="kJVzEaVQzRmyGCwcXVcTJAwU"
BASE_URL="https://api.terminal49.com/v2"
OUTPUT_DIR="api-responses"

# Create output directories
mkdir -p "$OUTPUT_DIR"/{shipments,containers,tracking-requests,webhooks,reference-data,errors,pagination}

# Color output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}Terminal49 API Response Collection${NC}"
echo "========================================"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Function to make API request and save response
api_request() {
    local method=$1
    local endpoint=$2
    local output_file=$3
    local description=$4
    local data=$5
    
    echo -e "\n${YELLOW}$description${NC}"
    echo "Method: $method"
    echo "Endpoint: $endpoint"
    
    # URL encode parameters in the endpoint
    encoded_endpoint=$(echo "$endpoint" | sed 's/\[/%5B/g' | sed 's/\]/%5D/g')
    
    if [ "$method" == "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" \
            -X GET \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/vnd.api+json" \
            -H "Accept: application/vnd.api+json" \
            "${BASE_URL}${encoded_endpoint}")
    elif [ "$method" == "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" \
            -X POST \
            -H "Authorization: Bearer $API_KEY" \
            -H "Content-Type: application/vnd.api+json" \
            -H "Accept: application/vnd.api+json" \
            -d "$data" \
            "${BASE_URL}${encoded_endpoint}")
    fi
    
    # Extract HTTP status code and body
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    # Save response with metadata
    cat > "$OUTPUT_DIR/$output_file" <<EOF
{
  "request": {
    "method": "$method",
    "endpoint": "$endpoint",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  },
  "response": {
    "status_code": $http_code,
    "body": $body
  }
}
EOF
    
    if [ $http_code -ge 200 ] && [ $http_code -lt 300 ]; then
        echo -e "Status: ${GREEN}$http_code${NC} ✓"
        echo "Saved to: $OUTPUT_DIR/$output_file"
    else
        echo -e "Status: ${RED}$http_code${NC} ✗"
        echo "Error saved to: $OUTPUT_DIR/$output_file"
    fi
}

echo -e "\n${BLUE}=== SHIPMENTS ENDPOINTS ===${NC}"
echo "================================"

# 1. List shipments
api_request "GET" "/shipments?page[size]=5" \
    "shipments/list-basic.json" \
    "List shipments (basic)"

# 2. List with includes
api_request "GET" "/shipments?page[size]=3&include=containers,terminated_container_count" \
    "shipments/list-with-includes.json" \
    "List shipments with container includes"

# 3. List with filters
api_request "GET" "/shipments?page[size]=5&filter[shipping_line_scac]=MSCU" \
    "shipments/list-filtered-by-line.json" \
    "List shipments filtered by shipping line"

# 4. Get a specific shipment ID from previous response
shipment_id=$(cat "$OUTPUT_DIR/shipments/list-basic.json" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ ! -z "$shipment_id" ]; then
    api_request "GET" "/shipments/$shipment_id" \
        "shipments/single-shipment.json" \
        "Get specific shipment details"
    
    # Get shipment containers
    api_request "GET" "/shipments/$shipment_id/containers" \
        "shipments/shipment-containers.json" \
        "Get shipment containers"
fi

echo -e "\n${BLUE}=== CONTAINERS ENDPOINTS ===${NC}"
echo "================================"

# 1. List containers
api_request "GET" "/containers?page[size]=5" \
    "containers/list-basic.json" \
    "List containers (basic)"

# 2. List with transport events
api_request "GET" "/containers?page[size]=3&include=transport_events" \
    "containers/list-with-events.json" \
    "List containers with transport events"

# 3. Get a specific container
container_id=$(cat "$OUTPUT_DIR/containers/list-basic.json" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ ! -z "$container_id" ]; then
    api_request "GET" "/containers/$container_id" \
        "containers/single-container.json" \
        "Get specific container details"
    
    # Get transport events
    api_request "GET" "/containers/$container_id/transport_events" \
        "containers/transport-events.json" \
        "Get container transport events"
    
    # Get raw events
    api_request "GET" "/containers/$container_id/raw_events" \
        "containers/raw-events.json" \
        "Get container raw events"
fi

echo -e "\n${BLUE}=== TRACKING REQUESTS ===${NC}"
echo "============================="

# 1. List tracking requests
api_request "GET" "/tracking_requests?page[size]=5" \
    "tracking-requests/list-basic.json" \
    "List tracking requests"

# 2. Create tracking request by container number
tracking_data='{
  "data": {
    "type": "tracking_request",
    "attributes": {
      "request_type": "by_container_id",
      "container_number": "MSCU7861323",
      "scac": "MSCU"
    }
  }
}'

api_request "POST" "/tracking_requests" \
    "tracking-requests/create-by-container.json" \
    "Create tracking request by container number" \
    "$tracking_data"

# 3. Create tracking request by booking number
booking_data='{
  "data": {
    "type": "tracking_request",
    "attributes": {
      "request_type": "by_booking_number",
      "booking_number": "TEST123456",
      "scac": "MSCU"
    }
  }
}'

api_request "POST" "/tracking_requests" \
    "tracking-requests/create-by-booking.json" \
    "Create tracking request by booking number" \
    "$booking_data"

echo -e "\n${BLUE}=== WEBHOOKS ===${NC}"
echo "==================="

# 1. List webhooks
api_request "GET" "/webhooks" \
    "webhooks/list.json" \
    "List configured webhooks"

# 2. Get webhook examples
api_request "GET" "/webhook_notifications/examples" \
    "webhooks/notification-examples.json" \
    "Get webhook notification examples"

echo -e "\n${BLUE}=== REFERENCE DATA ===${NC}"
echo "========================="

# 1. Shipping lines
api_request "GET" "/shipping_lines" \
    "reference-data/shipping-lines.json" \
    "List all shipping lines"

# 2. Ports
api_request "GET" "/ports?page[size]=20" \
    "reference-data/ports-list.json" \
    "List ports"

# 3. Search ports
api_request "GET" "/ports?q=Los%20Angeles&page[size]=10" \
    "reference-data/ports-search.json" \
    "Search ports by name"

# 4. Terminals
api_request "GET" "/terminals?page[size]=10" \
    "reference-data/terminals-list.json" \
    "List terminals"

# 5. Vessels
api_request "GET" "/vessels?page[size]=10" \
    "reference-data/vessels-list.json" \
    "List vessels"

# 6. Parties
api_request "GET" "/parties" \
    "reference-data/parties.json" \
    "List parties/customers"

echo -e "\n${BLUE}=== PAGINATION TESTS ===${NC}"
echo "==========================="

# Test different page sizes
for size in 1 10 25 50; do
    api_request "GET" "/shipments?page[size]=$size" \
        "pagination/shipments-size-$size.json" \
        "Test pagination with size $size"
done

# Test page navigation
api_request "GET" "/shipments?page[size]=5&page[number]=2" \
    "pagination/shipments-page-2.json" \
    "Test pagination page 2"

echo -e "\n${BLUE}=== ERROR SCENARIOS ===${NC}"
echo "========================="

# 1. 404 Not Found
api_request "GET" "/invalid_endpoint" \
    "errors/404-not-found.json" \
    "Test 404 Not Found"

# 2. Invalid shipment ID
api_request "GET" "/shipments/invalid-id-12345" \
    "errors/404-resource-not-found.json" \
    "Test 404 Resource Not Found"

# 3. Invalid request body
invalid_data='{
  "data": {
    "type": "tracking_request",
    "attributes": {}
  }
}'

api_request "POST" "/tracking_requests" \
    "errors/422-validation-error.json" \
    "Test 422 Validation Error" \
    "$invalid_data"

# 4. Test with invalid API key
OLD_API_KEY=$API_KEY
API_KEY="invalid-key"
api_request "GET" "/shipments" \
    "errors/401-unauthorized.json" \
    "Test 401 Unauthorized"
API_KEY=$OLD_API_KEY

echo -e "\n${BLUE}======================================${NC}"
echo -e "${GREEN}API response collection complete!${NC}"
echo "All responses saved in: $OUTPUT_DIR/"
echo ""

# Generate summary
echo "Generating summary report..."
find "$OUTPUT_DIR" -name "*.json" -type f | wc -l > "$OUTPUT_DIR/total-responses.txt"
echo -e "${GREEN}Total responses collected:${NC} $(cat $OUTPUT_DIR/total-responses.txt)"