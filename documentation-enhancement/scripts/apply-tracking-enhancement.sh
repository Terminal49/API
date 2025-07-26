#!/bin/bash

# Simple script to manually apply tracking request enhancements to OpenAPI
# This demonstrates what the Python script would do

echo "Applying Tracking Request enhancements to OpenAPI..."

# Create backup
cp ../../docs/openapi.json ../../docs/openapi-backup.json

# Use jq to update the tracking_requests endpoint
# Note: This is a simplified version - the Python script does more comprehensive updates

jq '.paths["/tracking_requests"].post.description = "Create a new tracking request to start monitoring a container, booking, or bill of lading.\n\n## Request Types\n- `container`: Track by container number (must be valid ISO 6346 format)\n- `booking_number`: Track by booking reference\n- `bill_of_lading`: Track by bill of lading number\n\n## Important Notes\n- Duplicate requests (same number + SCAC) return the existing tracking\n- Failed requests may be automatically retried for temporary errors\n- Use the `/shipping_lines` endpoint to verify supported SCAC codes"' \
  ../../docs/openapi.json > ../../docs/openapi-temp.json

# Add request examples
jq '.paths["/tracking_requests"].post.requestBody.content["application/json"].examples = {
  "track_container": {
    "summary": "Track a single container",
    "value": {
      "data": {
        "type": "tracking_request",
        "attributes": {
          "request_type": "container",
          "request_number": "MSCU1234567",
          "scac": "MSCU",
          "ref_numbers": ["PO-2024-001"],
          "shipment_tags": ["urgent"]
        }
      }
    }
  }
}' ../../docs/openapi-temp.json > ../../docs/openapi-enhanced-simple.json

echo "Enhancement complete!"
echo "Original backed up to: docs/openapi-backup.json"
echo "Enhanced version at: docs/openapi-enhanced-simple.json"
echo ""
echo "To test:"
echo "1. cp docs/openapi-enhanced-simple.json docs/openapi.json"
echo "2. cd docs && mintlify dev"
echo "3. Navigate to http://localhost:3000/api-reference/tracking-requests/create-a-tracking-request"