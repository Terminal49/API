#!/usr/bin/env node
/**
 * Check which fields are missing descriptions in the OpenAPI schema
 */

const fs = require('fs');
const path = require('path');

// Load OpenAPI spec
const openapiPath = path.join(__dirname, '../../docs/openapi.json');
const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

console.log('Checking Container schema field descriptions...\n');

// Get container schema
const containerSchema = openapi.components.schemas.container;
const attributes = containerSchema.properties.attributes.properties;

// Check each field for description
const fieldsWithoutDescription = [];
const fieldsWithDescription = [];

Object.entries(attributes).forEach(([fieldName, fieldSchema]) => {
  if (!fieldSchema.description || fieldSchema.description.trim() === '') {
    fieldsWithoutDescription.push(fieldName);
  } else {
    fieldsWithDescription.push(fieldName);
  }
});

// Report results
console.log(`📊 Container Field Description Status:`);
console.log(`   Total fields: ${Object.keys(attributes).length}`);
console.log(`   ✅ With descriptions: ${fieldsWithDescription.length}`);
console.log(`   ❌ Missing descriptions: ${fieldsWithoutDescription.length}`);

if (fieldsWithoutDescription.length > 0) {
  console.log(`\n❌ Fields missing descriptions:`);
  fieldsWithoutDescription.forEach(field => {
    const fieldSchema = attributes[field];
    console.log(`   - ${field} (${fieldSchema.type}${fieldSchema.nullable ? ', nullable' : ''})`);
  });
}

// Calculate coverage
const coverage = Math.round((fieldsWithDescription.length / Object.keys(attributes).length) * 100);
console.log(`\n📈 Description coverage: ${coverage}%`);

// Show a few examples of good descriptions
if (fieldsWithDescription.length > 0) {
  console.log(`\n✅ Examples of documented fields:`);
  fieldsWithDescription.slice(0, 3).forEach(field => {
    console.log(`   - ${field}: "${attributes[field].description.substring(0, 60)}..."`);
  });
}