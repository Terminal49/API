# Terminal49 TypeScript SDK

A comprehensive TypeScript SDK for the Terminal49 API with Model Context Protocol (MCP) support.

## Features

- **Full API Coverage**: All Terminal49 API endpoints implemented
- **TypeScript First**: Fully typed with generated types from OpenAPI spec
- **JSON:API Support**: Automatic handling of JSON:API responses
- **MCP Ready**: Built-in support for Model Context Protocol
- **Well Tested**: Comprehensive unit and integration tests
- **Modern Stack**: Built with ES modules, TypeScript 5+, and Node 18+

## Installation

```bash
npm install @terminal49/typescript-sdk
```

## Quick Start

### Basic Setup

```typescript
import { listShipments, getShipment } from '@terminal49/typescript-sdk';

// Set environment variables
process.env.TERMINAL49_API_KEY = 'Token your_api_key_here';

// List shipments
const shipments = await listShipments({ pageSize: 10 });
console.log(`Found ${shipments.length} shipments`);

// Get a specific shipment with containers
const shipment = await getShipment({
  id: 'shipment-id',
  include: ['containers', 'port_of_discharge'],
});
console.log(`Shipment ${shipment.billOfLadingNumber} has ${shipment.containers?.length} containers`);
```

### Environment Configuration

Create a `.env` file in your project root:

```env
TERMINAL49_API_KEY=Token your_api_key_here
TERMINAL49_API_BASE_URL=https://api.terminal49.com/v2
```

## API Reference

### Shipments

```typescript
import {
  listShipments,
  getShipment,
  stopTracking,
  resumeTracking,
} from '@terminal49/typescript-sdk';

// List shipments with filters
const shipments = await listShipments({
  page: 1,
  pageSize: 25,
  search: 'BOL123',
  tags: ['priority'],
  shippingLineScac: 'OOLU',
});

// Get shipment by ID
const shipment = await getShipment({
  id: 'shipment-id',
  include: ['containers', 'port_of_lading', 'port_of_discharge'],
});

// Stop tracking
await stopTracking({
  id: 'shipment-id',
  reason: 'Shipment delivered',
});

// Resume tracking
await resumeTracking({ id: 'shipment-id' });
```

### Containers

```typescript
import {
  getContainer,
  refreshContainer,
  getContainerEvents,
  getTransportEvents,
  getContainerRoute,
} from '@terminal49/typescript-sdk';

// Get container
const container = await getContainer({
  id: 'container-id',
  include: ['shipment', 'terminal'],
});

// Refresh from shipping line
await refreshContainer({ id: 'container-id' });

// Get container events
const events = await getContainerEvents({ id: 'container-id' });

// Get transport events (AIS-based)
const transportEvents = await getTransportEvents({ id: 'container-id' });

// Get route
const route = await getContainerRoute({ id: 'container-id' });
```

### Tracking Requests

```typescript
import {
  createTrackingRequest,
  getTrackingRequest,
  listTrackingRequests,
} from '@terminal49/typescript-sdk';

// Create tracking request
const trackingRequest = await createTrackingRequest({
  billOfLadingNumber: 'BOL123456',
  shippingLineScac: 'OOLU',
  refNumbers: ['REF001', 'REF002'],
  tags: ['priority'],
});

// Get tracking request
const request = await getTrackingRequest({ id: 'request-id' });

// List tracking requests
const requests = await listTrackingRequests({ page: 1, pageSize: 25 });
```

### Webhooks

```typescript
import {
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  getWebhookIps,
  WebhookEventType,
} from '@terminal49/typescript-sdk';

// Create webhook
const webhook = await createWebhook({
  url: 'https://your-app.com/webhooks/terminal49',
  eventTypes: [
    WebhookEventType.ContainerAvailableForPickup,
    WebhookEventType.ShipmentUpdated,
  ],
  secret: 'your-webhook-secret',
});

// Update webhook
await updateWebhook({
  id: 'webhook-id',
  active: true,
  eventTypes: [WebhookEventType.ContainerUpdated],
});

// Delete webhook
await deleteWebhook({ id: 'webhook-id' });

// Get webhook IPs for allowlisting
const { ips } = await getWebhookIps();
```

### Other Resources

```typescript
import {
  getPort,
  getTerminal,
  getVessel,
  getVesselByImo,
  getShippingLine,
  listShippingLines,
  getParty,
  listParties,
  getMetroArea,
} from '@terminal49/typescript-sdk';

// Ports
const port = await getPort({ id: 'port-id' });

// Terminals
const terminal = await getTerminal({ id: 'terminal-id' });

// Vessels
const vessel = await getVessel({ id: 'vessel-id' });
const vesselByImo = await getVesselByImo({ imo: '9850551' });

// Shipping Lines
const shippingLine = await getShippingLine({ id: 'line-id' });
const allLines = await listShippingLines({ pageSize: 100 });

// Parties
const party = await getParty({ id: 'party-id' });
const parties = await listParties({ page: 1 });

// Metro Areas
const metroArea = await getMetroArea({ id: 'metro-id' });
```

## Domain Models

All API responses are mapped to clean, typed domain models:

```typescript
import type {
  Shipment,
  Container,
  Port,
  Terminal,
  Vessel,
  TrackingRequest,
  Webhook,
  Party,
  ShippingLine,
  MetroArea,
} from '@terminal49/typescript-sdk';

// Example: Working with typed shipment data
const shipment: Shipment = await getShipment({ id: 'shipment-id' });

console.log(shipment.billOfLadingNumber);
console.log(shipment.portOfDischargeName);
console.log(shipment.containers?.[0]?.containerNumber);
```

## Error Handling

```typescript
import { Terminal49Error } from '@terminal49/typescript-sdk';

try {
  const shipment = await getShipment({ id: 'non-existent-id' });
} catch (error) {
  if (error instanceof Terminal49Error) {
    console.error(`API Error (${error.status}): ${error.message}`);
    console.error('Response:', error.response);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## Advanced Usage

### Custom Configuration

```typescript
import { loadConfig, resetConfig } from '@terminal49/typescript-sdk';

// Load custom configuration
const config = loadConfig();
console.log(`Using base URL: ${config.baseUrl}`);

// Reset configuration (useful for testing)
resetConfig();
```

### Working with JSON:API

```typescript
import { jsona, deserialize, deserializeCollection } from '@terminal49/typescript-sdk';

// Deserialize custom JSON:API responses
const customData = deserialize(jsonApiResponse);
const customCollection = deserializeCollection(jsonApiCollectionResponse);
```

## Development

### Setup

```bash
# Install dependencies
npm install

# Generate types from OpenAPI spec
npm run generate:types

# Build
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Type check
npm run typecheck
```

### Project Structure

```
typescript-sdk/
├── src/
│   ├── generated/       # Auto-generated OpenAPI types
│   ├── http/            # HTTP client layer
│   ├── jsonapi/         # JSON:API deserialization
│   ├── domain/          # Domain models
│   ├── mcp/             # MCP tools
│   └── config/          # Configuration
├── tests/
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
└── openapi/             # OpenAPI spec
```

## License

MIT

## Support

- [Terminal49 API Documentation](https://terminal49.com/docs)
- [GitHub Issues](https://github.com/Terminal49/typescript-sdk/issues)
- Email: support@terminal49.com
