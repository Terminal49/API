/**
 * Milestone Glossary MCP Resource
 * Provides comprehensive reference for Terminal49 container events and milestones
 */

export const milestoneGlossaryResource = {
  uri: 'terminal49://docs/milestone-glossary',
  name: 'Container Milestone & Event Glossary',
  description:
    'Comprehensive guide to container transport events and milestones tracked by Terminal49. ' +
    'Explains what each event type means in the container journey.',
  mimeType: 'text/markdown',
};

export function getMilestoneGlossaryContent(): string {
  return `# Container Milestone & Event Glossary

## Event Categories

Container events are organized by journey phase and transport mode. Each event represents a specific milestone in the container's journey.

---

## Tracking Request Events

These events relate to the initial tracking request:

| Event | Meaning | User Impact |
|-------|---------|-------------|
| \`tracking_request.succeeded\` | Shipment created and linked successfully | Container is now being tracked |
| \`tracking_request.failed\` | Tracking request failed | Container not found or invalid data |
| \`tracking_request.awaiting_manifest\` | Waiting for manifest from carrier | Data will arrive when manifest is available |
| \`tracking_request.tracking_stopped\` | Terminal49 stopped tracking | No further updates will be received |

---

## Container Lifecycle Events

### Container Status Changes

| Event | Meaning | When It Happens |
|-------|---------|-----------------|
| \`container.created\` | Container added to shipment | When new container appears on booking/BL |
| \`container.updated\` | Container attributes changed | Any time container data updates |
| \`container.pod_terminal_changed\` | POD terminal assignment changed | Terminal switch or correction |
| \`container.pickup_lfd.changed\` | Last Free Day changed | LFD updated by terminal/line |
| \`container.transport.available\` | Container available for pickup | Ready to be picked up at destination |

**Usage Notes:**
- \`container.updated\` fires frequently - check \`changeset\` for what actually changed
- \`pickup_lfd.changed\` is CRITICAL - LFD affects demurrage charges

---

## Journey Phase 1: Origin (Port of Lading)

Events at the origin port before vessel departure:

| Event | Meaning | Journey Stage |
|-------|---------|---------------|
| \`container.transport.empty_out\` | Empty released to shipper | 1. Empty pickup |
| \`container.transport.full_in\` | Loaded container returned to port | 2. Return to port |
| \`container.transport.vessel_loaded\` | Container loaded onto vessel | 3. On vessel |
| \`container.transport.vessel_departed\` | Vessel left origin port | 4. Journey starts |

**Typical Sequence:**
1. Empty out → Shipper loads cargo → Full in → Vessel loaded → Vessel departed

---

## Journey Phase 2: Transshipment (If Applicable)

Events when container transfers between vessels:

| Event | Meaning | Transshipment Stage |
|-------|---------|---------------------|
| \`container.transport.transshipment_arrived\` | Arrived at transshipment port | 1. Arrival |
| \`container.transport.transshipment_discharged\` | Unloaded from first vessel | 2. Discharge |
| \`container.transport.transshipment_loaded\` | Loaded onto next vessel | 3. Reload |
| \`container.transport.transshipment_departed\` | Left transshipment port | 4. Continue journey |

**Important:**
- Not all shipments have transshipment
- Can have multiple transshipment ports
- Each transshipment adds 1-3 days to journey

---

## Journey Phase 3: Feeder Vessel/Barge (Regional)

For shorter moves from main port to regional port:

| Event | Meaning | Use Case |
|-------|---------|----------|
| \`container.transport.feeder_arrived\` | Arrived on feeder vessel | Regional hub arrival |
| \`container.transport.feeder_discharged\` | Unloaded from feeder | At regional port |
| \`container.transport.feeder_loaded\` | Loaded onto feeder | Leaving main port |
| \`container.transport.feeder_departed\` | Feeder departed | En route to region |

**Common Scenario:**
Main port (Singapore) → Feeder vessel → Regional port (Jakarta)

---

## Journey Phase 4: Destination (Port of Discharge)

Final ocean port arrival and discharge:

| Event | Meaning | POD Stage |
|-------|---------|-----------|
| \`container.transport.vessel_arrived\` | Vessel docked at POD | 1. Vessel at port |
| \`container.transport.vessel_berthed\` | Vessel moored at berth | 1a. Secured |
| \`container.transport.vessel_discharged\` | Container unloaded | 2. Off vessel, at terminal |
| \`container.transport.full_out\` | Container picked up | 3. Delivered (if no inland) |
| \`container.transport.empty_in\` | Empty returned | 4. Journey complete |

**Key Distinction:**
- \`vessel_arrived\` = Vessel at port (container still on vessel)
- \`vessel_discharged\` = Container at terminal (off vessel)
- \`full_out\` = Customer picked up container

**Typical Timeline:**
- Arrival → Discharge: 0-2 days
- Discharge → Available: 0-1 days
- Available → Pickup: Variable (customer dependent)

---

## Journey Phase 5: Inland Movement (Rail)

For containers moving inland by rail:

| Event | Meaning | Rail Stage |
|-------|---------|------------|
| \`container.transport.rail_loaded\` | Loaded onto rail car | 1. On rail |
| \`container.transport.rail_departed\` | Rail left POD | 2. In transit |
| \`container.transport.rail_arrived\` | Rail arrived at inland destination | 3. Arrived |
| \`container.transport.rail_unloaded\` | Unloaded from rail | 4. At ramp |

**Usage:**
- Common for Port of LA/Long Beach → Chicago, Dallas, etc.
- Adds 3-7 days to journey depending on distance
- Check \`pod_rail_carrier_scac\` and \`ind_rail_carrier_scac\` for carriers

---

## Journey Phase 6: Inland Destination

Final destination for inland moves:

| Event | Meaning | When It Happens |
|-------|---------|-----------------|
| \`container.transport.arrived_at_inland_destination\` | Container at final destination | After rail unload |
| \`container.transport.estimated.arrived_at_inland_destination\` | ETA to inland destination changed | ETA update |

**Note:**
- \`full_out\` at inland location indicates final delivery
- \`empty_in\` at depot indicates empty return

---

## Estimate Events

ETA changes during the journey:

| Event | Meaning | Triggered When |
|-------|---------|----------------|
| \`shipment.estimated.arrival\` | ETA changed for POD | Delay or early arrival |
| \`container.transport.estimated.arrived_at_inland_destination\` | Inland ETA changed | Rail ETA update |

**Best Practice:**
- Monitor ETA changes for customer communication
- Significant delays (>2 days) should trigger proactive notification

---

## Common Event Sequences

### Standard Direct Ocean Move (No Rail)
\`\`\`
empty_out → full_in → vessel_loaded → vessel_departed →
vessel_arrived → vessel_discharged → available →
full_out → empty_in
\`\`\`

### Ocean + Transshipment + Delivery
\`\`\`
vessel_departed (origin) → transshipment_arrived →
transshipment_discharged → transshipment_loaded →
transshipment_departed → vessel_arrived (POD) →
vessel_discharged → full_out
\`\`\`

### Ocean + Rail (Inland Move)
\`\`\`
vessel_arrived (LA) → vessel_discharged → rail_loaded →
rail_departed → rail_arrived (Chicago) → rail_unloaded →
arrived_at_inland_destination → full_out
\`\`\`

---

## Event Interpretation Guidelines

### For LLM Responses:

**When user asks "What happened?":**
1. Present events chronologically
2. Group by journey phase (Origin → Ocean → Destination)
3. Explain what each event means in plain language
4. Highlight current status

**When user asks "Where is it?":**
1. Find the LATEST transport event
2. Use that to determine current location
3. Check next milestone for "when will it..."

**When user asks about delays:**
1. Compare \`estimated.arrival\` events
2. Calculate delay from original ETA vs current ETA
3. Explain impact (extra days in transit)

**Event Priority (most important):**
1. \`available\` - Ready for pickup (ACTION NEEDED)
2. \`pickup_lfd.changed\` - Deadline changed (TIME SENSITIVE)
3. \`vessel_discharged\` - Now at terminal (STATUS CHANGE)
4. \`vessel_departed\` - Journey started (MILESTONE)
5. \`estimated.arrival\` - ETA changed (PLANNING)

---

## Troubleshooting Events

### No \`vessel_discharged\` after \`vessel_arrived\`:
- Normal delay: 0-48 hours
- Check \`pod_discharged_at\` attribute directly
- May indicate data gap from terminal

### \`available\` event but \`available_for_pickup\` is false:
- Check \`holds_at_pod_terminal\` - likely has holds
- Common holds: customs, freight, documentation
- Container cannot be picked up until holds clear

### Multiple \`vessel_departed\` events:
- Indicates transshipment
- Each represents departure from a different port
- Count transshipments to estimate journey time

### \`rail_loaded\` but no \`vessel_discharged\`:
- Data can arrive out of order
- Terminal may report rail before discharge event
- Both events should exist eventually

---

## Related Attributes

Events often correspond to container attributes:

| Event | Sets Attribute |
|-------|----------------|
| \`vessel_departed\` | \`pol_atd_at\` |
| \`vessel_arrived\` | \`pod_arrived_at\`, \`pod_ata_at\` |
| \`vessel_discharged\` | \`pod_discharged_at\` |
| \`rail_loaded\` | \`pod_rail_loaded_at\` |
| \`rail_departed\` | \`pod_rail_departed_at\` |
| \`rail_arrived\` | \`ind_ata_at\` |
| \`full_out\` (POD) | \`pod_full_out_at\` |
| \`full_out\` (inland) | \`final_destination_full_out_at\` |
| \`empty_in\` | \`empty_terminated_at\` |

**Note:** Attributes provide snapshot, events provide timeline.

---

## Best Practices for LLM

1. **Always** explain events in user-friendly language, not just event names
2. **Group** related events (e.g., all rail events together)
3. **Calculate** time between milestones (e.g., "3 days in transit")
4. **Highlight** actionable events (available, LFD changes, delays)
5. **Provide context** (e.g., "Transshipment adds 1-3 days typically")

## Reference

Event naming convention: \`{object}.{category}.{action}\`
- Object: container, shipment, tracking_request
- Category: transport, estimated, pickup_lfd, etc.
- Action: arrived, departed, changed, etc.

For complete API details, see: https://terminal49.com/docs/api-docs/in-depth-guides/webhooks
`;
}

export function matchesMilestoneGlossaryUri(uri: string): boolean {
  return uri === 'terminal49://docs/milestone-glossary';
}

export function readMilestoneGlossaryResource(): any {
  return {
    uri: milestoneGlossaryResource.uri,
    mimeType: milestoneGlossaryResource.mimeType,
    text: getMilestoneGlossaryContent(),
  };
}
