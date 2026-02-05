# Terminal49 SDK Showcase

A comprehensive Next.js application showcasing all Terminal49 TypeScript SDK capabilities. This app serves as both a developer reference and a demonstration of real business workflows for container tracking.

## Features

### Dashboard
- Summary metrics for shipments, containers, and tracking requests
- Status distribution visualization
- LFD alerts for containers approaching Last Free Day
- Quick track action

### Tracking Requests
- **List**: View and filter all tracking requests with pagination
- **Create**: Multi-step wizard with intelligent carrier auto-detection (infer flow)
- **Detail**: View status, update, and manage individual requests

### Shipments
- **List**: Filter by status, port, carrier with sorting
- **Detail**: Full shipment info with route visualization
- **Actions**: Stop/resume tracking, edit reference numbers and tags

### Containers
- **List**: Filter and sort containers by status, terminal, carrier
- **Detail**: Comprehensive container info with terminal details
- **Events**: Transport events timeline with raw carrier events
- **Route**: Route visualization with legs, vessels, and timing
- **Demurrage**: LFD tracking, terminal fees, holds, and rail milestones

### Reference
- **Shipping Lines**: Browse and search carriers by name or SCAC code
- **Webhooks**: Event simulator with payload examples and handler code

### Global Search
- Search across containers, shipments, and tracking requests

## SDK Methods Demonstrated

| Method | Page |
|--------|------|
| `client.shipments.list()` | Dashboard, Shipments |
| `client.shipments.get()` | Shipment Detail |
| `client.shipments.update()` | Shipment Detail |
| `client.shipments.stopTracking()` | Shipment Detail |
| `client.shipments.resumeTracking()` | Shipment Detail |
| `client.containers.list()` | Dashboard, Containers |
| `client.containers.get()` | Container Detail |
| `client.containers.refresh()` | Container Detail |
| `client.containers.events()` | Container Events |
| `client.containers.rawEvents()` | Container Events |
| `client.containers.route()` | Container Route |
| `client.trackingRequests.list()` | Dashboard, Tracking Requests |
| `client.trackingRequests.get()` | Tracking Request Detail |
| `client.trackingRequests.create()` | Create Tracking |
| `client.trackingRequests.inferNumber()` | Create Tracking |
| `client.trackingRequests.createFromInfer()` | Create Tracking |
| `client.shippingLines.list()` | Shipping Lines |
| `client.search()` | Search |
| `client.getDemurrage()` | Container Demurrage |
| `client.getRailMilestones()` | Container Demurrage |

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm
- Terminal49 API token

### Installation

```bash
cd sdk-showcase
pnpm install
```

### Configuration

Create a `.env.local` file:

```env
T49_API_TOKEN=your_api_token_here
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production Build

```bash
pnpm build
pnpm start
```

## Project Structure

```
sdk-showcase/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Dashboard
│   │   ├── tracking-requests/  # Tracking request pages
│   │   ├── shipments/          # Shipment pages
│   │   ├── containers/         # Container pages with subpages
│   │   ├── shipping-lines/     # Carrier browser
│   │   ├── search/             # Global search
│   │   ├── webhooks/           # Webhook simulator
│   │   └── api/                # API routes for client actions
│   ├── components/
│   │   ├── layout/             # Sidebar, PageHeader
│   │   ├── features/           # Card, Button, Badge components
│   │   └── code-panel/         # SDK code display component
│   └── lib/
│       ├── terminal49/         # SDK client singleton
│       └── utils.ts            # Helper functions
├── SDK_IMPROVEMENTS.md         # SDK improvement tracking
└── README.md
```

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **UI**: Kumo (Cloudflare) semantic tokens
- **SDK**: `@terminal49/sdk`
- **Data**: React Server Components for server-side data fetching

## Container Status Values

| Status | Description |
|--------|-------------|
| `new` | Tracking started, status unknown |
| `on_ship` | In transit by vessel |
| `available` | Ready for pickup |
| `not_available` | At port but restricted |
| `grounded` | Availability unknown |
| `awaiting_inland_transfer` | Waiting for rail |
| `on_rail` | In transit by rail |
| `picked_up` | Out for delivery |
| `off_dock` | At alternative facility |
| `delivered` | Delivery confirmed |
| `empty_returned` | Container returned |

## Business Use Cases

1. **First-Time Container Tracking**: Enter number → Auto-detect carrier → Confirm → Track → View shipment
2. **Monitor Active Shipments**: Filter in-transit → Sort by ETA → View events → Check route
3. **Demurrage Management**: Dashboard LFD alerts → Container demurrage page → Check holds/fees
4. **Tracking Lifecycle**: View shipment → Stop tracking → Later: Resume tracking

## SDK Improvements

See [SDK_IMPROVEMENTS.md](./SDK_IMPROVEMENTS.md) for documented SDK improvement opportunities including:
- Missing SDK methods (webhooks, vessels, terminals, ports)
- Type improvements (enum types, typed filters)
- Documentation gaps

## License

Internal use only.
