# Enhanced Documentation Example: Shipments Endpoint

## GET /v2/shipments

Retrieve a paginated list of shipments with optional filtering and relationship inclusion.

### Request

```http
GET https://api.terminal49.com/v2/shipments
Authorization: Bearer YOUR_API_KEY
Content-Type: application/vnd.api+json
Accept: application/vnd.api+json
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page[size]` | integer | 20 | Number of results per page (1-100) |
| `page[number]` | integer | 1 | Page number to retrieve |
| `include` | string | - | Comma-separated list of relationships to include |
| `filter[shipping_line_scac]` | string | - | Filter by shipping line SCAC code |
| `filter[customer_name]` | string | - | Filter by customer name |
| `filter[port_of_lading_locode]` | string | - | Filter by port of lading UN/LOCODE |
| `filter[port_of_discharge_locode]` | string | - | Filter by port of discharge UN/LOCODE |
| `filter[created_at_gte]` | ISO 8601 | - | Filter by creation date (greater than or equal) |
| `filter[created_at_lte]` | ISO 8601 | - | Filter by creation date (less than or equal) |
| `filter[tracking_status]` | string | - | Filter by tracking status |
| `filter[tags]` | string | - | Filter by tags (comma-separated) |

### Available Includes

- `containers` - Include all containers associated with the shipment
- `terminated_container_count` - Include count of terminated containers
- `port_of_lading` - Include port of lading details
- `port_of_discharge` - Include port of discharge details
- `destination` - Include final destination details

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier for the shipment |
| `type` | string | Always "shipment" |
| **attributes** | | |
| `created_at` | ISO 8601 | When the shipment was created in Terminal49 |
| `ref_numbers` | array | Reference numbers associated with the shipment |
| `tags` | array | User-defined tags for organization |
| `bill_of_lading_number` | string | Full bill of lading number |
| `normalized_number` | string | Normalized B/L number (without carrier prefix) |
| `shipping_line_scac` | string | Standard Carrier Alpha Code |
| `shipping_line_name` | string | Full name of the shipping line |
| `shipping_line_short_name` | string | Abbreviated shipping line name |
| `customer_name` | string | Name of the customer/consignee |
| `port_of_lading_locode` | string | UN/LOCODE of loading port |
| `port_of_lading_name` | string | Name of loading port |
| `port_of_discharge_locode` | string | UN/LOCODE of discharge port |
| `port_of_discharge_name` | string | Name of discharge port |
| `pod_vessel_name` | string | Vessel name at port of discharge |
| `pod_vessel_imo` | string | IMO number of the vessel |
| `pod_voyage_number` | string | Voyage number at discharge |
| `destination_locode` | string\|null | Final destination UN/LOCODE |
| `destination_name` | string\|null | Final destination name |
| `destination_timezone` | string\|null | Timezone of final destination |
| `destination_ata_at` | ISO 8601\|null | Actual arrival at destination |
| `destination_eta_at` | ISO 8601\|null | Estimated arrival at destination |
| `pol_etd_at` | ISO 8601\|null | Estimated departure from loading port |
| `pol_atd_at` | ISO 8601\|null | Actual departure from loading port |
| `pol_timezone` | string | Timezone of loading port |
| `pod_eta_at` | ISO 8601\|null | Current ETA at discharge port |
| `pod_original_eta_at` | ISO 8601\|null | Original ETA at discharge port |
| `pod_ata_at` | ISO 8601\|null | Actual arrival at discharge port |
| `pod_timezone` | string | Timezone of discharge port |
| `line_tracking_last_attempted_at` | ISO 8601 | Last tracking attempt timestamp |
| `line_tracking_last_succeeded_at` | ISO 8601 | Last successful tracking timestamp |
| `line_tracking_stopped_at` | ISO 8601\|null | When tracking was stopped |
| `line_tracking_stopped_reason` | string\|null | Reason tracking was stopped |

### Example Requests

#### Basic Request
```bash
curl -X GET "https://api.terminal49.com/v2/shipments?page[size]=5" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json"
```

#### With Includes and Filters
```bash
curl -X GET "https://api.terminal49.com/v2/shipments?page[size]=10&include=containers&filter[shipping_line_scac]=MSCU" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json"
```

#### Date Range Filter
```bash
curl -X GET "https://api.terminal49.com/v2/shipments?filter[created_at_gte]=2025-07-01T00:00:00Z&filter[created_at_lte]=2025-07-15T23:59:59Z" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json"
```

### Example Response

```json
{
  "data": [
    {
      "id": "6d87a211-7205-43c5-af27-bd15865d3b43",
      "type": "shipment",
      "attributes": {
        "created_at": "2025-07-15T21:05:13Z",
        "ref_numbers": [],
        "tags": [],
        "bill_of_lading_number": "CLAMCWPN4M093780",
        "normalized_number": "CWPN4M093780",
        "shipping_line_scac": "CLAM",
        "shipping_line_name": "Crowley",
        "shipping_line_short_name": "Crowley",
        "customer_name": "Sodor Steamworks",
        "port_of_lading_locode": "HNPCR",
        "port_of_lading_name": "Puerto Cortes",
        "port_of_discharge_locode": "USILM",
        "port_of_discharge_name": "Wilmington (NC)",
        "pod_vessel_name": "QUETZAL",
        "pod_vessel_imo": "9984247",
        "pod_voyage_number": "NZV5076",
        "destination_locode": null,
        "destination_name": null,
        "destination_timezone": null,
        "destination_ata_at": null,
        "destination_eta_at": null,
        "pol_etd_at": null,
        "pol_atd_at": null,
        "pol_timezone": "America/Tegucigalpa",
        "pod_eta_at": null,
        "pod_original_eta_at": null,
        "pod_ata_at": "2025-07-11T15:18:01Z",
        "pod_timezone": "America/New_York",
        "line_tracking_last_attempted_at": "2025-07-16T01:10:49Z",
        "line_tracking_last_succeeded_at": "2025-07-16T01:10:52Z",
        "line_tracking_stopped_at": null,
        "line_tracking_stopped_reason": null
      },
      "links": {
        "self": "/v2/shipments/6d87a211-7205-43c5-af27-bd15865d3b43"
      },
      "relationships": {
        "port_of_lading": {
          "data": {
            "id": "dd5eab5e-71ad-4a8e-92e2-9c216bf0978a",
            "type": "port"
          }
        },
        "port_of_discharge": {
          "data": {
            "id": "b939d367-970a-4e8c-925e-d991dabca8ac",
            "type": "port"
          }
        },
        "pod_terminal": {
          "data": {
            "id": "9d5e2433-5102-4e72-b7ff-01e38886a9d8",
            "type": "terminal"
          }
        },
        "destination": {
          "data": null
        },
        "destination_terminal": {
          "data": null
        },
        "line_tracking_stopped_by_user": {
          "data": null
        },
        "containers": {
          "data": [
            {
              "id": "df008eee-8145-4edf-b857-c5d1be8604ce",
              "type": "container"
            }
          ]
        }
      }
    }
  ],
  "meta": {
    "size": 1,
    "total": 133035
  },
  "links": {
    "self": "https://api.terminal49.com/v2/shipments?page%5Bsize%5D=1",
    "current": "https://api.terminal49.com/v2/shipments?page[number]=1&page[size]=1",
    "next": "https://api.terminal49.com/v2/shipments?page[number]=2&page[size]=1",
    "last": "https://api.terminal49.com/v2/shipments?page[number]=133035&page[size]=1"
  }
}
```

### Response with Includes

When using `include=containers`, the response includes container details:

```json
{
  "data": [
    {
      "id": "6d87a211-7205-43c5-af27-bd15865d3b43",
      "type": "shipment",
      "attributes": { /* ... shipment attributes ... */ },
      "relationships": {
        "containers": {
          "data": [
            {
              "id": "df008eee-8145-4edf-b857-c5d1be8604ce",
              "type": "container"
            }
          ]
        }
      }
    }
  ],
  "included": [
    {
      "id": "df008eee-8145-4edf-b857-c5d1be8604ce",
      "type": "container",
      "attributes": {
        "number": "MSCU1234567",
        "seal_number": "SEAL123",
        "created_at": "2025-07-15T21:05:13Z",
        "pod_arrived_at": "2025-07-11T15:18:01Z",
        "pod_discharged_at": "2025-07-12T08:30:00Z",
        "equipment_type": "dry",
        "equipment_length": 40,
        "equipment_height": "high_cube"
        /* ... more container attributes ... */
      }
    }
  ]
}
```

### Error Responses

#### 400 Bad Request
```json
{
  "errors": [
    {
      "status": "400",
      "source": {
        "parameter": "filter[invalid_field]"
      },
      "title": "Bad Request",
      "detail": "Invalid filter parameter: invalid_field"
    }
  ]
}
```

#### 401 Unauthorized
```json
{
  "errors": [
    {
      "status": "401",
      "title": "Unauthorized",
      "detail": "Invalid or missing API key"
    }
  ]
}
```

#### 429 Too Many Requests
```json
{
  "errors": [
    {
      "status": "429",
      "title": "Too Many Requests",
      "detail": "Rate limit exceeded. Please retry after 60 seconds."
    }
  ]
}
```

### Code Examples

#### Python
```python
import requests

headers = {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/vnd.api+json'
}

params = {
    'page[size]': 10,
    'include': 'containers',
    'filter[shipping_line_scac]': 'MSCU'
}

response = requests.get(
    'https://api.terminal49.com/v2/shipments',
    headers=headers,
    params=params
)

shipments = response.json()
```

#### JavaScript (Node.js)
```javascript
const axios = require('axios');

const headers = {
  'Authorization': 'Bearer YOUR_API_KEY',
  'Content-Type': 'application/vnd.api+json'
};

const params = {
  'page[size]': 10,
  'include': 'containers',
  'filter[shipping_line_scac]': 'MSCU'
};

axios.get('https://api.terminal49.com/v2/shipments', { headers, params })
  .then(response => {
    const shipments = response.data;
    console.log(shipments);
  })
  .catch(error => {
    console.error(error);
  });
```

### Common Use Cases

#### 1. Track All Active Shipments
```bash
curl -X GET "https://api.terminal49.com/v2/shipments?filter[tracking_status]=on_track&page[size]=100" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 2. Get Shipments for a Specific Customer
```bash
curl -X GET "https://api.terminal49.com/v2/shipments?filter[customer_name]=Acme%20Corp&include=containers" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

#### 3. Monitor Recent Arrivals
```bash
curl -X GET "https://api.terminal49.com/v2/shipments?filter[pod_ata_at_gte]=2025-07-10T00:00:00Z&include=containers,pod_terminal" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Performance Tips

1. **Use Pagination**: Always specify `page[size]` to control response size
2. **Selective Includes**: Only include relationships you need
3. **Efficient Filtering**: Use filters to reduce data transfer
4. **Caching**: Cache reference data (ports, terminals) locally
5. **Batch Processing**: Process shipments in batches using pagination

### Rate Limiting

- Rate limit: 1000 requests per hour
- Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Implement exponential backoff for 429 responses

### Related Endpoints

- `GET /v2/shipments/:id` - Get single shipment details
- `PATCH /v2/shipments/:id` - Update shipment
- `GET /v2/shipments/:id/containers` - Get shipment containers
- `POST /v2/tracking_requests` - Create tracking for shipment