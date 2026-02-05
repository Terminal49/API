# Terminal49 SDK Improvement Opportunities

This document tracks SDK improvement opportunities identified while building the SDK Showcase application. These observations can inform future SDK development.

---

## Missing SDK Methods

### Webhooks Resource
**Current State:** No SDK methods for webhook management.

**Needed Methods:**
```typescript
// Create a webhook subscription
client.webhooks.create({
  url: 'https://example.com/webhook',
  events: ['shipment.updated', 'container.updated'],
  secret: 'webhook_secret'
})

// List webhook subscriptions
client.webhooks.list()

// Get a specific webhook
client.webhooks.get(webhookId)

// Update a webhook
client.webhooks.update(webhookId, { enabled: false })

// Delete a webhook
client.webhooks.delete(webhookId)

// Test a webhook (trigger test event)
client.webhooks.test(webhookId)
```

**Use Case:** Developers building integrations need programmatic webhook management for CI/CD pipelines, multi-tenant setups, and self-service onboarding.

---

### Parties Resource
**Current State:** No SDK methods for parties (consignees, shippers, notify parties).

**Needed Methods:**
```typescript
// List parties associated with a shipment
client.parties.list({ shipmentId: 'ship_123' })

// Get party details
client.parties.get(partyId)
```

**Use Case:** Visibility platforms need to display consignee/shipper information and build relationship graphs.

---

### Vessels Resource
**Current State:** No vessel lookup methods.

**Needed Methods:**
```typescript
// Search vessels by name or IMO
client.vessels.search('EVER GIVEN')
client.vessels.get(vesselId)
client.vessels.getByIMO('9811000')

// Get vessel current position/schedule (if available)
client.vessels.position(vesselId)
```

**Use Case:** Logistics operators want to track vessel schedules and understand delays.

---

### Terminals Resource
**Current State:** No terminal lookup methods.

**Needed Methods:**
```typescript
// Search terminals
client.terminals.search({ port: 'USLAX' })
client.terminals.get(terminalId)

// Get terminal operating hours, contacts (if available)
client.terminals.details(terminalId)
```

**Use Case:** Freight forwarders need terminal information for pickup coordination.

---

### Ports Resource
**Current State:** No port lookup methods.

**Needed Methods:**
```typescript
// Search ports by name or UN/LOCODE
client.ports.search('Los Angeles')
client.ports.getByLocode('USLAX')
```

**Use Case:** Build port selection dropdowns and validate port codes.

---

## Type Improvements

### Explicit Enum Types for Status Values

**Current State:** Status values are typed as `string`.

**Improvement:** Define explicit union types:

```typescript
// Container status
type ContainerStatus =
  | 'new'
  | 'on_ship'
  | 'available'
  | 'not_available'
  | 'grounded'
  | 'awaiting_inland_transfer'
  | 'on_rail'
  | 'picked_up'
  | 'off_dock'
  | 'delivered'
  | 'empty_returned';

// Tracking request status
type TrackingRequestStatus =
  | 'pending'
  | 'tracking'
  | 'not_found'
  | 'duplicate'
  | 'expired';

// Shipment status
type ShipmentStatus =
  | 'created'
  | 'in_transit'
  | 'arrived'
  | 'delivered'
  | 'tracking_stopped';
```

**Benefit:** Better TypeScript autocomplete, compile-time validation, and documentation.

---

### Transport Event Type Enums

**Current State:** Event types are typed as `string`.

**Improvement:**
```typescript
type TransportEventType =
  | 'vessel_loaded'
  | 'vessel_departed'
  | 'vessel_arrived'
  | 'vessel_discharged'
  | 'gate_in'
  | 'gate_out'
  | 'empty_returned'
  | 'rail_loaded'
  | 'rail_departed'
  | 'rail_arrived'
  | 'rail_unloaded'
  // ... etc.
```

---

### Typed Filter Parameters

**Current State:** Filter parameters are loosely typed or use `Record<string, unknown>`.

**Improvement:**
```typescript
interface ContainerFilters {
  status?: ContainerStatus | ContainerStatus[];
  port_of_discharge_locode?: string;
  shipping_line_scac?: string;
  updated_after?: string; // ISO date
  pickup_lfd_before?: string; // ISO date
}

// Usage with type safety
client.containers.list({ status: 'available', port_of_discharge_locode: 'USLAX' })
```

---

### Include Parameter Types

**Current State:** Include values are strings without validation.

**Improvement:**
```typescript
// Define valid includes per resource
type ContainerIncludes = 'shipment' | 'pod_terminal' | 'transport_events';
type ShipmentIncludes = 'containers' | 'tracking_request' | 'shipping_line';

// Type-safe usage
client.containers.get(id, ['shipment', 'pod_terminal'] satisfies ContainerIncludes[])
```

---

## Documentation Gaps

### Response Format Options

**Gap:** Limited documentation on `format` option variations.

**Needed Documentation:**
- When to use `raw` vs `mapped` vs `both`
- Memory/performance implications
- Example outputs for each format
- How `raw` preserves JSON:API structure

**Example to add:**
```typescript
// Raw format - preserves JSON:API structure
const raw = await client.containers.get(id, [], { format: 'raw' });
// Returns: { data: { id, type, attributes, relationships }, included: [...] }

// Mapped format - plain JavaScript objects
const mapped = await client.containers.get(id, [], { format: 'mapped' });
// Returns: { id, number, status, shipment: { id, ... } }

// Both format - returns both versions
const both = await client.containers.get(id, [], { format: 'both' });
// Returns: { raw: {...}, mapped: {...} }
```

---

### Pagination Best Practices

**Gap:** No documentation on iterating through all pages.

**Needed Documentation:**
```typescript
// Recommended pattern for paginating through all results
async function* getAllShipments(client: Terminal49Client) {
  let page = 1;
  const pageSize = 100;

  while (true) {
    const result = await client.shipments.list({}, { page, pageSize, format: 'mapped' });
    const shipments = Array.isArray(result) ? result : result?.data || [];

    if (shipments.length === 0) break;

    for (const shipment of shipments) {
      yield shipment;
    }

    if (shipments.length < pageSize) break;
    page++;
  }
}

// Usage
for await (const shipment of getAllShipments(client)) {
  console.log(shipment.id);
}
```

---

### Valid Include Values Per Resource

**Gap:** No documentation listing valid `include` values for each resource.

**Needed Documentation:**

| Resource | Valid Includes |
|----------|----------------|
| `containers.get()` | `shipment`, `pod_terminal`, `transport_events` |
| `containers.list()` | `shipment` |
| `shipments.get()` | `containers`, `tracking_request`, `shipping_line`, `port_of_lading`, `port_of_discharge` |
| `shipments.list()` | `containers`, `shipping_line` |
| `trackingRequests.get()` | `shipment`, `shipping_line` |
| `trackingRequests.list()` | `shipping_line` |

---

### Error Handling Scenarios

**Gap:** Limited documentation on error types and handling strategies.

**Needed Documentation:**
```typescript
import { Terminal49Client, Terminal49Error } from '@terminal49/sdk';

try {
  const container = await client.containers.get('invalid_id');
} catch (error) {
  if (error instanceof Terminal49Error) {
    switch (error.status) {
      case 401:
        // Invalid or expired API token
        console.error('Authentication failed:', error.message);
        break;
      case 404:
        // Resource not found
        console.error('Container not found');
        break;
      case 422:
        // Validation error (e.g., invalid filter value)
        console.error('Validation error:', error.details);
        break;
      case 429:
        // Rate limited
        const retryAfter = error.headers?.['retry-after'];
        console.error(`Rate limited. Retry after ${retryAfter}s`);
        break;
      default:
        console.error('API error:', error.message);
    }
  } else {
    // Network error or other issue
    console.error('Request failed:', error);
  }
}
```

---

## API Improvement Suggestions

### Bulk Operations

**Current State:** No bulk create/update operations.

**Suggestion:**
```typescript
// Create multiple tracking requests at once
client.trackingRequests.createBulk([
  { request_number: 'MSCU1234567', request_type: 'container_number', scac: 'MSCU' },
  { request_number: 'KOCU9876543', request_type: 'container_number', scac: 'ONEY' },
  // ... up to 100 items
])
```

**Use Case:** Onboarding scenarios where customers need to track many containers at once.

---

### Streaming/SSE for Real-time Updates

**Current State:** Polling is the only way to get updates.

**Suggestion:** Server-Sent Events endpoint for real-time container updates:
```typescript
const eventSource = client.containers.subscribe(['container_123', 'container_456']);

eventSource.on('status_change', (event) => {
  console.log(`${event.containerId} changed to ${event.newStatus}`);
});

eventSource.on('eta_update', (event) => {
  console.log(`${event.containerId} ETA updated to ${event.newEta}`);
});
```

---

## SDK Implementation Notes

### Response Format Normalization

The SDK handles both snake_case (API) and camelCase (JavaScript convention) property names. When using `format: 'mapped'`, properties are available in both formats for compatibility:

```typescript
// Both work:
container.shipping_line  // snake_case (matches API)
container.shippingLine   // camelCase (JavaScript convention)
```

**Recommendation:** Document this behavior explicitly and consider standardizing on camelCase for the mapped format.

---

### Client Instance Management

**Current Pattern in Showcase:**
```typescript
// lib/terminal49/client.ts
let clientInstance: Terminal49Client | null = null;

export function getClient(): Terminal49Client {
  if (!clientInstance) {
    clientInstance = new Terminal49Client({
      apiToken: process.env.T49_API_TOKEN!,
    });
  }
  return clientInstance;
}
```

**Consideration:** Document recommended patterns for:
- Server-side singleton (Next.js API routes, Server Components)
- Client-side usage (if supported)
- Multi-tenant scenarios (token per request)

---

## Priority Ranking

Based on developer experience impact:

1. **High Priority**
   - Explicit enum types for status values
   - Typed filter parameters
   - Error handling documentation

2. **Medium Priority**
   - Webhook CRUD methods
   - Pagination documentation
   - Include values documentation

3. **Lower Priority**
   - Vessels/Terminals/Ports lookup methods
   - Bulk operations
   - Real-time streaming

---

## Testing Coverage

Methods tested in this showcase app:

| Method | Page | Status |
|--------|------|--------|
| `client.shipments.list()` | Dashboard, Shipments | ✅ |
| `client.shipments.get()` | Shipment Detail | ✅ |
| `client.shipments.update()` | Shipment Detail | ✅ |
| `client.shipments.stopTracking()` | Shipment Detail | ✅ |
| `client.shipments.resumeTracking()` | Shipment Detail | ✅ |
| `client.containers.list()` | Dashboard, Containers | ✅ |
| `client.containers.get()` | Container Detail | ✅ |
| `client.containers.refresh()` | Container Detail | ✅ |
| `client.containers.events()` | Container Events | ✅ |
| `client.containers.rawEvents()` | Container Events | ✅ |
| `client.containers.route()` | Container Route | ✅ |
| `client.trackingRequests.list()` | Dashboard, Tracking Requests | ✅ |
| `client.trackingRequests.get()` | Tracking Request Detail | ✅ |
| `client.trackingRequests.create()` | Create Tracking | ✅ |
| `client.trackingRequests.inferNumber()` | Create Tracking | ✅ |
| `client.trackingRequests.createFromInfer()` | Create Tracking | ✅ |
| `client.shippingLines.list()` | Shipping Lines | ✅ |
| `client.search()` | Search | ✅ |
| `client.getDemurrage()` | Container Demurrage | ✅ |
| `client.getRailMilestones()` | Container Demurrage | ✅ |

---

*Last updated: Generated during SDK Showcase development*
