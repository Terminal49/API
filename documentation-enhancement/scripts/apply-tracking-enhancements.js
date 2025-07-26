#!/usr/bin/env node
/**
 * Apply tracking request enhancements to OpenAPI specification
 * This script adds enhanced descriptions, examples, and documentation
 */

const fs = require('fs');
const path = require('path');

// Load the OpenAPI spec
const openapiPath = path.join(__dirname, '../../docs/openapi.json');
const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

console.log('Applying tracking request enhancements to OpenAPI...\n');

// Enhance POST /tracking_requests
if (openapi.paths && openapi.paths['/tracking_requests'] && openapi.paths['/tracking_requests'].post) {
  const post = openapi.paths['/tracking_requests'].post;
  
  // Add comprehensive description
  post.description = `Create a new tracking request to start monitoring a container, booking, or bill of lading.

## Request Types
- \`container\`: Track by container number (must be valid ISO 6346 format)
- \`booking_number\`: Track by booking reference  
- \`bill_of_lading\`: Track by bill of lading number

## Important Notes
- Duplicate requests (same number + SCAC) return the existing tracking
- Failed requests may be automatically retried for temporary errors
- Use the \`/shipping_lines\` endpoint to verify supported SCAC codes

## Validation Rules
- Container numbers: 4 letters + 7 digits (e.g., MSCU1234567)
- All tracking numbers: minimum 6 characters
- SCAC must match a supported shipping line`;

  // Ensure requestBody structure exists
  if (!post.requestBody) {
    post.requestBody = { content: { 'application/json': {} } };
  }
  if (!post.requestBody.content) {
    post.requestBody.content = { 'application/json': {} };
  }
  if (!post.requestBody.content['application/json']) {
    post.requestBody.content['application/json'] = {};
  }

  // Add request examples
  post.requestBody.content['application/json'].examples = {
    track_container: {
      summary: "Track a single container",
      description: "Most common use case - track a container by its ISO number",
      value: {
        data: {
          type: "tracking_request",
          attributes: {
            request_type: "container",
            request_number: "MSCU1234567",
            scac: "MSCU",
            ref_numbers: ["PO-2024-001", "Customer: Acme Corp"],
            shipment_tags: ["electronics", "urgent"]
          }
        }
      }
    },
    track_booking: {
      summary: "Track by booking number",
      description: "Track all containers in a booking (useful for FCL shipments)",
      value: {
        data: {
          type: "tracking_request",
          attributes: {
            request_type: "booking_number",
            request_number: "BOOK123456789",
            scac: "COSU"
          }
        }
      }
    },
    track_bol: {
      summary: "Track by bill of lading",
      description: "Track shipment using B/L number",
      value: {
        data: {
          type: "tracking_request",
          attributes: {
            request_type: "bill_of_lading",
            request_number: "MSCU987654321",
            scac: "MSCU",
            shipment_tags: ["high-value"]
          }
        }
      }
    }
  };

  // Enhance 201 response
  if (post.responses && post.responses['201']) {
    if (!post.responses['201'].content) {
      post.responses['201'].content = { 'application/json': {} };
    }
    if (!post.responses['201'].content['application/json']) {
      post.responses['201'].content['application/json'] = {};
    }
    
    post.responses['201'].content['application/json'].examples = {
      success_pending: {
        summary: "Successfully created - pending processing",
        value: {
          data: {
            id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            type: "tracking_request",
            attributes: {
              request_number: "MSCU1234567",
              request_type: "container",
              scac: "MSCU",
              ref_numbers: ["PO-2024-001"],
              shipment_tags: ["electronics"],
              created_at: "2025-07-16T10:30:00Z",
              updated_at: "2025-07-16T10:30:00Z",
              status: "pending",
              failed_reason: null,
              is_retrying: false,
              retry_count: 0
            },
            relationships: {
              tracked_object: { data: null },
              customer: { data: null },
              user: { data: { id: "current-user", type: "user" } }
            }
          }
        }
      }
    };
  }

  // Add 422 error response examples
  if (!post.responses['422']) {
    post.responses['422'] = {
      description: "Unprocessable Entity - Validation failed"
    };
  }
  if (!post.responses['422'].content) {
    post.responses['422'].content = { 'application/json': {} };
  }
  
  post.responses['422'].content['application/json'].examples = {
    validation_errors: {
      summary: "Multiple validation errors",
      value: {
        errors: [
          {
            status: "422",
            source: { pointer: "/data/attributes/request_number" },
            title: "Unprocessable Entity",
            detail: "Request number can't be blank",
            code: "blank"
          },
          {
            status: "422",
            source: { pointer: "/data/attributes/request_type" },
            title: "Unprocessable Entity",
            detail: "Request type 'invalid_type' not recognized. Accepted request types are 'bill_of_lading', 'booking_number', and 'container'",
            code: "invalid_request_type"
          }
        ]
      }
    },
    invalid_container: {
      summary: "Invalid container number format",
      value: {
        errors: [
          {
            status: "422",
            source: { pointer: "/data/attributes/request_number" },
            title: "Unprocessable Entity",
            detail: "Request number 'ABC123' is not a valid container number",
            code: "invalid_container"
          }
        ]
      }
    }
  };

  console.log('✓ Enhanced POST /tracking_requests');
}

// Enhance GET /tracking_requests
if (openapi.paths && openapi.paths['/tracking_requests'] && openapi.paths['/tracking_requests'].get) {
  const get = openapi.paths['/tracking_requests'].get;
  
  get.description = `Retrieve a paginated list of all tracking requests with optional filtering.

Tracking requests represent attempts to track containers, bookings, or bills of lading.
Each request progresses through a status lifecycle: pending → in_progress → succeeded/failed.

Use filters to find specific requests by status, type, or date range.
Include related resources like the tracked shipment/container when requests succeed.`;

  // Enhance parameters
  if (get.parameters) {
    get.parameters.forEach(param => {
      if (param.name === 'filter[status]') {
        param.description = `Filter tracking requests by current status.
- \`pending\`: Request created but not yet processed
- \`in_progress\`: Currently being tracked with shipping line
- \`succeeded\`: Successfully created shipment/container
- \`failed\`: Tracking failed (check failed_reason for details)`;
        if (param.schema) {
          param.schema.enum = ["pending", "in_progress", "succeeded", "failed"];
        }
      }
    });
  }

  console.log('✓ Enhanced GET /tracking_requests');
}

// Enhance tracking_request schema
if (openapi.components && openapi.components.schemas && openapi.components.schemas.tracking_request) {
  const schema = openapi.components.schemas.tracking_request;
  
  // Add descriptions to properties
  if (schema.properties && schema.properties.attributes && schema.properties.attributes.properties) {
    const attrs = schema.properties.attributes.properties;
    
    if (attrs.request_number) {
      attrs.request_number.description = `The tracking identifier (container number, booking reference, or bill of lading).
- For containers: Must be valid ISO 6346 format (4 letters + 7 digits)
- For bookings/B/L: Minimum 6 characters, format varies by shipping line`;
      attrs.request_number.minLength = 6;
    }
    
    if (attrs.request_type) {
      attrs.request_type.description = `Type of tracking request. Note: API uses different values than UI.
Use exactly: \`container\`, \`booking_number\`, or \`bill_of_lading\``;
    }
    
    if (attrs.status) {
      attrs.status.description = `Current status of the tracking request:
- \`pending\`: Queued for processing
- \`in_progress\`: Actively tracking with shipping line
- \`succeeded\`: Successfully created tracked object
- \`failed\`: Tracking failed (see failed_reason)`;
    }
    
    if (attrs.failed_reason) {
      attrs.failed_reason.description = `Reason for tracking failure (null when not failed):
- \`shipping_line_not_supported\`: SCAC not supported
- \`invalid_container\`: Invalid container number format
- \`not_found\`: Number not found at shipping line
- \`rate_limited\`: Temporary rate limit
- \`shipping_line_error\`: Temporary shipping line issue
- \`booking_not_shipped\`: Booking exists but not shipped yet`;
    }
  }
  
  console.log('✓ Enhanced tracking_request schema');
}

// Save the enhanced OpenAPI
fs.writeFileSync(openapiPath, JSON.stringify(openapi, null, 2));

console.log('\n✅ Enhancement complete!');
console.log('The OpenAPI file has been updated with tracking request enhancements.');
console.log('\nMintlify should automatically reload. If not, refresh your browser.');
console.log('Navigate to: http://localhost:3001/api-reference/tracking-requests/create-a-tracking-request');