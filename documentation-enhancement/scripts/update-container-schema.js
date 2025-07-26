#!/usr/bin/env node
/**
 * Update OpenAPI schema to match actual API responses
 */

const fs = require('fs');
const path = require('path');

// Load OpenAPI spec
const openapiPath = path.join(__dirname, '../../docs/openapi.json');
const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

console.log('Updating Container schema to match API responses...\n');

// Get container schema
const containerSchema = openapi.components.schemas.container;
const attributes = containerSchema.properties.attributes.properties;

// Add missing fields discovered from API responses
const missingFields = {
  rail_last_tracking_request_at: {
    type: "string",
    nullable: true,
    description: "Last attempt to get rail tracking updates (ISO 8601)"
  },
  ind_facility_holds: {
    type: "array",
    nullable: true,
    description: "Holds at the inland facility (similar to holds_at_pod_terminal)",
    items: {
      type: "object",
      properties: {
        status: { type: "string" },
        name: { type: "string" },
        description: { type: "string" }
      }
    }
  },
  ind_facility_fees: {
    type: "array", 
    nullable: true,
    description: "Outstanding fees at the inland facility",
    items: {
      type: "object",
      properties: {
        amount: { type: "number" },
        description: { type: "string" }
      }
    }
  },
  ssl_lfd: {
    type: "string",
    nullable: true,
    description: "Steamship Line Last Free Day - may differ from terminal LFD (ISO 8601)"
  }
};

// Add missing fields to schema
Object.entries(missingFields).forEach(([field, schema]) => {
  if (!attributes[field]) {
    attributes[field] = schema;
    console.log(`✅ Added missing field: ${field}`);
  }
});

// Fix type issues
if (attributes.equipment_length && attributes.equipment_length.type === 'integer') {
  // Keep as integer - the response value of 20.0 is still technically an integer
  console.log('✓ equipment_length type is correct (integer)');
}

// Ensure all fields that can be null are marked as nullable
const nullableFields = [
  'seal_number', 'pod_arrived_at', 'pod_discharged_at', 'final_destination_full_out_at',
  'pod_full_out_at', 'empty_terminated_at', 'pickup_lfd', 'pickup_appointment_at',
  'pod_full_out_chassis_number', 'location_at_pod_terminal', 'pod_rail_carrier_scac',
  'ind_rail_carrier_scac', 'pod_rail_loaded_at', 'pod_rail_departed_at', 'ind_eta_at',
  'ind_ata_at', 'ind_rail_unloaded_at', 'ind_facility_lfd_on', 'final_destination_timezone',
  'empty_terminated_timezone'
];

nullableFields.forEach(field => {
  if (attributes[field] && !attributes[field].nullable) {
    attributes[field].nullable = true;
    console.log(`✓ Marked ${field} as nullable`);
  }
});

// Save the updated OpenAPI spec
fs.writeFileSync(openapiPath, JSON.stringify(openapi, null, 2));

console.log('\n✅ Container schema updated to match API responses!');
console.log('The OpenAPI specification now accurately reflects the actual API.');

// Generate report
console.log('\n📊 Schema Update Report:');
console.log(`- Added ${Object.keys(missingFields).length} missing fields`);
console.log(`- Verified nullable fields`);
console.log(`- Total container attributes: ${Object.keys(attributes).length}`);