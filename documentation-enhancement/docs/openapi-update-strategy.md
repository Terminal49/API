# OpenAPI Update Strategy for Enhanced Documentation

## Overview

This document outlines the methodology for updating the OpenAPI specification with the enhanced documentation insights gathered from API testing and analysis.

## Update Approach

### 1. Schema Enhancements

#### Current State
The OpenAPI spec has basic schemas but lacks:
- Detailed field descriptions
- Business logic explanations
- Validation rules
- Example values

#### Enhancement Strategy

```yaml
# Before:
request_number:
  type: string
  example: "ONEYSH9AME650500"

# After:
request_number:
  type: string
  description: |
    The tracking identifier (container number, booking reference, or bill of lading).
    - For containers: Must be valid ISO 6346 format (4 letters + 7 digits)
    - For bookings/B/L: Minimum 6 characters
    - Examples: MSCU1234567 (container), BOOK123456 (booking)
  example: "MSCU1234567"
  minLength: 6
  pattern: "^[A-Z]{4}[0-9]{7}$|^.{6,}$"
```

### 2. Parameter Documentation

#### Current State
Parameters have minimal descriptions:
```yaml
- name: filter[status]
  in: query
  schema:
    type: string
```

#### Enhanced Version
```yaml
- name: filter[status]
  in: query
  description: |
    Filter tracking requests by current status.
    - `pending`: Request created but not yet processed
    - `in_progress`: Currently being tracked with shipping line
    - `succeeded`: Successfully created shipment/container
    - `failed`: Tracking failed (see failed_reason for details)
  schema:
    type: string
    enum: [pending, in_progress, succeeded, failed]
  example: succeeded
```

### 3. Response Examples

#### Current State
Limited examples without context

#### Enhanced Version
Add multiple examples showing different scenarios:
```yaml
examples:
  successful_container_tracking:
    summary: Successfully tracked container
    value:
      data:
        id: "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        type: "tracking_request"
        attributes:
          request_number: "MSCU1234567"
          request_type: "container"
          status: "succeeded"
          failed_reason: null
          
  failed_invalid_number:
    summary: Failed - Invalid container format
    value:
      errors:
        - status: "422"
          detail: "Request number 'INVALID123' is not a valid container number"
          
  failed_unsupported_line:
    summary: Failed - Shipping line not supported
    value:
      data:
        attributes:
          status: "failed"
          failed_reason: "shipping_line_not_supported"
```

### 4. Error Response Schemas

Add comprehensive error documentation:
```yaml
components:
  schemas:
    tracking_request_error:
      type: object
      properties:
        errors:
          type: array
          items:
            type: object
            properties:
              status:
                type: string
                description: HTTP status code
              source:
                type: object
                properties:
                  pointer:
                    type: string
                    description: JSON pointer to the error source
              title:
                type: string
                description: Error title
              detail:
                type: string
                description: Detailed error message
              code:
                type: string
                enum: [blank, too_short, invalid_request_type, invalid_container]
                description: Machine-readable error code
```

### 5. Business Logic Documentation

Add x-business-logic extensions:
```yaml
tracking_request:
  x-business-logic:
    status_flow:
      description: "Tracking requests flow: created → pending → in_progress → succeeded/failed"
    retry_logic:
      description: "Failed requests with temporary errors are automatically retried up to 3 times"
    deduplication:
      description: "Duplicate requests (same number + SCAC) return existing tracking"
```

## Implementation Steps

### 1. Create OpenAPI Enhancement Script

```python
import json
import yaml
from typing import Dict, Any

class OpenAPIEnhancer:
    def __init__(self, spec_path: str, enhancements_path: str):
        self.spec = self.load_spec(spec_path)
        self.enhancements = self.load_enhancements(enhancements_path)
    
    def enhance_tracking_requests(self):
        """Apply enhancements to tracking requests endpoints"""
        
        # Enhance POST /tracking_requests
        post_endpoint = self.spec['paths']['/tracking_requests']['post']
        
        # Add detailed description
        post_endpoint['description'] = self.enhancements['endpoints']['create']['description']
        
        # Enhance request body schema
        request_schema = post_endpoint['requestBody']['content']['application/json']['schema']
        self.enhance_schema(request_schema, self.enhancements['schemas']['request'])
        
        # Add multiple examples
        post_endpoint['requestBody']['content']['application/json']['examples'] = \
            self.enhancements['examples']['requests']
        
        # Enhance response examples
        for status_code, response in post_endpoint['responses'].items():
            if status_code in self.enhancements['examples']['responses']:
                response['content']['application/json']['examples'] = \
                    self.enhancements['examples']['responses'][status_code]
        
        # Enhance parameters for GET endpoint
        get_endpoint = self.spec['paths']['/tracking_requests']['get']
        self.enhance_parameters(get_endpoint['parameters'], 
                              self.enhancements['parameters'])
    
    def enhance_schema(self, schema: Dict, enhancements: Dict):
        """Recursively enhance schema with descriptions and validations"""
        # Implementation details...
        
    def enhance_parameters(self, parameters: list, enhancements: Dict):
        """Enhance parameter descriptions and examples"""
        # Implementation details...
```

### 2. Enhancement Data Structure

Create a structured enhancement file:
```yaml
# tracking-requests-enhancements.yaml
endpoints:
  create:
    description: |
      Create a new tracking request to start monitoring a container, booking, or bill of lading.
      
      ## Request Types
      - `container`: Track by container number (ISO 6346 format)
      - `booking_number`: Track by booking reference
      - `bill_of_lading`: Track by bill of lading number
      
      ## Validation Rules
      - Container numbers must be valid ISO 6346 format
      - All numbers must be at least 6 characters
      - SCAC must be a supported shipping line
      
schemas:
  request:
    properties:
      request_type:
        description: "Type of tracking request"
        enum_descriptions:
          container: "Track by container number"
          booking_number: "Track by booking reference"
          bill_of_lading: "Track by B/L number"
      request_number:
        validation:
          minLength: 6
          pattern: "^[A-Z]{4}[0-9]{7}$|^.{6,}$"
        
examples:
  requests:
    track_container:
      summary: "Track a single container"
      value:
        data:
          type: "tracking_request"
          attributes:
            request_type: "container"
            request_number: "MSCU1234567"
            scac: "MSCU"
            ref_numbers: ["PO-12345"]
```

### 3. Validation and Testing

```python
def validate_enhanced_spec(spec_path: str):
    """Validate the enhanced OpenAPI spec"""
    
    # 1. Check schema validity
    # 2. Verify all examples match schemas
    # 3. Test parameter combinations
    # 4. Validate business logic consistency
```

## Benefits of This Approach

1. **Automated Updates**: Script can be rerun as documentation evolves
2. **Consistency**: Ensures all endpoints follow same documentation pattern
3. **Validation**: Examples are validated against schemas
4. **Maintainability**: Enhancements stored separately from spec
5. **Version Control**: Track changes to both spec and enhancements

## Next Steps

1. Create enhancement files for each endpoint based on testing
2. Build the enhancement script
3. Validate enhanced spec
4. Generate updated Postman collection
5. Update Mintlify documentation

This approach ensures the OpenAPI specification becomes a comprehensive, developer-friendly resource that captures all the insights from our API testing and analysis.