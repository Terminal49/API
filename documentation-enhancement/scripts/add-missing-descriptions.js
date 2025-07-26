#!/usr/bin/env node
/**
 * Add descriptions to container fields that are missing them
 */

const fs = require('fs');
const path = require('path');

// Load OpenAPI spec
const openapiPath = path.join(__dirname, '../../docs/openapi.json');
const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

console.log('Adding missing field descriptions...\n');

// Get container schema
const containerSchema = openapi.components.schemas.container;
const attributes = containerSchema.properties.attributes.properties;

// Define descriptions for missing fields
const missingDescriptions = {
  ref_numbers: "Reference numbers associated with this container (e.g., PO numbers, invoice numbers)",
  weight_in_lbs: "Cargo weight in pounds. May be 0 if not provided by shipping line",
  created_at: "When the container was first tracked in Terminal49 (ISO 8601)",
  pod_last_tracking_request_at: "Last attempt to get terminal updates for this container (ISO 8601)",
  shipment_last_tracking_request_at: "Last attempt to update container from shipping line (ISO 8601)",
  pod_rail_loaded_at: "When the container was loaded onto rail at port of discharge (ISO 8601)",
  pod_rail_departed_at: "When the rail departed from port of discharge (ISO 8601)",
  ind_eta_at: "Estimated arrival at inland destination (ISO 8601)",
  ind_ata_at: "Actual arrival at inland destination (ISO 8601)",
  ind_rail_unloaded_at: "When the container was unloaded from rail at inland point (ISO 8601)"
};

// Add missing descriptions
let updated = 0;
Object.entries(missingDescriptions).forEach(([fieldName, description]) => {
  if (attributes[fieldName] && !attributes[fieldName].description) {
    attributes[fieldName].description = description;
    console.log(`✅ Added description for: ${fieldName}`);
    updated++;
  }
});

// Save the updated OpenAPI spec
fs.writeFileSync(openapiPath, JSON.stringify(openapi, null, 2));

console.log(`\n✅ Added descriptions to ${updated} fields!`);

// Re-check coverage
let totalFields = 0;
let fieldsWithDescription = 0;

Object.entries(attributes).forEach(([fieldName, fieldSchema]) => {
  totalFields++;
  if (fieldSchema.description && fieldSchema.description.trim() !== '') {
    fieldsWithDescription++;
  }
});

const coverage = Math.round((fieldsWithDescription / totalFields) * 100);
console.log(`\n📈 New description coverage: ${coverage}% (${fieldsWithDescription}/${totalFields} fields)`);