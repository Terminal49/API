#!/usr/bin/env node
/**
 * Enhance tracking request documentation with proper markdown formatting
 */

const fs = require('fs');
const path = require('path');

// Better formatted description using bold instead of headers
const ENHANCED_DESCRIPTION = `To track an ocean shipment, you create a new tracking request. Two attributes are required to track a shipment: a bill of lading/booking number and a shipping line SCAC.

Once a tracking request is created we will attempt to fetch the shipment details and its related containers from the shipping line. If the attempt is successful we will create a new shipment object including any related container objects. We will send a \`tracking_request.succeeded\` webhook notification to your webhooks.

If the attempt to fetch fails then we will send a \`tracking_request.failed\` webhook notification to your webhooks.

A \`tracking_request.succeeded\` or \`tracking_request.failed\` webhook notification will only be sent if you have at least one active webhook.

**Request Types**

You can track shipments using three different identifiers:

- **\`bill_of_lading\`** - Track using the bill of lading number
- **\`booking_number\`** - Track using the carrier's booking reference  
- **\`container\`** - Track a specific container (must be valid ISO 6346 format: 4 letters + 7 digits)

**Validation Rules**

- **Container numbers**: Must follow ISO 6346 format (e.g., MSCU1234567)
- **All tracking numbers**: Minimum 6 characters
- **SCAC codes**: Must be a supported shipping line (see \`/shipping_lines\` endpoint)

**Processing Flow**

1. **Pending** - Your request is queued for processing
2. **In Progress** - We're fetching data from the shipping line
3. **Succeeded** - Shipment and containers created successfully
4. **Failed** - Unable to track (see \`failed_reason\` for details)

**Important Notes**

- **Duplicate prevention**: Submitting the same number + SCAC returns the existing tracking request
- **Automatic retries**: Temporary failures (rate limits, network issues) are retried automatically
- **Reference numbers**: Add your internal references using \`ref_numbers\` for easier tracking
- **Tags**: Organize shipments with custom tags for filtering and grouping`;

// Load the OpenAPI spec
const openapiPath = path.join(__dirname, '../../docs/openapi.json');
const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

console.log('Applying better formatted enhancements...\n');

// Update POST /tracking_requests
if (openapi.paths && openapi.paths['/tracking_requests'] && openapi.paths['/tracking_requests'].post) {
  const post = openapi.paths['/tracking_requests'].post;
  
  // Use the better formatted description
  post.description = ENHANCED_DESCRIPTION;
  
  console.log('✓ Updated POST /tracking_requests with better formatting');
}

// Update GET /tracking_requests with better formatting
if (openapi.paths && openapi.paths['/tracking_requests'] && openapi.paths['/tracking_requests'].get) {
  const get = openapi.paths['/tracking_requests'].get;
  
  get.description = `Retrieve a paginated list of all tracking requests with optional filtering.

**Tracking Request Lifecycle**

Monitor the progress of your tracking requests through these states:

- **\`pending\`** - Request created and queued
- **\`in_progress\`** - Actively fetching from shipping line  
- **\`succeeded\`** - Successfully tracked - shipment/containers created
- **\`failed\`** - Tracking failed - check \`failed_reason\`

**Filtering Options**

- **\`filter[status]\`** - Filter by current status
- **\`filter[request_type]\`** - Filter by type (container, booking_number, bill_of_lading)
- **\`filter[created_at_gte]\`** - Find requests created after a date
- **\`filter[created_at_lte]\`** - Find requests created before a date

**Including Related Resources**

Use the \`include\` parameter to retrieve related data:

- **\`tracked_object\`** - The created shipment or container (when succeeded)
- **\`customer\`** - Associated customer/party
- **\`user\`** - User who created the request`;

  console.log('✓ Updated GET /tracking_requests with better formatting');
}

// Save the enhanced OpenAPI
fs.writeFileSync(openapiPath, JSON.stringify(openapi, null, 2));

console.log('\n✅ Formatting improvements applied!');
console.log('Using bold text instead of headers for better visual hierarchy.');