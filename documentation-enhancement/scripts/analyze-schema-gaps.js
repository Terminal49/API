#!/usr/bin/env node
/**
 * Analyze gaps between API responses and OpenAPI schema
 */

const fs = require('fs');
const path = require('path');

// Load OpenAPI spec
const openapiPath = path.join(__dirname, '../../docs/openapi.json');
const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'));

// Load container response
const containerResponsePath = path.join(__dirname, '../api-responses/containers/list-basic.json');
const containerResponse = JSON.parse(fs.readFileSync(containerResponsePath, 'utf8'));

console.log('Analyzing schema gaps for Container endpoint...\n');

// Get fields from OpenAPI schema
function getSchemaFields(schemaName) {
  const schema = openapi.components?.schemas?.[schemaName];
  if (!schema?.properties?.attributes?.properties) {
    return new Set();
  }
  return new Set(Object.keys(schema.properties.attributes.properties));
}

// Get fields from API response
function getResponseFields(response) {
  const fields = new Set();
  if (response.data && response.data.length > 0) {
    const attributes = response.data[0].attributes;
    Object.keys(attributes).forEach(key => fields.add(key));
  }
  return fields;
}

// Analyze container schema
const schemaFields = getSchemaFields('container');
const responseFields = getResponseFields(containerResponse);

console.log(`Fields in OpenAPI schema: ${schemaFields.size}`);
console.log(`Fields in API response: ${responseFields.size}`);

// Find missing fields
const missingInSchema = [];
const missingInResponse = [];

responseFields.forEach(field => {
  if (!schemaFields.has(field)) {
    missingInSchema.push(field);
  }
});

schemaFields.forEach(field => {
  if (!responseFields.has(field)) {
    missingInResponse.push(field);
  }
});

if (missingInSchema.length > 0) {
  console.log('\n❌ Fields in API response but MISSING from OpenAPI schema:');
  missingInSchema.forEach(field => {
    const value = containerResponse.data[0].attributes[field];
    const type = Array.isArray(value) ? 'array' : typeof value;
    console.log(`   - ${field} (${type}): ${JSON.stringify(value)}`);
  });
}

if (missingInResponse.length > 0) {
  console.log('\n⚠️  Fields in OpenAPI schema but not in this response:');
  missingInResponse.forEach(field => {
    console.log(`   - ${field}`);
  });
}

// Check field types match
console.log('\n📋 Checking field type consistency:');
let typeIssues = 0;
responseFields.forEach(field => {
  if (schemaFields.has(field)) {
    const schemaField = openapi.components.schemas.container.properties.attributes.properties[field];
    const responseValue = containerResponse.data[0].attributes[field];
    const responseType = Array.isArray(responseValue) ? 'array' : typeof responseValue;
    
    if (schemaField.type) {
      let schemaType = schemaField.type;
      if (schemaType === 'string' && responseValue === null) {
        // Nullable strings are ok
        return;
      }
      if (schemaType === 'number' && responseType === 'number') {
        return;
      }
      if (schemaType === 'boolean' && responseType === 'boolean') {
        return;
      }
      if (schemaType === 'array' && responseType === 'array') {
        return;
      }
      if (schemaType === 'string' && responseType === 'string') {
        return;
      }
      
      // Type mismatch
      console.log(`   - ${field}: schema says '${schemaType}' but response has '${responseType}'`);
      typeIssues++;
    }
  }
});

if (typeIssues === 0) {
  console.log('   ✓ All field types match!');
}

// Summary
console.log('\n📊 Summary:');
console.log(`   - Total fields documented: ${schemaFields.size}`);
console.log(`   - Total fields in response: ${responseFields.size}`);
console.log(`   - Missing from schema: ${missingInSchema.length}`);
console.log(`   - Coverage: ${Math.round((schemaFields.size - missingInSchema.length) / responseFields.size * 100)}%`);

// Generate schema additions
if (missingInSchema.length > 0) {
  console.log('\n💡 Suggested schema additions:');
  console.log('```javascript');
  console.log('// Add these to container attributes:');
  missingInSchema.forEach(field => {
    const value = containerResponse.data[0].attributes[field];
    const type = Array.isArray(value) ? 'array' : 
                  value === null ? 'string' :
                  typeof value === 'number' ? 'number' :
                  typeof value === 'boolean' ? 'boolean' : 'string';
    
    console.log(`${field}: {`);
    console.log(`  type: "${type}",`);
    console.log(`  nullable: ${value === null ? 'true' : 'false'},`);
    console.log(`  description: "// TODO: Add description"`);
    console.log(`},`);
  });
  console.log('```');
}