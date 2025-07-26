# Container API Documentation

## Overview

The Container resource represents individual shipping containers being tracked through Terminal49. Containers contain detailed information about their journey, current location, availability status, and associated events.

## Key Concepts

### Container Lifecycle

A container goes through several stages during its journey:

1. **In Transit** - Container is on a vessel heading to the port of discharge
2. **Arrived** - Vessel has arrived at the port (`pod_arrived_at`)
3. **Discharged** - Container unloaded from vessel (`pod_discharged_at`)
4. **Available** - Released by customs and terminal, ready for pickup
5. **Full Out** - Container picked up from terminal (`pod_full_out_at`)
6. **Empty Return** - Empty container returned (`empty_terminated_at`)

### Important Timestamps

All timestamps use ISO 8601 format and are provided in UTC unless a timezone field indicates otherwise.

**Port of Discharge (POD) Events:**
- `pod_arrived_at` - When the vessel arrived at the discharge port
- `pod_discharged_at` - When the container was unloaded from the vessel
- `pod_full_out_at` - When the container left the terminal (picked up)

**Inland Delivery Events:**
- `ind_eta_at` - Estimated arrival at inland destination
- `ind_ata_at` - Actual arrival at inland destination
- `final_destination_full_out_at` - Pickup from final destination

**Rail Events:**
- `pod_rail_loaded_at` - Loaded onto rail at port
- `pod_rail_departed_at` - Rail departure from port
- `ind_rail_unloaded_at` - Unloaded from rail at inland point

### Availability Status

The `available_for_pickup` field indicates whether a container can be picked up from the terminal. This depends on:

1. **Holds** - Customs, freight, or other holds must be released
2. **Fees** - All terminal fees must be paid
3. **Documentation** - Required documents must be submitted

## Fields Documentation

### Basic Information

**`number`** (string)
- The container number in ISO 6346 format (e.g., "MSCU1234567")
- 4 letter prefix (owner code + equipment category) + 7 digits

**`seal_number`** (string, nullable)
- The seal number affixed to the container
- Used for security and customs verification

**`equipment_type`** (string)
- Type of container equipment
- Values: `"dry"`, `"reefer"`, `"open_top"`, `"flat_rack"`, `"tank"`, etc.

**`equipment_length`** (integer)
- Container length in feet
- Common values: `20`, `40`, `45`

**`equipment_height`** (string)
- Container height specification
- Values: `"standard"` (8'6"), `"high_cube"` (9'6")

**`weight_in_lbs`** (number)
- Cargo weight in pounds
- May be `0` if not provided by shipping line

### Location and Status

**`location_at_pod_terminal`** (string, nullable)
- Current location within the terminal
- Format varies by terminal (e.g., "YARD K376E (Grounded)", "V-OMG081W")
- `null` if container has left the terminal

**`available_for_pickup`** (boolean)
- Whether the container can be picked up
- `true` only when all holds are released and fees paid

**`availability_known`** (boolean)
- Whether the availability status has been determined
- `false` during initial tracking before terminal data is available

### Holds and Fees

**`holds_at_pod_terminal`** (array)
- Active holds preventing pickup
- Each hold contains:
  - `status` - Always "hold" for active holds
  - `name` - Type of hold: `"customs"`, `"freight"`, `"other"`
  - `description` - Additional details about the hold

Example:
```json
"holds_at_pod_terminal": [
  {
    "status": "hold",
    "name": "freight",
    "description": ""
  },
  {
    "status": "hold", 
    "name": "customs",
    "description": ""
  }
]
```

**`fees_at_pod_terminal`** (array)
- Outstanding fees at the terminal
- Each fee contains amount and description
- Empty array `[]` means no outstanding fees

### Important Dates

**`pickup_lfd`** (string, nullable)
- Last Free Day - last day to pick up without demurrage charges
- Format: ISO 8601 date-time
- Critical for avoiding storage fees

**`pickup_appointment_at`** (string, nullable)
- Scheduled pickup appointment time
- Must be set for some terminals before pickup

**`ssl_lfd`** (string, nullable)
- Steamship Line Last Free Day
- May differ from terminal LFD

### Tracking Metadata

**`created_at`** (string)
- When the container was first tracked in Terminal49

**`terminal_checked_at`** (string)
- Last time terminal status was verified

**`pod_last_tracking_request_at`** (string)
- Last attempt to get terminal updates

**`shipment_last_tracking_request_at`** (string)
- Last attempt to update from shipping line

### Rail Information

For containers moving inland by rail:

**`pod_rail_carrier_scac`** (string, nullable)
- Rail carrier at port (e.g., "BNSF", "UP")

**`ind_rail_carrier_scac`** (string, nullable)
- Rail carrier for inland delivery

**`ind_facility_holds`** (array, nullable)
- Holds at inland facility

**`ind_facility_fees`** (array, nullable)
- Fees at inland facility

**`ind_facility_lfd_on`** (string, nullable)
- Last free day at inland facility

## Relationships

**`shipment`**
- The parent shipment containing this container
- Containers are grouped into shipments by bill of lading

**`pod_terminal`**
- The terminal where the container was discharged
- Contains terminal contact and location information

**`pickup_facility`**
- The inland facility for final delivery (if applicable)

**`transport_events`**
- Array of events tracking the container's journey
- Includes vessel departures, arrivals, rail moves, gate events

**`raw_events`**
- Original events from shipping line
- Useful for debugging or additional details

## Working with Transport Events

Transport events provide a detailed timeline of the container's journey. When including transport events:

```
GET /containers?include=transport_events
```

Each event contains:
- Event type and description
- Location (terminal, port, or geographic coordinates)
- Timestamp
- Vessel/voyage information (for sea moves)
- Mode of transport

## Common Use Cases

### 1. Check Container Availability

```javascript
if (container.attributes.available_for_pickup && 
    container.attributes.holds_at_pod_terminal.length === 0) {
  // Container is ready for pickup
}
```

### 2. Monitor Demurrage Risk

```javascript
const lfd = new Date(container.attributes.pickup_lfd);
const today = new Date();
const daysUntilLFD = Math.floor((lfd - today) / (1000 * 60 * 60 * 24));

if (daysUntilLFD <= 2) {
  // Urgent: Approaching last free day
}
```

### 3. Track Container Location

```javascript
// Check if still at terminal
if (container.attributes.pod_full_out_at === null) {
  console.log(`Container at: ${container.attributes.location_at_pod_terminal}`);
} else {
  console.log('Container has left the terminal');
}
```

## Best Practices

1. **Monitor holds regularly** - Check `holds_at_pod_terminal` to ensure timely release
2. **Track LFD** - Set up alerts for approaching last free days
3. **Include events** - Use `include=transport_events` for full visibility
4. **Check availability** - Don't rely solely on `available_for_pickup`; also check holds
5. **Handle timezones** - Use provided timezone fields for local time calculations