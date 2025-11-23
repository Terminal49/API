# Terminal49 MCP Server - Tools & Resources Overview

## Summary

The Terminal49 MCP Server now provides **7 specialized tools** and **2 MCP resources** for comprehensive container tracking and shipment management.

### Design Philosophy

1. **LLM-Controlled**: Tools let the LLM request exactly the data it needs
2. **Progressive Loading**: Start with fast queries, load more data as needed
3. **Lifecycle-Aware**: Responses adapt to container/shipment state
4. **Steering Hints**: Metadata guides LLM on how to format responses

---

## Tools

### 1. `search_container`
**Purpose**: Find containers and shipments by container number, booking, or BL

**Usage**:
```typescript
search_container({ query: "CAIU1234567" })
search_container({ query: "MAEU123456789" })  // Booking
```

**Returns**: List of matching containers and shipments

**When to Use**: User provides a container number or booking number to look up

---

### 2. `track_container`
**Purpose**: Create a tracking request for a new container

**Usage**:
```typescript
track_container({
  containerNumber: "CAIU1234567",
  scac: "MAEU"
})
```

**Returns**: Tracking request details

**When to Use**: User wants to start tracking a container not yet in the system

---

### 3. `get_container` ⭐ **ENHANCED**
**Purpose**: Get comprehensive container information with flexible data loading

**Usage**:
```typescript
// Default (fast, covers 80% of cases)
get_container({ id: "uuid" })

// With transport events (for journey analysis)
get_container({
  id: "uuid",
  include: ["shipment", "transport_events"]
})

// Minimal (fastest)
get_container({
  id: "uuid",
  include: ["shipment"]
})
```

**Returns**:
- Core container data (status, equipment, location)
- Demurrage info (LFD, holds, fees)
- Rail tracking (if applicable)
- Shipment context
- Terminal details
- **Lifecycle-aware metadata** with presentation guidance

**Response Metadata** (NEW):
```json
{
  "_metadata": {
    "container_state": "at_terminal",
    "includes_loaded": ["shipment", "pod_terminal"],
    "can_answer": ["availability status", "demurrage/LFD", ...],
    "needs_more_data_for": ["journey timeline → include: ['transport_events']"],
    "relevant_for_current_state": [
      "location.available_for_pickup - Ready to pick up?",
      "demurrage.pickup_lfd - Last Free Day",
      ...
    ],
    "presentation_guidance": "Lead with availability status. Mention LFD date and days remaining (5).",
    "suggestions": {
      "message": "Container available for pickup. LFD is in 5 days."
    }
  }
}
```

**When to Use**: Any container status/detail question

---

### 4. `get_shipment_details` ⭐ **NEW**
**Purpose**: Get shipment-level information (vs container-specific)

**Usage**:
```typescript
get_shipment_details({
  id: "shipment-uuid",
  include_containers: true  // default
})
```

**Returns**:
- Bill of Lading number
- Shipping line details
- Complete routing (POL → POD → Destination)
- Vessel information
- ETA/ATA for all legs
- Container list (if included)
- **Shipment status** with presentation guidance

**When to Use**:
- User asks about a shipment (not specific container)
- Need routing information
- Want to see all containers on a BL

---

### 5. `get_container_transport_events` ⭐ **NEW**
**Purpose**: Get detailed event timeline for a container

**Usage**:
```typescript
get_container_transport_events({ id: "container-uuid" })
```

**Returns**:
- Complete chronological timeline
- Event categorization (vessel/rail/terminal/truck)
- Key milestones extracted
- Location context for each event
- Presentation guidance

**Example Response**:
```json
{
  "total_events": 47,
  "event_categories": {
    "vessel_events": 8,
    "rail_events": 12,
    "terminal_events": 18,
    ...
  },
  "timeline": [
    {
      "event": "container.transport.vessel_loaded",
      "timestamp": "2024-06-08T10:30:00Z",
      "location": { "name": "Shanghai", "code": "CNSHA" }
    },
    ...
  ],
  "milestones": {
    "vessel_loaded_at": "2024-06-08T10:30:00Z",
    "vessel_departed_at": "2024-06-09T14:00:00Z",
    "vessel_arrived_at": "2024-06-22T08:30:00Z",
    "discharged_at": "2024-06-23T11:15:00Z"
  }
}
```

**When to Use**:
- User asks "what happened?" or "show me the journey"
- Need detailed timeline
- Analyzing delays or milestones
- More efficient than `get_container` with events when you only need event data

---

### 6. `get_supported_shipping_lines` ⭐ **NEW**
**Purpose**: List supported carriers with SCAC codes

**Usage**:
```typescript
// All carriers
get_supported_shipping_lines()

// Search for specific carrier
get_supported_shipping_lines({ search: "maersk" })
get_supported_shipping_lines({ search: "MSCU" })
```

**Returns**:
- SCAC code
- Full carrier name
- Common abbreviation
- Region

**When to Use**:
- User asks "what carriers do you support?"
- Validating a carrier name
- Looking up SCAC code

---

### 7. `get_container_route` ⭐ **NEW**
**Purpose**: Get detailed routing with vessel itinerary

**Usage**:
```typescript
get_container_route({ id: "container-uuid" })
```

**Returns**:
- Complete multi-leg journey
- Each port with inbound/outbound vessels
- ETD/ETA/ATD/ATA for each leg
- Transshipment details

**Important**: This is a **PAID FEATURE** in Terminal49. If not enabled:
```json
{
  "error": "FeatureNotEnabled",
  "message": "Route tracking is a paid feature...",
  "alternative": "Use get_container_transport_events for historical movement"
}
```

**When to Use**:
- User asks about routing or transshipments
- Need vessel itinerary
- Detailed multi-leg journey analysis

---

## MCP Resources

### 1. `terminal49://container/{id}`
**Purpose**: Access container data as a resource

**Usage**: LLM can read this resource for container information

**When to Use**: Alternative to tools for resource-based workflows

---

### 2. `terminal49://docs/milestone-glossary` ⭐ **NEW**
**Purpose**: Comprehensive event/milestone reference documentation

**Content**:
- All event types with meanings
- Journey phases (Origin → Transit → Destination)
- Common event sequences
- Troubleshooting guide
- LLM presentation guidelines

**When to Use**:
- LLM needs to explain what an event means
- User asks "what does vessel_discharged mean?"
- Presenting complex journey timelines
- Understanding event sequences

**Example Usage by LLM**:
1. User: "What does rail_loaded mean?"
2. LLM reads `terminal49://docs/milestone-glossary`
3. LLM responds: "rail_loaded means the container has been loaded onto a rail car at the port. This typically happens 1-2 days after discharge and indicates the start of the inland journey by rail."

---

## Tool Selection Guide

### User asks: "Where is container CAIU1234567?"
→ Use `get_container` with default includes
→ Check `container_state` and present location

### User asks: "Show me the journey of CAIU1234567"
→ Use `get_container` first (fast)
→ Check metadata → `needs_more_data_for` suggests transport_events
→ Use `get_container_transport_events` for detailed timeline

### User asks: "Tell me about shipment MAEU123456789"
→ Use `search_container` to find shipment
→ Use `get_shipment_details` with shipment ID

### User asks: "Is it available for pickup? Any holds?"
→ Use `get_container` with default includes (has demurrage data)
→ Metadata will guide presentation (urgent if holds exist)

### User asks: "What carriers do you track?"
→ Use `get_supported_shipping_lines`

### User asks: "How did it get from Shanghai to Chicago?"
→ Option A: Use `get_container_route` (paid feature, shows routing)
→ Option B: Use `get_container_transport_events` (shows actual movement)

---

## Lifecycle State Handling

The `get_container` tool automatically detects container state and provides guidance:

| State | Relevant Data | Presentation Focus |
|-------|---------------|-------------------|
| **in_transit** | ETA, vessel, route | When arriving, where going |
| **arrived** | Arrival time, discharge status | When will discharge |
| **at_terminal** | Availability, LFD, holds, location | Can I pick up? Any issues? |
| **on_rail** | Rail carrier, destination ETA | Where going, when arriving |
| **delivered** | Delivery time, full journey | Summary of complete trip |

---

## Progressive Loading Pattern

**Example: Complex Question Requiring Multiple Data Points**

User: "Tell me everything about container CAIU1234567"

**Step 1**: Fast initial query
```typescript
get_container({ id: "abc-123" })
// Returns basic info + metadata
```

**Step 2**: LLM reads metadata
```json
{
  "container_state": "delivered",
  "suggestions": {
    "recommended_follow_up": "transport_events"
  }
}
```

**Step 3**: Follow-up for complete data
```typescript
get_container_transport_events({ id: "abc-123" })
// Returns 87 events with full timeline
```

**Step 4**: LLM uses milestone glossary
```typescript
// LLM reads terminal49://docs/milestone-glossary
// To explain event meanings
```

**Result**: Comprehensive response with journey timeline, delivery details, and context

---

## Error Handling

### FeatureNotEnabled (403)
- `get_container_route` may return this if routing feature not enabled
- Response includes alternative suggestions

### ValidationError
- Usually from `track_container` with missing SCAC or invalid container number
- Error message explains what's missing

### NotFoundError (404)
- Container/shipment ID doesn't exist
- User should use `search_container` first

---

## Performance Considerations

### Fast Queries (< 500ms typical)
- `get_container` with default includes
- `get_shipment_details` without containers
- `get_supported_shipping_lines`

### Moderate Queries (500ms - 2s)
- `get_container` with transport_events
- `get_container_transport_events`
- `search_container`

### Slower Queries (1-3s)
- `get_container_route` (if enabled)
- `get_shipment_details` with many containers

**Best Practice**: Start with fast queries, progressively load more data only when needed

---

## Example Workflows

### Workflow 1: Quick Status Check
```
1. User: "Status of CAIU1234567?"
2. LLM: get_container(id)
3. Response includes state="at_terminal", presentation_guidance
4. LLM: "Container is at WBCT Terminal, available for pickup. LFD is in 5 days."
```

### Workflow 2: Demurrage Management
```
1. User: "Which containers are past LFD?"
2. LLM: (would need list_containers tool - not yet implemented)
3. For each: get_container(id)
4. Filter where pickup_lfd < now
5. Present with urgency (days overdue, estimated charges)
```

### Workflow 3: Journey Analysis
```
1. User: "How long did the rail portion take?"
2. LLM: get_container_transport_events(id)
3. Extract rail_loaded_at and rail_unloaded_at from milestones
4. Calculate duration
5. LLM: "Rail transit took 8 days (June 24 - July 2)"
```

### Workflow 4: Carrier Validation
```
1. User: "Do you support CMA CGM?"
2. LLM: get_supported_shipping_lines({ search: "CMA" })
3. LLM: "Yes, CMA CGM is supported (SCAC: CMDU)"
```

---

## Future Enhancements

Potential additional tools:
- `list_containers` - List containers with filters
- `get_container_raw_events` - Raw EDI data
- `get_terminal_info` - Terminal operating hours, fees
- `get_carrier_tracking_page` - Direct link to carrier website

---

## Summary

With these 7 tools and 2 resources, the LLM can:

✅ Find any container or shipment
✅ Get fast status updates
✅ Load detailed journey data progressively
✅ Understand and explain events
✅ Adapt responses to lifecycle state
✅ Provide urgency-aware presentations
✅ Validate carriers and routing
✅ Answer complex multi-part questions efficiently

The system is designed for **intelligent, context-aware responses** that help logistics professionals make time-sensitive decisions.
