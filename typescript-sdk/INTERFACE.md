# Terminal49 TypeScript SDK - Complete Public Interface

## Installation & Setup

```typescript
import * as Terminal49 from '@terminal49/typescript-sdk';

// Or import specific functions
import { 
  listShipments, 
  getShipment,
  getContainer,
  createTrackingRequest 
} from '@terminal49/typescript-sdk';

// Environment variables required
process.env.TERMINAL49_API_KEY = 'Token your_api_key';
process.env.TERMINAL49_API_BASE_URL = 'https://api.terminal49.com/v2'; // optional
```

---

## Configuration

```typescript
import { loadConfig, getConfig, resetConfig, Terminal49Config } from '@terminal49/typescript-sdk';

interface Terminal49Config {
  apiKey: string;
  baseUrl: string;
}

// Load configuration from environment
const config: Terminal49Config = loadConfig();

// Get cached configuration
const config: Terminal49Config = getConfig();

// Reset configuration (useful for testing)
resetConfig(): void;
```

---

## Shipments API

```typescript
import {
  listShipments,
  getShipment,
  stopTracking,
  resumeTracking,
  type Shipment,
  type ListShipmentsArgs,
  type GetShipmentArgs,
  type StopTrackingArgs,
  type ResumeTrackingArgs
} from '@terminal49/typescript-sdk';

interface ListShipmentsArgs {
  page?: number;
  pageSize?: number;
  include?: string[];
  search?: string;
  tags?: string[];
  shippingLineScac?: string;
}

interface GetShipmentArgs {
  id: string;
  include?: string[];
}

interface StopTrackingArgs {
  id: string;
  reason?: string;
}

interface ResumeTrackingArgs {
  id: string;
}

// List shipments
const shipments: Shipment[] = await listShipments({
  page: 1,
  pageSize: 25,
  search: 'BOL123',
  tags: ['priority'],
  shippingLineScac: 'OOLU',
  include: ['containers', 'port_of_lading', 'port_of_discharge']
});

// Get single shipment
const shipment: Shipment = await getShipment({
  id: 'shipment-id',
  include: ['containers', 'port_of_discharge']
});

// Stop tracking
const stopped: Shipment = await stopTracking({
  id: 'shipment-id',
  reason: 'Delivered'
});

// Resume tracking
const resumed: Shipment = await resumeTracking({
  id: 'shipment-id'
});
```

---

## Containers API

```typescript
import {
  getContainer,
  refreshContainer,
  getContainerEvents,
  getTransportEvents,
  getContainerRoute,
  type Container,
  type ContainerEvent,
  type TransportEvent,
  type GetContainerArgs,
  type RefreshContainerArgs,
  type GetContainerEventsArgs,
  type GetTransportEventsArgs,
  type GetContainerRouteArgs
} from '@terminal49/typescript-sdk';

interface GetContainerArgs {
  id: string;
  include?: string[];
}

interface RefreshContainerArgs {
  id: string;
}

interface GetContainerEventsArgs {
  id: string;
}

interface GetTransportEventsArgs {
  id: string;
}

interface GetContainerRouteArgs {
  id: string;
}

// Get container
const container: Container = await getContainer({
  id: 'container-id',
  include: ['shipment', 'terminal']
});

// Refresh from shipping line
const refreshed: Container = await refreshContainer({
  id: 'container-id'
});

// Get raw events
const events: ContainerEvent[] = await getContainerEvents({
  id: 'container-id'
});

// Get transport events (AIS-based)
const transportEvents: TransportEvent[] = await getTransportEvents({
  id: 'container-id'
});

// Get route
const route = await getContainerRoute({
  id: 'container-id'
});
```

---

## Tracking Requests API

```typescript
import {
  createTrackingRequest,
  getTrackingRequest,
  listTrackingRequests,
  type TrackingRequest,
  type CreateTrackingRequestArgs,
  type GetTrackingRequestArgs,
  type ListTrackingRequestsArgs
} from '@terminal49/typescript-sdk';

interface CreateTrackingRequestArgs {
  billOfLadingNumber: string;
  shippingLineScac: string;
  refNumbers?: string[];
  tags?: string[];
}

interface GetTrackingRequestArgs {
  id: string;
}

interface ListTrackingRequestsArgs {
  page?: number;
  pageSize?: number;
}

// Create tracking request
const request: TrackingRequest = await createTrackingRequest({
  billOfLadingNumber: 'BOL123456',
  shippingLineScac: 'OOLU',
  refNumbers: ['REF001'],
  tags: ['priority']
});

// Get tracking request
const request: TrackingRequest = await getTrackingRequest({
  id: 'request-id'
});

// List tracking requests
const requests: TrackingRequest[] = await listTrackingRequests({
  page: 1,
  pageSize: 25
});
```

---

## Webhooks API

```typescript
import {
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhook,
  listWebhooks,
  getWebhookIps,
  listWebhookNotifications,
  getWebhookNotification,
  getWebhookExamples,
  type Webhook,
  type WebhookNotification,
  type WebhookEventType,
  type CreateWebhookArgs,
  type UpdateWebhookArgs,
  type DeleteWebhookArgs,
  type GetWebhookArgs,
  type ListWebhooksArgs,
  type ListWebhookNotificationsArgs,
  type GetWebhookNotificationArgs
} from '@terminal49/typescript-sdk';

interface CreateWebhookArgs {
  url: string;
  eventTypes: string[];
  secret?: string;
}

interface UpdateWebhookArgs {
  id: string;
  url?: string;
  eventTypes?: string[];
  secret?: string;
  active?: boolean;
}

interface DeleteWebhookArgs {
  id: string;
}

interface GetWebhookArgs {
  id: string;
}

interface ListWebhooksArgs {
  page?: number;
  pageSize?: number;
}

interface ListWebhookNotificationsArgs {
  page?: number;
  pageSize?: number;
}

interface GetWebhookNotificationArgs {
  id: string;
}

enum WebhookEventType {
  ContainerAvailableForPickup = 'container.available_for_pickup',
  ContainerAvailableForPickupChanged = 'container.available_for_pickup.changed',
  ContainerDispatched = 'container.dispatched',
  ContainerDischarged = 'container.discharged',
  ContainerEmptyReturned = 'container.empty_returned',
  ContainerFeesChanged = 'container.fees.changed',
  ContainerGated = 'container.gated',
  ContainerHoldsChanged = 'container.holds.changed',
  ContainerLFDChanged = 'container.lfd.changed',
  ContainerPickupLFDLineChanged = 'container.pickup_lfd_line.changed',
  ContainerPickupLFDTerminalChanged = 'container.pickup_lfd_terminal.changed',
  ContainerUpdated = 'container.updated',
  ShipmentCreated = 'shipment.created',
  ShipmentDestinationChanged = 'shipment.destination.changed',
  ShipmentPODChanged = 'shipment.pod.changed',
  ShipmentUpdated = 'shipment.updated',
  ShipmentTrackingStopped = 'shipment.tracking.stopped',
  TransportArrivedAtPort = 'transport.arrived_at_port',
  TransportDepartedPort = 'transport.departed_port',
  TransportVesselChanged = 'transport.vessel.changed',
}

// Create webhook
const webhook: Webhook = await createWebhook({
  url: 'https://your-app.com/webhooks',
  eventTypes: [
    WebhookEventType.ContainerAvailableForPickup,
    WebhookEventType.ShipmentUpdated
  ],
  secret: 'your-secret'
});

// Update webhook
const updated: Webhook = await updateWebhook({
  id: 'webhook-id',
  active: true,
  eventTypes: [WebhookEventType.ContainerUpdated]
});

// Delete webhook
await deleteWebhook({ id: 'webhook-id' });

// Get webhook
const webhook: Webhook = await getWebhook({ id: 'webhook-id' });

// List webhooks
const webhooks: Webhook[] = await listWebhooks({ page: 1 });

// Get webhook IPs for allowlisting
const { ips }: { ips: string[] } = await getWebhookIps();

// List webhook notifications
const notifications: WebhookNotification[] = await listWebhookNotifications({
  page: 1,
  pageSize: 25
});

// Get webhook notification
const notification: WebhookNotification = await getWebhookNotification({
  id: 'notification-id'
});

// Get webhook examples
const examples = await getWebhookExamples();
```

---

## Ports API

```typescript
import {
  getPort,
  type Port,
  type GetPortArgs
} from '@terminal49/typescript-sdk';

interface GetPortArgs {
  id: string;
}

const port: Port = await getPort({ id: 'port-id' });
```

---

## Terminals API

```typescript
import {
  getTerminal,
  type Terminal,
  type GetTerminalArgs
} from '@terminal49/typescript-sdk';

interface GetTerminalArgs {
  id: string;
}

const terminal: Terminal = await getTerminal({ id: 'terminal-id' });
```

---

## Vessels API

```typescript
import {
  getVessel,
  getVesselByImo,
  getVesselFuturePositions,
  getVesselFuturePositionsWithCoordinates,
  type Vessel,
  type VesselFuturePosition,
  type VesselFuturePositionWithCoordinates,
  type GetVesselByIdArgs,
  type GetVesselByImoArgs,
  type GetVesselFuturePositionsArgs,
  type GetVesselFuturePositionsWithCoordinatesArgs
} from '@terminal49/typescript-sdk';

interface GetVesselByIdArgs {
  id: string;
}

interface GetVesselByImoArgs {
  imo: string;
}

interface GetVesselFuturePositionsArgs {
  id: string;
  portId: string;
  previousPortId: string;
}

interface GetVesselFuturePositionsWithCoordinatesArgs {
  id: string;
  portId: string;
  previousPortId: string;
  latitude: number;
  longitude: number;
}

// Get vessel by ID
const vessel: Vessel = await getVessel({ id: 'vessel-id' });

// Get vessel by IMO
const vessel: Vessel = await getVesselByImo({ imo: '9850551' });

// Get future positions
const positions: VesselFuturePosition[] = await getVesselFuturePositions({
  id: 'vessel-id',
  portId: 'port-id',
  previousPortId: 'prev-port-id'
});

// Get future positions with coordinates
const positions: VesselFuturePositionWithCoordinates[] = 
  await getVesselFuturePositionsWithCoordinates({
    id: 'vessel-id',
    portId: 'port-id',
    previousPortId: 'prev-port-id',
    latitude: 34.05,
    longitude: -118.25
  });
```

---

## Shipping Lines API

```typescript
import {
  getShippingLine,
  listShippingLines,
  type ShippingLine,
  type GetShippingLineArgs,
  type ListShippingLinesArgs
} from '@terminal49/typescript-sdk';

interface GetShippingLineArgs {
  id: string;
}

interface ListShippingLinesArgs {
  page?: number;
  pageSize?: number;
}

// Get shipping line
const line: ShippingLine = await getShippingLine({ id: 'line-id' });

// List all shipping lines
const lines: ShippingLine[] = await listShippingLines({ pageSize: 100 });
```

---

## Parties API

```typescript
import {
  getParty,
  listParties,
  type Party,
  type GetPartyArgs,
  type ListPartiesArgs
} from '@terminal49/typescript-sdk';

interface GetPartyArgs {
  id: string;
}

interface ListPartiesArgs {
  page?: number;
  pageSize?: number;
}

// Get party
const party: Party = await getParty({ id: 'party-id' });

// List parties
const parties: Party[] = await listParties({ page: 1 });
```

---

## Metro Areas API

```typescript
import {
  getMetroArea,
  type MetroArea,
  type GetMetroAreaArgs
} from '@terminal49/typescript-sdk';

interface GetMetroAreaArgs {
  id: string;
}

const metroArea: MetroArea = await getMetroArea({ id: 'metro-id' });
```

---

## Domain Models

### Shipment

```typescript
interface Shipment {
  id: string;
  type: 'shipment';
  
  // Identifiers
  billOfLadingNumber?: string;
  normalizedNumber?: string;
  refNumbers?: string[];
  
  // Shipping line
  shippingLineScac?: string;
  shippingLineName?: string;
  shippingLineShortName?: string;
  
  // Customer
  customerName?: string;
  
  // Port of Lading
  portOfLadingLocode?: string;
  portOfLadingName?: string;
  polEtdAt?: string | null;
  polAtdAt?: string | null;
  polTimezone?: string;
  
  // Port of Discharge
  portOfDischargeLocode?: string;
  portOfDischargeName?: string;
  podEtaAt?: string | null;
  podOriginalEtaAt?: string | null;
  podAtaAt?: string | null;
  podTimezone?: string;
  
  // Vessel (at POD)
  podVesselName?: string;
  podVesselImo?: string;
  podVoyageNumber?: string;
  
  // Destination
  destinationLocode?: string;
  destinationName?: string;
  destinationTimezone?: string;
  destinationEtaAt?: string | null;
  destinationAtaAt?: string | null;
  
  // Tracking
  trackingStatus?: string;
  trackingStoppedReason?: string | null;
  trackingStoppedAt?: string | null;
  
  // Metadata
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  
  // Relationships
  containers?: Container[];
  portOfLading?: Port | null;
  portOfDischarge?: Port | null;
  
  raw?: unknown;
}
```

### Container

```typescript
interface Container {
  id: string;
  type: 'container';
  
  // Identifiers
  containerNumber?: string;
  
  // Container details
  sizeTypeCode?: string;
  equipmentLength?: number;
  equipmentHeight?: string;
  equipmentType?: string;
  
  // Status
  currentLocationName?: string;
  currentLocationLocode?: string;
  currentLocationTimezone?: string;
  
  // Events
  emptyReturnedAt?: string | null;
  equipmentPickupAt?: string | null;
  equipmentReturnAt?: string | null;
  availableForPickup?: boolean;
  availableForPickupAt?: string | null;
  
  // Last Free Day (LFD)
  lastFreeDay?: string | null;
  lastFreeLineDay?: string | null;
  pickupLfdLine?: string | null;
  pickupLfdTerminal?: string | null;
  returnLfdLine?: string | null;
  returnLfdTerminal?: string | null;
  
  // Fees
  feesStatus?: string;
  feesPayableAt?: string;
  feesPaymentType?: string;
  totalHolds?: number;
  totalFreightHolds?: number;
  totalCustomsHolds?: number;
  totalUSDAHolds?: number;
  totalTMFHolds?: number;
  totalOtherHolds?: number;
  
  // Metadata
  createdAt?: string;
  updatedAt?: string;
  lastStatusRefreshedAt?: string | null;
  
  // Relationships
  shipment?: Shipment | null;
  terminal?: Terminal | null;
  
  raw?: unknown;
}
```

### Other Domain Models

```typescript
interface Port {
  id: string;
  type: 'port';
  name?: string;
  locode?: string;
  countryCode?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  city?: string;
  state?: string;
  country?: string;
  raw?: unknown;
}

interface Terminal {
  id: string;
  type: 'terminal';
  name?: string;
  nickname?: string;
  firmCode?: string;
  portLocode?: string;
  portName?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  phone?: string;
  website?: string;
  address?: string;
  raw?: unknown;
}

interface Vessel {
  id: string;
  type: 'vessel';
  name?: string;
  imo?: string;
  mmsi?: string;
  callSign?: string;
  flag?: string;
  vesselType?: string;
  grossTonnage?: number;
  deadweightTonnage?: number;
  length?: number;
  width?: number;
  yearBuilt?: number;
  latitude?: number;
  longitude?: number;
  heading?: number;
  speed?: number;
  lastPositionUpdate?: string;
  raw?: unknown;
}

interface TrackingRequest {
  id: string;
  type: 'tracking_request';
  requestNumber?: string;
  requestType?: string;
  shippingLineScac?: string;
  shippingLineName?: string;
  status?: string;
  failureReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
  shipmentId?: string | null;
  raw?: unknown;
}

interface Webhook {
  id: string;
  type: 'webhook';
  url?: string;
  eventTypes?: string[];
  secret?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  totalNotifications?: number;
  successfulNotifications?: number;
  failedNotifications?: number;
  raw?: unknown;
}

interface WebhookNotification {
  id: string;
  type: 'webhook_notification';
  webhookId?: string;
  eventType?: string;
  url?: string;
  status?: string;
  attemptCount?: number;
  lastAttemptAt?: string | null;
  responseCode?: number | null;
  responseBody?: string | null;
  payload?: Record<string, unknown>;
  createdAt?: string;
  processedAt?: string | null;
  raw?: unknown;
}

interface Party {
  id: string;
  type: 'party';
  name?: string;
  role?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  raw?: unknown;
}

interface ShippingLine {
  id: string;
  type: 'shipping_line';
  name?: string;
  shortName?: string;
  scac?: string;
  website?: string;
  trackingUrl?: string;
  apiSupported?: boolean;
  supportedRegions?: string[];
  raw?: unknown;
}

interface MetroArea {
  id: string;
  type: 'metro_area';
  name?: string;
  code?: string;
  country?: string;
  countryCode?: string;
  timezone?: string;
  ports?: Array<{
    id?: string;
    name?: string;
    locode?: string;
  }>;
  raw?: unknown;
}
```

---

## Error Handling

```typescript
import { Terminal49Error } from '@terminal49/typescript-sdk';

class Terminal49Error extends Error {
  name: 'Terminal49Error';
  status?: number;
  statusText?: string;
  response?: unknown;
  
  constructor(
    message: string,
    status?: number,
    statusText?: string,
    response?: unknown
  );
}

// Usage
try {
  const shipment = await getShipment({ id: 'invalid-id' });
} catch (error) {
  if (error instanceof Terminal49Error) {
    console.error(`API Error (${error.status}): ${error.message}`);
    console.error('Response:', error.response);
  }
}
```

---

## JSON:API Utilities

```typescript
import { 
  jsona, 
  deserialize, 
  deserializeCollection,
  isJsonApiDocument 
} from '@terminal49/typescript-sdk';

// Type guard
const isValid: boolean = isJsonApiDocument(data);

// Deserialize single resource
const resource: T = deserialize<T>(jsonApiDocument);

// Deserialize collection
const resources: T[] = deserializeCollection<T>(jsonApiDocument);

// JSONA instance (for advanced use)
const jsonaInstance = jsona;
```

---

## HTTP Client (Advanced)

```typescript
import { 
  getClient, 
  resetClient,
  handleResponse 
} from '@terminal49/typescript-sdk';

// Get the singleton HTTP client
const client = getClient();

// Reset client (useful for testing)
resetClient();

// Handle API responses
const data = handleResponse({ data, error, response });
```

---

## MCP Integration

```typescript
import { allTools } from '@terminal49/typescript-sdk';

// Access all MCP tools
const tools = allTools;

// Available tools:
// - listShipments, getShipment, stopTracking, resumeTracking
// - getContainer, refreshContainer, getContainerEvents, getTransportEvents, getContainerRoute
// - createTrackingRequest, getTrackingRequest, listTrackingRequests
// - createWebhook, updateWebhook, deleteWebhook, getWebhook, listWebhooks
// - getWebhookIps, listWebhookNotifications, getWebhookNotification, getWebhookExamples
// - getPort, getTerminal
// - getVessel, getVesselByImo, getVesselFuturePositions, getVesselFuturePositionsWithCoordinates
// - getShippingLine, listShippingLines
// - getParty, listParties
// - getMetroArea
```
