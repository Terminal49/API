# Testing Tracking Request Enhancement Demo

## Current State in OpenAPI

The current `/tracking_requests` POST endpoint has minimal documentation:

```json
{
  "summary": "Create a tracking request",
  "operationId": "post-track",
  "responses": {
    "201": {
      "description": "Tracking Request Created"
    }
  }
}
```

## After Enhancement

With our `openapi-enhancements/tracking-requests.yaml` file, the enhanced version would be:

```json
{
  "summary": "Create a tracking request",
  "description": "Create a new tracking request to start monitoring a container, booking, or bill of lading.\n\n## Request Types\n- `container`: Track by container number (must be valid ISO 6346 format)\n- `booking_number`: Track by booking reference\n- `bill_of_lading`: Track by bill of lading number\n\n## Important Notes\n- Duplicate requests (same number + SCAC) return the existing tracking\n- Failed requests may be automatically retried for temporary errors\n- Use the `/shipping_lines` endpoint to verify supported SCAC codes\n\n## Validation Rules\n- Container numbers: 4 letters + 7 digits (e.g., MSCU1234567)\n- All tracking numbers: minimum 6 characters\n- SCAC must match a supported shipping line",
  "operationId": "post-track",
  "requestBody": {
    "content": {
      "application/json": {
        "examples": {
          "track_container": {
            "summary": "Track a single container",
            "description": "Most common use case - track a container by its ISO number",
            "value": {
              "data": {
                "type": "tracking_request",
                "attributes": {
                  "request_type": "container",
                  "request_number": "MSCU1234567",
                  "scac": "MSCU",
                  "ref_numbers": ["PO-2024-001", "Customer: Acme Corp"],
                  "shipment_tags": ["electronics", "urgent"]
                }
              }
            }
          },
          "track_booking": {
            "summary": "Track by booking number",
            "description": "Track all containers in a booking (useful for FCL shipments)",
            "value": {
              "data": {
                "type": "tracking_request",
                "attributes": {
                  "request_type": "booking_number",
                  "request_number": "BOOK123456789",
                  "scac": "COSU"
                }
              }
            }
          }
        }
      }
    }
  },
  "responses": {
    "201": {
      "description": "Tracking Request Created",
      "content": {
        "application/json": {
          "examples": {
            "success_pending": {
              "summary": "Successfully created - pending processing",
              "value": {
                "data": {
                  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
                  "type": "tracking_request",
                  "attributes": {
                    "request_number": "MSCU1234567",
                    "request_type": "container",
                    "scac": "MSCU",
                    "status": "pending",
                    "failed_reason": null
                  }
                }
              }
            }
          }
        }
      }
    },
    "422": {
      "description": "Unprocessable Entity",
      "content": {
        "application/json": {
          "examples": {
            "validation_errors": {
              "summary": "Multiple validation errors",
              "value": {
                "errors": [
                  {
                    "status": "422",
                    "source": {
                      "pointer": "/data/attributes/request_number"
                    },
                    "title": "Unprocessable Entity",
                    "detail": "Request number can't be blank",
                    "code": "blank"
                  }
                ]
              }
            }
          }
        }
      }
    }
  },
  "x-code-samples": [
    {
      "lang": "Python",
      "source": "import requests\n\nheaders = {\n    \"Authorization\": \"Bearer YOUR_API_KEY\",\n    \"Content-Type\": \"application/vnd.api+json\"\n}\n\npayload = {\n    \"data\": {\n        \"type\": \"tracking_request\",\n        \"attributes\": {\n            \"request_type\": \"container\",\n            \"request_number\": \"MSCU1234567\",\n            \"scac\": \"MSCU\"\n        }\n    }\n}\n\nresponse = requests.post(\n    \"https://api.terminal49.com/v2/tracking_requests\",\n    json=payload,\n    headers=headers\n)"
    }
  ]
}
```

## How to Test with Mintlify

1. **Install Dependencies** (if not already installed):
   ```bash
   pip install pyyaml jsonschema openapi-spec-validator
   ```

2. **Run the Enhancement Script**:
   ```bash
   cd documentation-enhancement/scripts
   python enhance-openapi.py
   ```
   This creates `docs/openapi-enhanced.json`

3. **Update Mintlify Config** to use the enhanced spec:
   ```json
   {
     "openapi": "docs/openapi-enhanced.json"
   }
   ```

4. **Run Mintlify Locally**:
   ```bash
   mintlify dev
   ```

5. **View the Enhanced Documentation**:
   - Navigate to http://localhost:3000
   - Go to the Tracking Requests section
   - You'll see the enhanced descriptions, examples, and code samples

## Key Improvements You'll See

1. **Detailed Descriptions**: Business context and validation rules
2. **Multiple Examples**: Different tracking types with real values
3. **Error Examples**: What errors look like and how to handle them
4. **Code Samples**: Ready-to-use Python and JavaScript examples
5. **Field Documentation**: Every parameter explained with types and constraints

## Manual Testing (Without Dependencies)

If you want to see the changes without running the scripts, you can:

1. Copy the enhanced content from `tracking-requests-enhanced.md` 
2. Update the relevant sections in your Mintlify MDX files
3. Run `mintlify dev` to see the changes

The enhancement process automates this manual work for all endpoints.