# Terminal49 SDK Showcase Application Plan

## Overview

Build a comprehensive Next.js application that showcases all Terminal49 TypeScript SDK capabilities while serving as a developer reference and demonstrating business use cases for container tracking.

**Goals:**
1. Showcase all SDK methods with working examples
2. Provide developer reference with code snippets for each operation
3. Demonstrate real business workflows (tracking, monitoring, demurrage management)
4. Identify SDK improvement opportunities and documentation gaps

---

## Technology Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **UI Library:** Kumo (Cloudflare) - semantic tokens required
- **SDK:** `@terminal49/sdk`
- **State:** React Server Components + TanStack Query for client-side caching
- **Code Display:** Shiki (syntax highlighting)

---

## Application Structure

```
sdk-showcase/                         # Location: root of this repo
├── .env.local.example                # T49_API_TOKEN template
├── app/
│   ├── layout.tsx                    # Root layout with Kumo theme
│   ├── page.tsx                      # Dashboard
│   ├── tracking-requests/
│   │   ├── page.tsx                  # List tracking requests
│   │   ├── new/page.tsx              # Create (with infer flow)
│   │   └── [id]/page.tsx             # Detail view
│   ├── shipments/
│   │   ├── page.tsx                  # List shipments
│   │   └── [id]/page.tsx             # Detail (stop/resume tracking)
│   ├── containers/
│   │   ├── page.tsx                  # List containers
│   │   └── [id]/
│   │       ├── page.tsx              # Detail view
│   │       ├── events/page.tsx       # Transport events timeline
│   │       ├── route/page.tsx        # Route visualization
│   │       └── demurrage/page.tsx    # LFD, fees, holds
│   ├── shipping-lines/page.tsx       # Carrier browser
│   ├── search/page.tsx               # Global search
│   └── webhooks/page.tsx             # Webhook event simulator
├── components/
│   ├── layout/                       # Sidebar, PageHeader
│   ├── features/                     # Domain components
│   └── code-panel/                   # SDK code display
├── lib/
│   ├── terminal49/client.ts          # SDK client singleton
│   └── hooks/                        # Custom hooks
└── types/                            # TypeScript types
```

---

## SDK Method Coverage by Page

### Dashboard (`/`)
- `client.shipments.list()` - Summary counts
- `client.containers.list({ status: 'available' })` - Available containers
- `client.trackingRequests.list()` - Pending requests
- `client.trackContainer()` - Quick track action

### Tracking Requests

**List (`/tracking-requests`)**
- `client.trackingRequests.list(filters, { page, pageSize })`

**Create (`/tracking-requests/new`)**
- `client.trackingRequests.inferNumber(number)` - Auto-detect
- `client.trackingRequests.createFromInfer(number, options)` - Smart create
- `client.trackingRequests.create(params)` - Explicit create

**Detail (`/tracking-requests/[id]`)**
- `client.trackingRequests.get(id)`
- `client.trackingRequests.update(id, attrs)`

### Shipments

**List (`/shipments`)**
- `client.shipments.list({ status, port, carrier, updatedAfter })`

**Detail (`/shipments/[id]`)**
- `client.shipments.get(id, includeContainers)`
- `client.shipments.update(id, attrs)` - Edit ref numbers/tags
- `client.shipments.stopTracking(id)`
- `client.shipments.resumeTracking(id)`

### Containers

**List (`/containers`)**
- `client.containers.list({ status, port, carrier })`

**Detail (`/containers/[id]`)**
- `client.containers.get(id, ['shipment', 'pod_terminal'])`
- `client.containers.refresh(id)` - Manual refresh

**Events (`/containers/[id]/events`)**
- `client.containers.events(id)` - Transport events
- `client.containers.rawEvents(id)` - Raw unprocessed events

**Route (`/containers/[id]/route`)**
- `client.containers.route(id)` - Route with vessels/ports

**Demurrage (`/containers/[id]/demurrage`)**
- `client.getDemurrage(containerId)` - LFD, fees, holds
- `client.getRailMilestones(containerId)` - Rail tracking (North America)

### Shipping Lines (`/shipping-lines`)
- `client.shippingLines.list(search)` - Search carriers by name/SCAC

### Search (`/search`)
- `client.search(query)` - Global search

### Utilities (used across app)
- `client.deserialize<T>(document)` - JSON:API to plain objects

---

## Key Features by Page

### 1. Dashboard
- Summary cards: shipments, containers, tracking requests count
- Status distribution (on_ship, available, not_available, etc.)
- LFD alerts: containers within 3 days of Last Free Day
- Quick actions: New tracking, Search
- Recent activity feed

### 2. Create Tracking Request (Infer Flow)
Multi-step wizard demonstrating the intelligent tracking creation:

1. **Enter Number** - User inputs tracking number
2. **Auto-Detect** - Show `inferNumber` results: number type, carrier candidates
3. **Confirm/Select** - If `decision === 'needs_confirmation'`, show carrier dropdown
4. **Submit** - Call `createFromInfer` or `create`
5. **Result** - Show success/failure, link to shipment

### 3. Container Detail Tabs
- **Overview** - Number, equipment, status, terminal
- **Events Timeline** - Visual timeline with event icons
- **Route** - Map + legs table (origin → destination)
- **Demurrage** - LFD countdown, fees, holds, availability

### 4. Code Panel Component
Every page shows collapsible SDK code:
```tsx
<CodePanel
  title="SDK Code"
  code={`
const shipments = await client.shipments.list(
  { status: 'in_transit' },
  { page: 1, pageSize: 25, format: 'mapped' }
);
  `}
/>
```

### 5. Webhook Simulator
Mock webhook events without real webhook setup:
- Event type selector
- Example payload display
- Simulated event handling code

---

## Container Status Values (for badges)

| Status | Color | Description |
|--------|-------|-------------|
| `new` | gray | Tracking started, status unknown |
| `on_ship` | blue | In transit by vessel |
| `available` | green | Ready for pickup |
| `not_available` | yellow | At port but restricted |
| `grounded` | orange | Availability unknown |
| `awaiting_inland_transfer` | purple | Waiting for rail |
| `on_rail` | indigo | In transit by rail |
| `picked_up` | teal | Out for delivery |
| `off_dock` | cyan | At alternative facility |
| `delivered` | emerald | Delivery confirmed |
| `empty_returned` | gray | Container returned |

---

## Business Use Cases to Document

### 1. First-Time Container Tracking
**Persona:** Integration engineer
**Flow:** Enter number → Infer → Confirm carrier → Track → View shipment

### 2. Monitor Active Shipments
**Persona:** Logistics operator
**Flow:** Filter in-transit → Sort by ETA → View events → Check route

### 3. Demurrage Management
**Persona:** Freight forwarder
**Flow:** Dashboard LFD alerts → Container demurrage page → Check holds/fees

### 4. Tracking Lifecycle Management
**Persona:** BCO team lead
**Flow:** View shipment → Stop tracking → Later: Resume tracking

---

## SDK Improvement Opportunities

### Missing SDK Methods
| Resource | Gap |
|----------|-----|
| Webhooks | No CRUD for webhooks (create, list, update, delete) |
| Parties | No SDK methods for parties resource |
| Vessels | No vessel lookup methods |
| Terminals | No terminal lookup methods |
| Ports | No port lookup methods |

### Type Improvements
- Explicit enum types for `current_status` values
- Explicit enum types for transport event types
- Better generics for `format` option variations
- Typed filter parameters for each resource

### Documentation Gaps
- More examples of `raw` vs `mapped` vs `both` response formats
- Pagination best practices (iterating all pages)
- Valid `include` values for each resource
- Error handling scenarios

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Create Next.js 14 project at `sdk-showcase/` with TypeScript
- [ ] Install `@terminal49/sdk` (local path reference)
- [ ] Install and configure Kumo UI (`@cloudflare/kumo`)
- [ ] Set up SDK client singleton with env-based token
- [ ] Create layout (sidebar, header) with Kumo components
- [ ] Build Dashboard with summary metrics
- [ ] Configure Vercel deployment settings

### Phase 2: Core CRUD Pages
- [ ] Tracking Requests: list, create (with infer), detail
- [ ] Shipments: list, detail (with stop/resume)
- [ ] Containers: list, detail

### Phase 3: Advanced Features
- [ ] Container events timeline
- [ ] Container route visualization
- [ ] Demurrage page with rail milestones
- [ ] Global search

### Phase 4: Polish & Documentation
- [ ] Shipping lines browser
- [ ] Webhook simulator
- [ ] Code panel for all pages
- [ ] SDK improvement tracking notes

---

## Critical Files Reference

| File | Purpose |
|------|---------|
| `sdks/typescript-sdk/src/client.ts` | SDK implementation - all methods |
| `docs/sdk/methods.mdx` | Method signatures reference |
| `docs/api-docs/in-depth-guides/container-statuses.mdx` | Status values |
| `docs/api-docs/in-depth-guides/webhooks.mdx` | Webhook event types |
| `docs/api-docs/in-depth-guides/auto-detect-carrier.mdx` | Infer API flow |

---

## Verification Plan

1. **Build Check:** `pnpm build` succeeds without errors
2. **Type Check:** `pnpm tsc --noEmit` passes
3. **SDK Coverage:** Audit that all 24+ SDK methods are used somewhere
4. **Code Examples:** Ensure all code snippets are valid and runnable
5. **Business Flows:** Walk through each use case end-to-end with test token
6. **Vercel Preview:** Deploy preview and test all pages

---

## Configuration Decisions

- **Location:** Inside this repo at `sdk-showcase/`
- **Data Source:** Live Terminal49 API with test token (via `T49_API_TOKEN` env var)
- **Deployment:** Vercel with Next.js optimizations

---

## Visual Design

### Layout Structure

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Terminal49 SDK Showcase                                    [Search] [Theme] │
├────────────────┬─────────────────────────────────────────────────────────────┤
│                │                                                             │
│  SIDEBAR       │  PAGE CONTENT                                               │
│  ───────────   │  ─────────────────────────────────────────────────────────  │
│                │                                                             │
│  Dashboard     │  ┌─────────────────────────────────────────────────────┐   │
│                │  │  Page Header                           [Actions ▼]  │   │
│  TRACKING      │  │  Breadcrumbs > Current Page                         │   │
│  ├ Requests    │  └─────────────────────────────────────────────────────┘   │
│  └ + New       │                                                             │
│                │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  SHIPMENTS     │  │ Card 1   │ │ Card 2   │ │ Card 3   │ │ Card 4   │       │
│  └ All         │  │ Metric   │ │ Metric   │ │ Metric   │ │ Metric   │       │
│                │  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  CONTAINERS    │                                                             │
│  └ All         │  ┌─────────────────────────────────────────────────────┐   │
│                │  │  Main Content Area                                  │   │
│  REFERENCE     │  │  (Tables, Forms, Timelines, etc.)                   │   │
│  ├ Carriers    │  │                                                     │   │
│  └ Webhooks    │  │                                                     │   │
│                │  └─────────────────────────────────────────────────────┘   │
│                │                                                             │
│                │  ┌─────────────────────────────────────────────────────┐   │
│                │  │  ▼ SDK Code                                         │   │
│                │  │  ┌───────────────────────────────────────────────┐  │   │
│                │  │  │ const shipments = await client.shipments...   │  │   │
│                │  │  └───────────────────────────────────────────────┘  │   │
│                │  └─────────────────────────────────────────────────────┘   │
│                │                                                             │
└────────────────┴─────────────────────────────────────────────────────────────┘
```

### Dashboard Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Dashboard                                          [+ Track Container]     │
│  Overview of your tracked shipments and containers                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│  │  📦 142        │ │  🚢 89         │ │  ✅ 23         │ │  ⚠️ 5          │
│  │  Total         │ │  In Transit    │ │  Available     │ │  LFD < 3 days  │
│  │  Containers    │ │  Shipments     │ │  for Pickup    │ │  Urgent        │
│  └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘
│                                                                             │
│  ┌────────────────────────────────────┐ ┌──────────────────────────────────┐
│  │  Status Distribution               │ │  LFD Alerts                      │
│  │  ════════════════════════════════  │ │  ════════════════════════════════│
│  │  ████████████░░░░  on_ship (45)    │ │  MSCU1234567  LFD: Tomorrow      │
│  │  ████████░░░░░░░░  available (23)  │ │  KOCU9876543  LFD: 2 days        │
│  │  ███░░░░░░░░░░░░░  not_avail (8)   │ │  MSKU5555555  LFD: 3 days        │
│  │  ██░░░░░░░░░░░░░░  on_rail (5)     │ │  [View All →]                    │
│  └────────────────────────────────────┘ └──────────────────────────────────┘
│                                                                             │
│  ▼ SDK Code                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ // Fetch dashboard data                                                 │
│  │ const [shipments, containers] = await Promise.all([                     │
│  │   client.shipments.list({ status: 'in_transit' }, { format: 'mapped' }),│
│  │   client.containers.list({ status: 'available' }, { format: 'mapped' }) │
│  │ ]);                                                                     │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Tracking Request Creation (Infer Flow)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Create Tracking Request                                                    │
│  Track a container, booking, or bill of lading                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  Step 1          Step 2          Step 3          Step 4                 │
│  │  ●───────────────○───────────────○───────────────○                      │
│  │  Enter Number    Auto-Detect     Select Carrier  Confirm                │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │                                                                         │
│  │  Enter Tracking Number                                                  │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  │ MSCU1234567                                                     │   │
│  │  └─────────────────────────────────────────────────────────────────┘   │
│  │  Container number, booking number, or bill of lading                    │
│  │                                                                         │
│  │                                              [Detect & Continue →]      │
│  │                                                                         │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ▼ SDK Code                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ // Step 1: Infer the number type and carrier                           │
│  │ const inference = await client.trackingRequests.inferNumber('MSCU...');│
│  │                                                                         │
│  │ // Step 2: Create based on inference                                    │
│  │ const result = await client.trackingRequests.createFromInfer('MSCU...', │
│  │   { scac: inference.shipping_line.selected?.scac }                      │
│  │ );                                                                      │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Containers List Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Containers                                          [Filter ▼] [Refresh]   │
│  All tracked containers                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  Filters:  Status [All ▼]  Port [All ▼]  Carrier [All ▼]               │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  Number        │ Shipment    │ Status      │ LFD        │ Terminal     │
│  ├─────────────────────────────────────────────────────────────────────────┤
│  │  MSCU1234567   │ BOL-98765   │ ●available  │ Feb 10     │ APM LA       │
│  │  KOCU9876543   │ BOL-45678   │ ●on_ship    │ —          │ —            │
│  │  MSKU5555555   │ BOL-11111   │ ●not_avail  │ Feb 12     │ LBCT         │
│  │  OOLU3333333   │ BOL-22222   │ ●on_rail    │ Feb 15     │ BNSF Chicago │
│  │  CMAU7777777   │ BOL-33333   │ ●grounded   │ —          │ Pier 400     │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ◄ Previous  Page 1 of 6  Next ►                                           │
│                                                                             │
│  ▼ SDK Code                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ const containers = await client.containers.list(                        │
│  │   { status: 'available', port: 'USLAX' },                              │
│  │   { page: 1, pageSize: 25, format: 'mapped' }                          │
│  │ );                                                                      │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Container Detail with Tabs

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Containers                                                       │
│  Container MSCU1234567                               [Refresh] [View Raw]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  Equipment: 40' High Cube Dry    Status: ●available    Seal: ABC123    │
│  │  Shipment: BOL-98765             Terminal: APM Los Angeles              │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  [Overview]  [Events]  [Route]  [Demurrage]                             │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  EVENTS TIMELINE                                                            │
│  ───────────────────────────────────────────────────────────────────────── │
│  ●────●────●────●────●────○────○                                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  Feb 8, 2025 14:32 UTC                                                  │
│  │  ● vessel_discharged                              📍 Los Angeles, US   │
│  │    Container discharged from vessel at POD                              │
│  │    Source: terminal                                                     │
│  ├─────────────────────────────────────────────────────────────────────────┤
│  │  Feb 5, 2025 08:15 UTC                                                  │
│  │  ● vessel_arrived                                 📍 Los Angeles, US   │
│  │    Vessel arrived at port of discharge                                  │
│  │    Source: shipping_line                                                │
│  ├─────────────────────────────────────────────────────────────────────────┤
│  │  Jan 25, 2025 16:00 UTC                                                 │
│  │  ● vessel_departed                                📍 Shanghai, CN      │
│  │    Vessel departed from port of lading                                  │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ▼ SDK Code                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ const events = await client.containers.events(containerId, {            │
│  │   format: 'mapped'                                                      │
│  │ });                                                                     │
│  │ // Returns: Array of transport events with timestamps and locations     │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Shipment Detail with Stop/Resume

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← Back to Shipments                                                        │
│  Shipment BOL-98765432                      [Stop Tracking] [Edit] [Raw]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  Carrier: MAERSK (MAEU)          Bill of Lading: MAEUSEA12345678       │
│  │  Vessel: MUNICH MAERSK           Voyage: 501E                          │
│  │  Customer: Acme Imports Inc.     Tracking: ●Active                     │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ROUTE                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │                                                                         │
│  │   🏭 Shanghai, CN                              🏭 Los Angeles, US       │
│  │   Port of Lading                               Port of Discharge        │
│  │   ETD: Jan 25  ATD: Jan 25                     ETA: Feb 5  ATA: Feb 5   │
│  │                                                                         │
│  │                    ═══════════🚢═══════════►                            │
│  │                    MUNICH MAERSK / 501E                                 │
│  │                                                                         │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  CONTAINERS (3)                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  Number        │ Equipment        │ Status       │ LFD                  │
│  │  MSCU1234567   │ 40' HC Dry       │ ●available   │ Feb 10               │
│  │  MSCU1234568   │ 40' HC Dry       │ ●available   │ Feb 10               │
│  │  MSCU1234569   │ 40' HC Reefer    │ ●not_avail   │ Feb 12               │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ▼ SDK Code                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ // Get shipment with containers                                         │
│  │ const shipment = await client.shipments.get(id, true, {                 │
│  │   format: 'mapped'                                                      │
│  │ });                                                                     │
│  │                                                                         │
│  │ // Stop tracking                                                        │
│  │ await client.shipments.stopTracking(id);                                │
│  │                                                                         │
│  │ // Resume tracking                                                      │
│  │ await client.shipments.resumeTracking(id);                              │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Demurrage Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Container MSCU1234567 › Demurrage                                          │
│  Last Free Day and terminal fees                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────┐ ┌──────────────────────────────────┐
│  │  LAST FREE DAY                     │ │  AVAILABILITY                    │
│  │  ══════════════════════════════════│ │  ════════════════════════════════│
│  │                                    │ │                                  │
│  │  📅 February 10, 2025              │ │  ✅ Available for Pickup         │
│  │                                    │ │                                  │
│  │  ⏰ 2 days remaining               │ │  Discharged: Feb 8, 14:32 UTC    │
│  │     [████████████░░░░░]            │ │  Available since: Feb 8, 18:00   │
│  │                                    │ │                                  │
│  └────────────────────────────────────┘ └──────────────────────────────────┘
│                                                                             │
│  ┌────────────────────────────────────┐ ┌──────────────────────────────────┐
│  │  FEES AT TERMINAL                  │ │  HOLDS AT TERMINAL               │
│  │  ══════════════════════════════════│ │  ════════════════════════════════│
│  │                                    │ │                                  │
│  │  ✅ No fees currently              │ │  ✅ No holds                      │
│  │                                    │ │                                  │
│  │  (Fees will appear after LFD)      │ │  Container is clear for pickup   │
│  │                                    │ │                                  │
│  └────────────────────────────────────┘ └──────────────────────────────────┘
│                                                                             │
│  RAIL MILESTONES (if applicable)                                            │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │  Rail Carrier: BNSF (BNSF)                                              │
│  │  POD Rail Loaded: —                                                     │
│  │  POD Rail Departed: —                                                   │
│  │  IND Rail Arrived: —                                                    │
│  │  IND Rail Unloaded: —                                                   │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
│  ▼ SDK Code                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐
│  │ // Get demurrage information                                            │
│  │ const demurrage = await client.getDemurrage(containerId);               │
│  │ // { pickup_lfd, available_for_pickup, fees_at_pod_terminal, ... }      │
│  │                                                                         │
│  │ // Get rail milestones (North America)                                  │
│  │ const rail = await client.getRailMilestones(containerId);               │
│  │ // { pod_rail_loaded_at, ind_rail_arrived_at, rail_events, ... }        │
│  └─────────────────────────────────────────────────────────────────────────┘
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Color Tokens (Kumo)

```
SURFACES                          TEXT                           STATUS BADGES
─────────────────────────────────────────────────────────────────────────────
bg-kumo-base      Page background  text-kumo-default  Primary    ● new         gray
bg-kumo-elevated  Cards, modals    text-kumo-secondary Secondary ● on_ship     blue
bg-kumo-recessed  Input fields     text-kumo-muted    Subtle     ● available   green
                                                                  ● not_avail   yellow
BORDERS                           INTERACTIVE                     ● grounded    orange
─────────────────────────────────────────────────────────────────────────────
border-kumo-line  Default border   text-kumo-link     Links      ● on_rail     indigo
border-kumo-focus Focus rings      bg-kumo-accent     Buttons    ● picked_up   teal
```
