# Container Lifecycle Guidance System

This document explains how the MCP server provides lifecycle-aware guidance to help LLMs format responses appropriately based on container state.

## How It Works

The `get_container` tool now returns enhanced `_metadata` that steers the LLM's presentation based on:
1. **Container lifecycle state** (in_transit → delivered)
2. **Urgent situations** (holds, overdue LFD)
3. **Relevant fields** for the current state
4. **Presentation guidance** specific to the situation

## Response Structure

```typescript
{
  // ... core container data ...

  _metadata: {
    container_state: "at_terminal",
    includes_loaded: ["shipment", "pod_terminal"],

    // What questions this data can answer
    can_answer: [
      "container status",
      "availability status",
      "demurrage/LFD",
      "holds and fees"
    ],

    // What requires more data
    needs_more_data_for: [
      "journey timeline → include: ['transport_events']"
    ],

    // 🎯 NEW: Which fields matter RIGHT NOW
    relevant_for_current_state: [
      "location.available_for_pickup - Ready to pick up?",
      "demurrage.pickup_lfd - Last Free Day (avoid demurrage)",
      "demurrage.holds_at_pod_terminal - Blocks pickup if present",
      "location.current_location - Where in terminal yard"
    ],

    // 🎯 NEW: How to format the response
    presentation_guidance: "Lead with availability status. Mention LFD date and days remaining (5). Include location if user picking up.",

    // Context-specific suggestions
    suggestions: {
      message: "Container available for pickup. LFD is in 5 days."
    }
  }
}
```

## Lifecycle States & Milestones

### State 1: in_transit
**Container is traveling by vessel**

**Relevant Fields:**
- `shipment.pod_eta_at` - Expected arrival
- `shipment.pod_vessel_name` - Current vessel
- `shipment.port_of_discharge_name` - Destination

**Presentation Guidance:**
> "Focus on ETA and vessel information. User wants to know WHEN it will arrive and WHERE it is now."

**Example LLM Response:**
```
Container CAIU1234567 is currently in transit on vessel EVER FORWARD (IMO: 9850551).
Expected arrival at Los Angeles: June 22, 2024.
Departed Shanghai on June 9th.
```

---

### State 2: arrived
**Vessel docked, container not yet discharged**

**Relevant Fields:**
- `location.pod_arrived_at` - When vessel docked
- `location.pod_discharged_at` - Still null
- `pod_terminal.name` - Which terminal

**Presentation Guidance:**
> "Explain vessel arrived but container not yet discharged. User wants to know WHEN discharge will happen."

**Example LLM Response:**
```
Container CAIU1234567 is on the vessel EVER FORWARD which arrived at WBCT Terminal
on June 22nd. Container has not yet been discharged from the vessel - discharge is typically
1-3 days after vessel arrival.
```

---

### State 3: at_terminal (NO holds, LFD in 5 days)
**Container discharged, available for pickup**

**Relevant Fields:**
- `location.available_for_pickup` - Can pick up?
- `demurrage.pickup_lfd` - Last Free Day
- `location.current_location` - Yard location

**Presentation Guidance:**
> "Lead with availability status. Mention LFD date and days remaining (5). Include location if user picking up."

**Example LLM Response:**
```
Container CAIU1234567 is available for pickup at WBCT Terminal.
- Location: Row 5, Block A
- Last Free Day: January 25th (5 days remaining)
- No holds or restrictions

You can schedule a pickup appointment through the terminal.
```

---

### State 4: at_terminal (WITH customs hold) 🚨
**Container blocked by hold**

**Relevant Fields:**
- `demurrage.holds_at_pod_terminal` - CRITICAL
- `location.available_for_pickup` - Will be false
- `demurrage.pickup_lfd` - Still counts down!

**Presentation Guidance:**
> "URGENT: Lead with holds (customs) - they BLOCK pickup. Explain what each hold means and how to clear. Then mention LFD and location."

**Example LLM Response:**
```
⚠️  Container CAIU1234567 is NOT available for pickup due to a CUSTOMS HOLD.

Hold Details:
- Customs exam required before release
- Contact your customs broker to schedule the exam
- Typical clearance: 1-3 business days

Important: Last Free Day is January 25th (5 days away). Demurrage will accrue even
while under hold, so clear this ASAP.

Location: WBCT Terminal, Row 5, Block A
```

---

### State 5: at_terminal (2 days PAST LFD) 🚨🚨
**Container incurring demurrage**

**Relevant Fields:**
- `demurrage.pickup_lfd` - Already passed
- Days overdue (calculated)

**Presentation Guidance:**
> "URGENT: Container is 2 days past LFD. Demurrage is accruing daily (~$75-150/day typical). Emphasize urgency of pickup."

**Example LLM Response:**
```
🚨 URGENT: Container CAIU1234567 is 2 DAYS PAST the Last Free Day!

- LFD was: January 20th
- Demurrage accruing: ~$75-150/day (approx $150-300 so far)
- Available for immediate pickup: YES
- Location: WBCT Terminal, Row 5, Block A

ACTION NEEDED: Schedule pickup immediately to stop further charges.
```

---

### State 6: on_rail
**Container moved inland by rail**

**Relevant Fields:**
- `rail.pod_rail_carrier` - Rail carrier
- `rail.destination_eta` - Inland arrival
- `rail.pod_rail_departed_at` - When left port
- `shipment.destination_name` - Inland city

**Presentation Guidance:**
> "Explain rail journey: Departed [port] on [date] via [carrier], heading to [city]. ETA: [date]. Emphasize destination and timing."

**Suggestion (if no events loaded):**
```json
{
  "recommended_follow_up": "transport_events",
  "message": "Container is on rail transport. User may ask about rail carrier, destination ETA, or inland movement."
}
```

**Example LLM Response:**
```
Container CAIU1234567 departed Los Angeles port on January 10th via rail.

Rail Journey:
- Carrier: Union Pacific (UPRR)
- Destination: Chicago rail yard
- Expected Arrival: January 18th
- Current Status: In transit

The container will be available for pickup at the Chicago rail yard once unloaded.
```

---

### State 7: delivered
**Container picked up by customer**

**Relevant Fields:**
- `location.pod_full_out_at` - Pickup timestamp
- Complete journey summary helpful

**Presentation Guidance:**
> "Confirm delivery completed with date/time. Optionally summarize full journey from origin to delivery."

**Example LLM Response:**
```
Container CAIU1234567 was successfully delivered.

Delivery Details:
- Picked up: January 15th, 2:30 PM
- From: WBCT Terminal, Los Angeles

Journey Summary:
- Departed Shanghai: June 9th
- Arrived Los Angeles: June 22nd
- Discharged: June 23rd
- Delivered: January 15th
- Total transit time: 38 days port-to-port
```

---

## Hold Types Reference

The `presentation_guidance` explains holds contextually. Common hold types:

| Hold Type | What It Means | How to Clear |
|-----------|---------------|--------------|
| `customs` | Customs exam required | Contact customs broker, schedule exam |
| `freight` | Freight charges unpaid | Pay shipping line invoice |
| `tmf` | Terminal maintenance fee | Pay terminal fee |
| `usda` | USDA inspection required | Schedule USDA inspection |
| `documentation` | Missing/incorrect docs | Submit correct documentation |

## Progressive Loading Example

**User Question:** "Tell me everything about container CAIU1234567"

**Step 1: Initial Call**
```typescript
get_container({ id: "abc-123" })
// Uses default: ['shipment', 'pod_terminal']
```

**Response metadata:**
```json
{
  "container_state": "delivered",
  "needs_more_data_for": [
    "journey timeline → include: ['transport_events']"
  ],
  "presentation_guidance": "Confirm delivery completed with date/time. Optionally summarize full journey from origin to delivery.",
  "suggestions": {
    "recommended_follow_up": "transport_events",
    "message": "Container has been delivered. User may ask about delivery details or empty return."
  }
}
```

**LLM Decision:** User said "everything", state is "delivered", guidance suggests full journey summary. Need transport_events.

**Step 2: Follow-up Call**
```typescript
get_container({
  id: "abc-123",
  include: ['shipment', 'transport_events']
})
```

**Response includes:**
```json
{
  "events": {
    "count": 87,
    "rail_events_count": 12,
    "latest_event": {
      "event": "container.full_out",
      "timestamp": "2024-01-15T14:30:00Z",
      "location": "Los Angeles"
    }
  }
}
```

**LLM Response:**
```
Container CAIU1234567 completed its journey:

Timeline:
- Empty out (Shanghai): June 5
- Loaded on vessel: June 8
- Departed Shanghai: June 9
- Arrived Los Angeles: June 22
- Discharged from vessel: June 23
- Rail loaded (UPRR): June 24
- Rail departed: June 24
- Rail arrived Chicago: July 2
- Available for pickup: July 2
- Picked up: January 15 (customer held at terminal)

Total journey: Shanghai → LA (13 days ocean) → Chicago (8 days rail) → Delivered
```

## Benefits of This Approach

✅ **State-aware formatting**: LLM presents info relevant to current lifecycle stage
✅ **Urgency detection**: Automatically emphasizes holds, overdue LFD
✅ **Field prioritization**: LLM knows which fields matter now vs later
✅ **Progressive refinement**: Can start simple, load more data if needed
✅ **Consistent presentation**: Guidance ensures professional, clear responses
✅ **Educational**: Explains holds, LFD, demurrage in context

## Future Enhancements

If needed, we can add:
1. **MCP Resource** - Static reference doc at `terminal49://docs/lifecycle`
2. **MCP Prompts** - Templates for state-specific formatting
3. **Milestone glossary** - Explain what each transport event means
4. **Cost estimates** - More precise demurrage/storage calculations
