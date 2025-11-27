# Terminal49 MCP Server - How It Works

## Overview

The Terminal49 MCP Server provides two ways to access container information:

1. **`track_container`** - For users with container numbers (e.g., `CAIU2885402`)
2. **`get_container`** - For users with Terminal49 UUIDs (internal use)

## User Journey: Container Number → Container Details

### The Problem

Users typically have **container numbers** (like `CAIU2885402`), but Terminal49's API requires **UUIDs** to fetch container details. The MCP server bridges this gap.

### The Solution: `track_container` Tool

The `track_container` tool handles the entire flow automatically:

```
Container Number (CAIU2885402)
         ↓
    track_container tool
         ↓
   1. Create tracking request (POST /tracking_requests)
         ↓
   2. Extract container UUID from response
         ↓
   3. Fetch full container details (GET /containers/:uuid)
         ↓
    Return complete container data
```

## How the MCP Flow Works

### Step 1: User Asks Claude

**User:** "Get container information for CAIU2885402"

### Step 2: Claude Calls MCP Tool

Claude Code automatically selects the `track_container` tool and calls it:

```json
{
  "tool": "mcp__terminal49__track_container",
  "arguments": {
    "containerNumber": "CAIU2885402"
  }
}
```

### Step 3: MCP Server Creates Tracking Request

The MCP server calls Terminal49 API:

```http
POST https://api.terminal49.com/v2/tracking_requests
Authorization: Token YOUR_API_KEY
Content-Type: application/vnd.api+json

{
  "data": {
    "type": "tracking_request",
    "attributes": {
      "request_type": "container",
      "request_number": "CAIU2885402"
    }
  }
}
```

### Step 4: Extract Container UUID

Terminal49 API responds with:

```json
{
  "data": {
    "type": "tracking_request",
    "id": "...",
    "relationships": {
      "containers": {
        "data": [{
          "id": "123e4567-e89b-12d3-a456-426614174000",
          "type": "container"
        }]
      }
    }
  },
  "included": [{
    "type": "container",
    "id": "123e4567-e89b-12d3-a456-426614174000",
    ...
  }]
}
```

The MCP server extracts: `123e4567-e89b-12d3-a456-426614174000`

### Step 5: Fetch Full Container Details

Now with the UUID, fetch complete details:

```http
GET https://api.terminal49.com/v2/containers/123e4567-e89b-12d3-a456-426614174000?include=shipment,pod_terminal,transport_events
Authorization: Token YOUR_API_KEY
```

### Step 6: Return to Claude

The MCP server returns formatted container data:

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "container_number": "CAIU2885402",
  "status": "available_for_pickup",
  "equipment": {
    "type": "40HC",
    "length": "40",
    "height": "high_cube",
    "weight_lbs": 45000
  },
  "location": {
    "current_location": "APM Terminals",
    "available_for_pickup": true,
    "pod_arrived_at": "2025-10-15T08:30:00Z",
    "pod_discharged_at": "2025-10-16T14:20:00Z"
  },
  "demurrage": {
    "pickup_lfd": "2025-10-22",
    "pickup_appointment_at": null,
    "fees_at_pod_terminal": [],
    "holds_at_pod_terminal": []
  },
  "shipment": {
    "id": "shipment-uuid",
    "ref_numbers": ["REF123", "PO456"],
    "line": "Maersk"
  },
  "tracking_request_created": true
}
```

### Step 7: Claude Responds to User

Claude formats this into a natural language response:

> **Container CAIU2885402 Status:**
>
> - **Status:** Available for pickup
> - **Location:** APM Terminals
> - **Equipment:** 40HC (High Cube, 40ft)
> - **Arrived:** October 15, 2025
> - **Last Free Day:** October 22, 2025
> - **Shipping Line:** Maersk
> - **No holds or fees**

## Available MCP Tools

### 1. `search_container` ⭐ (Fastest - Recommended)

**Use when:** You want to quickly find any container, shipment, or booking

**Input:**
```json
{
  "query": "SLVU3015627"  // Container number, BL, booking, or ref number
}
```

**What it does:**
1. Searches Terminal49 database instantly
2. Returns all matching containers and shipments
3. No tracking request needed
4. Fastest method - direct search API

**Response:**
```json
{
  "containers": [
    {
      "id": "uuid",
      "container_number": "SLVU3015627",
      "status": "available_for_pickup",
      "shipping_line": "CMA CGM",
      "pod_terminal": "APM Terminals",
      "destination": "Los Angeles"
    }
  ],
  "shipments": [],
  "total_results": 1
}
```

### 2. `track_container` (For New Containers)

**Use when:** You have a container number

**Input:**
```json
{
  "containerNumber": "CAIU2885402",
  "scac": "MAEU"  // optional
}
```

**What it does:**
1. Creates tracking request
2. Extracts container UUID
3. Fetches full details
4. Returns everything in one call

### 3. `get_container` (Advanced/Internal)

**Use when:** You already have a Terminal49 UUID

**Input:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000"
}
```

**What it does:**
- Fetches container details directly

## MCP Resources

The server provides two resource endpoints:

**Container Resource:**
- **URI Pattern:** `terminal49://container/{id}`
- **Example:** `terminal49://container/123e4567-e89b-12d3-a456-426614174000`
- Returns container data in markdown format

**Milestone Glossary:**
- **URI:** `terminal49://docs/milestone-glossary`
- Comprehensive event/milestone reference documentation

## Error Handling

### Container Not Found

If the container doesn't exist in Terminal49's system:

```json
{
  "error": "NotFoundError",
  "message": "Container not found. It may not be tracked yet."
}
```

**Solution:** The container needs to be added to Terminal49 first via tracking request.

### Invalid Container Number

```json
{
  "error": "ValidationError",
  "message": "Invalid container number format"
}
```

### API Token Issues

```json
{
  "error": "AuthenticationError",
  "message": "Invalid or missing API token"
}
```

## Testing the Flow

### Test with Container Number

```bash
# Using Claude Code
claude mcp list

# Ask Claude:
# "Track container CAIU2885402"
```

### Test Manually

```bash
cd /Users/dodeja/dev/t49/API/packages/mcp

# Run test script
node test-mcp.js

# Test with specific container
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"track_container","arguments":{"containerNumber":"CAIU2885402"}},"id":1}' | npm run mcp:stdio
```

## Benefits of MCP Approach

1. **User-Friendly:** Users provide container numbers, not UUIDs
2. **Automatic:** MCP handles the lookup/tracking flow
3. **Cached:** Once tracked, container data is stored in Terminal49
4. **Rich Data:** Full container details including milestones, holds, fees
5. **Natural Language:** Claude presents data conversationally

## Architecture

```
┌──────────────┐
│     User     │
└──────┬───────┘
       │ "Get container CAIU2885402"
       ↓
┌──────────────┐
│    Claude    │
└──────┬───────┘
       │ MCP tool call
       ↓
┌──────────────────┐
│  MCP Server      │
│  (Local/Vercel)  │
└──────┬───────────┘
       │
       ├─→ POST /tracking_requests  (Create tracking)
       │   Terminal49 API
       │
       └─→ GET /containers/:id      (Fetch details)
           Terminal49 API
```

## Next Steps

1. **Add More Tools:**
   - `list_shipments` - List all shipments
   - `get_demurrage` - Check demurrage fees
   - `track_shipment` - Track by booking/BL number

2. **Enhanced Resources:**
   - `t49:shipment/{id}` - Shipment resources
   - `t49:terminal/{code}` - Terminal info

3. **Webhooks:**
   - Container status updates
   - Milestone notifications
