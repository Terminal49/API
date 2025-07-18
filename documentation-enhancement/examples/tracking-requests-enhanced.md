# Tracking Requests API Documentation

## Overview

The Tracking Requests API allows you to initiate and manage container tracking through Terminal49. This is the primary entry point for adding containers, bookings, or bills of lading to your tracking dashboard.

## Core Concepts

### Request Types

Terminal49 supports three types of tracking requests:

1. **container** - Track by container number
2. **booking_number** - Track by booking reference
3. **bill_of_lading** - Track by bill of lading number

### Status Lifecycle

Tracking requests progress through the following statuses:

```
created → pending → in_progress → succeeded/failed
                         ↓
                    retrying (if failed)
```

### Supported Shipping Lines

Tracking availability depends on shipping line support. Use the `/shipping_lines` endpoint to verify SCAC codes and tracking capabilities.

## Endpoints

### List Tracking Requests

```http
GET /v2/tracking_requests
```

Retrieve a paginated list of all tracking requests with optional filtering.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page[size]` | integer | 20 | Number of results per page (1-100) |
| `page[number]` | integer | 1 | Page number to retrieve |
| `filter[status]` | string | - | Filter by status: `pending`, `in_progress`, `succeeded`, `failed` |
| `filter[request_type]` | string | - | Filter by type: `container`, `booking_number`, `bill_of_lading` |
| `filter[scac]` | string | - | Filter by shipping line SCAC code |
| `filter[created_at_gte]` | ISO 8601 | - | Filter by creation date (greater than or equal) |
| `filter[created_at_lte]` | ISO 8601 | - | Filter by creation date (less than or equal) |
| `include` | string | - | Include related resources: `tracked_object`, `customer`, `user` |

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier |
| `type` | string | Always "tracking_request" |
| **attributes** | | |
| `request_number` | string | The tracking number (container/booking/B/L) |
| `request_type` | string | Type of request: `container`, `booking_number`, `bill_of_lading` |
| `scac` | string | Shipping line SCAC code |
| `ref_numbers` | array | Reference numbers to attach to created shipment |
| `shipment_tags` | array | Tags to apply to created shipment |
| `created_at` | ISO 8601 | When the request was created |
| `updated_at` | ISO 8601 | Last update timestamp |
| `status` | string | Current status: `pending`, `in_progress`, `succeeded`, `failed` |
| `failed_reason` | string\|null | Reason for failure (see failure reasons below) |
| `is_retrying` | boolean | Whether the system is retrying |
| `retry_count` | integer\|null | Number of retry attempts |
| **relationships** | | |
| `tracked_object` | object | The created shipment or container (when succeeded) |
| `customer` | object | Associated customer/party |
| `user` | object | User who created the request |

#### Example Request

```bash
curl -X GET "https://api.terminal49.com/v2/tracking_requests?filter[status]=succeeded&page[size]=10" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json"
```

#### Example Response

```json
{
  "data": [
    {
      "id": "8d8fc5e9-9d63-4407-a635-4dbe84d70336",
      "type": "tracking_request",
      "attributes": {
        "request_number": "MSCU1234567",
        "request_type": "container",
        "scac": "MSCU",
        "ref_numbers": ["PO-2024-001"],
        "shipment_tags": ["urgent", "electronics"],
        "created_at": "2025-07-15T15:01:16Z",
        "updated_at": "2025-07-15T15:02:30Z",
        "status": "succeeded",
        "failed_reason": null,
        "is_retrying": false,
        "retry_count": 0
      },
      "relationships": {
        "tracked_object": {
          "data": {
            "id": "c669c515-f12e-4587-b0e2-72769c1efccd",
            "type": "container"
          }
        },
        "customer": {
          "data": {
            "id": "acme-corp",
            "type": "party"
          }
        },
        "user": {
          "data": {
            "id": "user-123",
            "type": "user"
          }
        }
      },
      "links": {
        "self": "/v2/tracking_requests/8d8fc5e9-9d63-4407-a635-4dbe84d70336"
      }
    }
  ],
  "meta": {
    "size": 1,
    "total": 245
  },
  "links": {
    "self": "https://api.terminal49.com/v2/tracking_requests?filter[status]=succeeded&page[size]=10",
    "current": "https://api.terminal49.com/v2/tracking_requests?filter[status]=succeeded&page[number]=1&page[size]=10",
    "next": "https://api.terminal49.com/v2/tracking_requests?filter[status]=succeeded&page[number]=2&page[size]=10",
    "last": "https://api.terminal49.com/v2/tracking_requests?filter[status]=succeeded&page[number]=25&page[size]=10"
  }
}
```

### Create Tracking Request

```http
POST /v2/tracking_requests
```

Create a new tracking request to start monitoring a container, booking, or bill of lading.

#### Request Body

```json
{
  "data": {
    "type": "tracking_request",
    "attributes": {
      "request_type": "container|booking_number|bill_of_lading",
      "request_number": "string",
      "scac": "string",
      "ref_numbers": ["array", "of", "strings"] // optional
      "shipment_tags": ["array", "of", "tags"] // optional
    }
  }
}
```

#### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `request_type` | string | Yes | Must be: `container`, `booking_number`, or `bill_of_lading` |
| `request_number` | string | Yes | The tracking identifier (min 6 characters) |
| `scac` | string | Yes | Shipping line SCAC code |
| `ref_numbers` | array | No | Reference numbers to attach to the shipment |
| `shipment_tags` | array | No | Tags for organization and filtering |

#### Validation Rules

1. **Container Numbers**:
   - Must be valid ISO 6346 format
   - 4 letters (owner code + equipment category) + 7 digits
   - Example: `MSCU1234567`

2. **Booking Numbers**:
   - Minimum 6 characters
   - Format varies by shipping line

3. **Bill of Lading Numbers**:
   - Minimum 6 characters
   - May include shipping line prefix

#### Example Requests

##### Track by Container Number

```bash
curl -X POST "https://api.terminal49.com/v2/tracking_requests" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "tracking_request",
      "attributes": {
        "request_type": "container",
        "request_number": "MSCU1234567",
        "scac": "MSCU",
        "ref_numbers": ["PO-2024-001", "INV-2024-456"],
        "shipment_tags": ["electronics", "high-value"]
      }
    }
  }'
```

##### Track by Booking Number

```bash
curl -X POST "https://api.terminal49.com/v2/tracking_requests" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "tracking_request",
      "attributes": {
        "request_type": "booking_number",
        "request_number": "BOOK123456",
        "scac": "COSU"
      }
    }
  }'
```

##### Track by Bill of Lading

```bash
curl -X POST "https://api.terminal49.com/v2/tracking_requests" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "tracking_request",
      "attributes": {
        "request_type": "bill_of_lading",
        "request_number": "MSCU987654321",
        "scac": "MSCU"
      }
    }
  }'
```

#### Success Response

```json
{
  "data": {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "type": "tracking_request",
    "attributes": {
      "request_number": "MSCU1234567",
      "request_type": "container",
      "scac": "MSCU",
      "ref_numbers": ["PO-2024-001", "INV-2024-456"],
      "shipment_tags": ["electronics", "high-value"],
      "created_at": "2025-07-16T10:30:00Z",
      "updated_at": "2025-07-16T10:30:00Z",
      "status": "pending",
      "failed_reason": null,
      "is_retrying": false,
      "retry_count": 0
    },
    "relationships": {
      "tracked_object": {
        "data": null
      },
      "customer": {
        "data": null
      },
      "user": {
        "data": {
          "id": "current-user",
          "type": "user"
        }
      }
    },
    "links": {
      "self": "/v2/tracking_requests/3fa85f64-5717-4562-b3fc-2c963f66afa6"
    }
  }
}
```

### Get Single Tracking Request

```http
GET /v2/tracking_requests/:id
```

Retrieve details of a specific tracking request.

#### Example Request

```bash
curl -X GET "https://api.terminal49.com/v2/tracking_requests/3fa85f64-5717-4562-b3fc-2c963f66afa6" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json"
```

### Update Tracking Request

```http
PATCH /v2/tracking_requests/:id
```

Update reference numbers or tags on an existing tracking request.

#### Request Body

```json
{
  "data": {
    "type": "tracking_request",
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "attributes": {
      "ref_numbers": ["NEW-REF-001"],
      "shipment_tags": ["updated-tag"]
    }
  }
}
```

### Delete Tracking Request

```http
DELETE /v2/tracking_requests/:id
```

Cancel a tracking request. This will stop tracking but won't delete historical data.

## Error Handling

### Common Error Responses

#### 422 Unprocessable Entity

```json
{
  "errors": [
    {
      "status": "422",
      "source": {
        "pointer": "/data/attributes/request_number"
      },
      "title": "Unprocessable Entity",
      "detail": "Request number can't be blank",
      "code": "blank"
    },
    {
      "status": "422",
      "source": {
        "pointer": "/data/attributes/request_type"
      },
      "title": "Unprocessable Entity",
      "detail": "Request type 'invalid_type' not recognized. Accepted request types are 'bill_of_lading', 'booking_number', and 'container'",
      "code": "invalid_request_type"
    }
  ]
}
```

### Failure Reasons

When a tracking request fails, the `failed_reason` field will contain one of:

| Reason | Description | Action |
|--------|-------------|--------|
| `shipping_line_not_supported` | The SCAC code is not supported | Check supported lines at `/shipping_lines` |
| `invalid_container` | Container number format is invalid | Verify ISO 6346 format |
| `not_found` | Number not found at shipping line | Verify the number and SCAC |
| `rate_limited` | Too many requests to shipping line | Wait for automatic retry |
| `shipping_line_error` | Temporary issue with shipping line | Wait for automatic retry |
| `booking_not_shipped` | Booking exists but not yet shipped | Check again later |

## Best Practices

### 1. Batch Processing

Instead of creating many requests rapidly, batch your submissions:

```javascript
// Good: Space out requests
for (const container of containers) {
  await createTrackingRequest(container);
  await sleep(100); // 100ms delay
}

// Better: Use webhooks for status updates
const requests = await Promise.all(
  containers.map(c => createTrackingRequest(c))
);
// Set up webhook to receive updates
```

### 2. Handle Duplicates

Terminal49 automatically deduplicates tracking requests:

- Same `request_number` + `scac` = returns existing tracking
- Useful for idempotent operations

### 3. Use Reference Numbers

Always include reference numbers for easier tracking:

```json
{
  "ref_numbers": ["PO-12345", "Customer: Acme Corp", "SKU-789"]
}
```

### 4. Monitor Status Changes

```python
# Poll for status changes
def wait_for_tracking(request_id, timeout=300):
    start_time = time.time()
    while time.time() - start_time < timeout:
        response = get_tracking_request(request_id)
        status = response['data']['attributes']['status']
        
        if status == 'succeeded':
            return response['data']['relationships']['tracked_object']
        elif status == 'failed':
            raise TrackingError(response['data']['attributes']['failed_reason'])
        
        time.sleep(5)  # Poll every 5 seconds
    
    raise TimeoutError("Tracking request timed out")
```

### 5. Error Recovery

```javascript
async function createTrackingWithRetry(params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await createTrackingRequest(params);
      return response;
    } catch (error) {
      if (error.status === 422 && error.code === 'invalid_container') {
        // Don't retry validation errors
        throw error;
      }
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}
```

## Code Examples

### Python

```python
import requests
import time

class Terminal49Tracker:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://api.terminal49.com/v2"
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/vnd.api+json"
        }
    
    def track_container(self, container_number, scac, ref_numbers=None, tags=None):
        """Create a tracking request for a container"""
        payload = {
            "data": {
                "type": "tracking_request",
                "attributes": {
                    "request_type": "container",
                    "request_number": container_number,
                    "scac": scac
                }
            }
        }
        
        if ref_numbers:
            payload["data"]["attributes"]["ref_numbers"] = ref_numbers
        if tags:
            payload["data"]["attributes"]["shipment_tags"] = tags
        
        response = requests.post(
            f"{self.base_url}/tracking_requests",
            json=payload,
            headers=self.headers
        )
        
        if response.status_code == 201:
            return response.json()
        else:
            response.raise_for_status()
    
    def get_tracking_status(self, request_id):
        """Check the status of a tracking request"""
        response = requests.get(
            f"{self.base_url}/tracking_requests/{request_id}",
            headers=self.headers
        )
        return response.json()
    
    def wait_for_completion(self, request_id, timeout=300):
        """Wait for a tracking request to complete"""
        start = time.time()
        
        while time.time() - start < timeout:
            data = self.get_tracking_status(request_id)
            status = data["data"]["attributes"]["status"]
            
            if status == "succeeded":
                tracked_object = data["data"]["relationships"]["tracked_object"]["data"]
                return {
                    "success": True,
                    "tracked_object": tracked_object
                }
            elif status == "failed":
                return {
                    "success": False,
                    "reason": data["data"]["attributes"]["failed_reason"]
                }
            
            time.sleep(5)
        
        return {"success": False, "reason": "timeout"}

# Usage
tracker = Terminal49Tracker("YOUR_API_KEY")

# Track a container
result = tracker.track_container(
    "MSCU1234567",
    "MSCU",
    ref_numbers=["PO-12345"],
    tags=["urgent"]
)

request_id = result["data"]["id"]

# Wait for tracking to complete
completion = tracker.wait_for_completion(request_id)
if completion["success"]:
    print(f"Tracking successful: {completion['tracked_object']}")
else:
    print(f"Tracking failed: {completion['reason']}")
```

### Node.js

```javascript
const axios = require('axios');

class Terminal49Client {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.terminal49.com/v2';
    this.headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/vnd.api+json'
    };
  }

  async createTrackingRequest(type, number, scac, options = {}) {
    const payload = {
      data: {
        type: 'tracking_request',
        attributes: {
          request_type: type,
          request_number: number,
          scac: scac,
          ...options
        }
      }
    };

    try {
      const response = await axios.post(
        `${this.baseURL}/tracking_requests`,
        payload,
        { headers: this.headers }
      );
      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(JSON.stringify(error.response.data.errors));
      }
      throw error;
    }
  }

  async getTrackingRequests(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.status) params.append('filter[status]', filters.status);
    if (filters.pageSize) params.append('page[size]', filters.pageSize);
    
    const response = await axios.get(
      `${this.baseURL}/tracking_requests?${params}`,
      { headers: this.headers }
    );
    
    return response.data;
  }

  async trackContainerBatch(containers) {
    const results = [];
    
    for (const { number, scac, refs, tags } of containers) {
      try {
        const result = await this.createTrackingRequest(
          'container',
          number,
          scac,
          { ref_numbers: refs, shipment_tags: tags }
        );
        results.push({ number, success: true, data: result });
      } catch (error) {
        results.push({ number, success: false, error: error.message });
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
  }
}

// Usage
const client = new Terminal49Client('YOUR_API_KEY');

// Track single container
client.createTrackingRequest(
  'container',
  'MSCU1234567',
  'MSCU',
  { ref_numbers: ['PO-12345'] }
).then(result => {
  console.log('Tracking initiated:', result.data.id);
}).catch(error => {
  console.error('Tracking failed:', error);
});

// Track multiple containers
const containers = [
  { number: 'MSCU1234567', scac: 'MSCU', refs: ['PO-001'] },
  { number: 'COSU6789012', scac: 'COSU', refs: ['PO-002'] }
];

client.trackContainerBatch(containers).then(results => {
  console.log('Batch results:', results);
});
```

## Related Endpoints

- `GET /v2/shipments` - View created shipments from tracking requests
- `GET /v2/containers` - View containers created from tracking requests
- `GET /v2/shipping_lines` - Check supported shipping lines and SCAC codes
- `POST /v2/webhooks` - Set up notifications for tracking status changes

## FAQ

**Q: How long does tracking take to complete?**
A: Most tracking requests complete within 30 seconds to 2 minutes. Complex bookings with multiple containers may take longer.

**Q: Can I track the same container multiple times?**
A: Yes, duplicate requests return the existing tracking data without creating duplicates.

**Q: What happens to failed tracking requests?**
A: Terminal49 automatically retries failed requests for temporary errors. Permanent failures (like invalid numbers) are not retried.

**Q: How do I track multiple containers in one shipment?**
A: Track by booking number or bill of lading to capture all associated containers at once.

**Q: Can I update a tracking request after creation?**
A: You can update ref_numbers and tags, but not the tracking number or type.