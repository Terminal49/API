# Shipments

Types:

- <code><a href="./src/resources/shipments.ts">Links</a></code>
- <code><a href="./src/resources/shipments.ts">Meta</a></code>
- <code><a href="./src/resources/shipments.ts">Shipment</a></code>
- <code><a href="./src/resources/shipments.ts">ShipmentRetrieveResponse</a></code>
- <code><a href="./src/resources/shipments.ts">ShipmentUpdateResponse</a></code>
- <code><a href="./src/resources/shipments.ts">ShipmentListResponse</a></code>
- <code><a href="./src/resources/shipments.ts">ShipmentResumeTrackingResponse</a></code>
- <code><a href="./src/resources/shipments.ts">ShipmentStopTrackingResponse</a></code>

Methods:

- <code title="get /shipments/{id}">client.shipments.<a href="./src/resources/shipments.ts">retrieve</a>(id, { ...params }) -> ShipmentRetrieveResponse</code>
- <code title="patch /shipments/{id}">client.shipments.<a href="./src/resources/shipments.ts">update</a>(id, { ...params }) -> ShipmentUpdateResponse</code>
- <code title="get /shipments">client.shipments.<a href="./src/resources/shipments.ts">list</a>({ ...params }) -> ShipmentListResponse</code>
- <code title="patch /shipments/{id}/resume_tracking">client.shipments.<a href="./src/resources/shipments.ts">resumeTracking</a>(id) -> ShipmentResumeTrackingResponse</code>
- <code title="patch /shipments/{id}/stop_tracking">client.shipments.<a href="./src/resources/shipments.ts">stopTracking</a>(id) -> ShipmentStopTrackingResponse</code>

# TrackingRequests

Types:

- <code><a href="./src/resources/tracking-requests.ts">Account</a></code>
- <code><a href="./src/resources/tracking-requests.ts">TrackingRequest</a></code>
- <code><a href="./src/resources/tracking-requests.ts">TrackingRequestCreateResponse</a></code>
- <code><a href="./src/resources/tracking-requests.ts">TrackingRequestRetrieveResponse</a></code>
- <code><a href="./src/resources/tracking-requests.ts">TrackingRequestUpdateResponse</a></code>
- <code><a href="./src/resources/tracking-requests.ts">TrackingRequestListResponse</a></code>

Methods:

- <code title="post /tracking_requests">client.trackingRequests.<a href="./src/resources/tracking-requests.ts">create</a>({ ...params }) -> TrackingRequestCreateResponse</code>
- <code title="get /tracking_requests/{id}">client.trackingRequests.<a href="./src/resources/tracking-requests.ts">retrieve</a>(id, { ...params }) -> TrackingRequestRetrieveResponse</code>
- <code title="patch /tracking_requests/{id}">client.trackingRequests.<a href="./src/resources/tracking-requests.ts">update</a>(id, { ...params }) -> TrackingRequestUpdateResponse</code>
- <code title="get /tracking_requests">client.trackingRequests.<a href="./src/resources/tracking-requests.ts">list</a>({ ...params }) -> TrackingRequestListResponse</code>

# Webhooks

Types:

- <code><a href="./src/resources/webhooks.ts">Webhook</a></code>
- <code><a href="./src/resources/webhooks.ts">WebhookCreateResponse</a></code>
- <code><a href="./src/resources/webhooks.ts">WebhookRetrieveResponse</a></code>
- <code><a href="./src/resources/webhooks.ts">WebhookUpdateResponse</a></code>
- <code><a href="./src/resources/webhooks.ts">WebhookListResponse</a></code>
- <code><a href="./src/resources/webhooks.ts">WebhookListIPsResponse</a></code>

Methods:

- <code title="post /webhooks">client.webhooks.<a href="./src/resources/webhooks.ts">create</a>({ ...params }) -> WebhookCreateResponse</code>
- <code title="get /webhooks/{id}">client.webhooks.<a href="./src/resources/webhooks.ts">retrieve</a>(id) -> WebhookRetrieveResponse</code>
- <code title="patch /webhooks/{id}">client.webhooks.<a href="./src/resources/webhooks.ts">update</a>(id, { ...params }) -> WebhookUpdateResponse</code>
- <code title="get /webhooks">client.webhooks.<a href="./src/resources/webhooks.ts">list</a>({ ...params }) -> WebhookListResponse</code>
- <code title="delete /webhooks/{id}">client.webhooks.<a href="./src/resources/webhooks.ts">delete</a>(id) -> void</code>
- <code title="get /webhooks/ips">client.webhooks.<a href="./src/resources/webhooks.ts">listIPs</a>() -> WebhookListIPsResponse</code>

# WebhookNotifications

Types:

- <code><a href="./src/resources/webhook-notifications.ts">EstimatedEvent</a></code>
- <code><a href="./src/resources/webhook-notifications.ts">WebhookNotification</a></code>
- <code><a href="./src/resources/webhook-notifications.ts">WebhookNotificationRetrieveResponse</a></code>
- <code><a href="./src/resources/webhook-notifications.ts">WebhookNotificationListResponse</a></code>
- <code><a href="./src/resources/webhook-notifications.ts">WebhookNotificationGetExamplesResponse</a></code>

Methods:

- <code title="get /webhook_notifications/{id}">client.webhookNotifications.<a href="./src/resources/webhook-notifications.ts">retrieve</a>(id, { ...params }) -> WebhookNotificationRetrieveResponse</code>
- <code title="get /webhook_notifications">client.webhookNotifications.<a href="./src/resources/webhook-notifications.ts">list</a>({ ...params }) -> WebhookNotificationListResponse</code>
- <code title="get /webhook_notifications/examples">client.webhookNotifications.<a href="./src/resources/webhook-notifications.ts">getExamples</a>({ ...params }) -> WebhookNotificationGetExamplesResponse</code>

# Containers

Types:

- <code><a href="./src/resources/containers.ts">Container</a></code>
- <code><a href="./src/resources/containers.ts">TransportEvent</a></code>
- <code><a href="./src/resources/containers.ts">ContainerRetrieveResponse</a></code>
- <code><a href="./src/resources/containers.ts">ContainerUpdateResponse</a></code>
- <code><a href="./src/resources/containers.ts">ContainerListResponse</a></code>
- <code><a href="./src/resources/containers.ts">ContainerGetRawEventsResponse</a></code>
- <code><a href="./src/resources/containers.ts">ContainerGetTransportEventsResponse</a></code>

Methods:

- <code title="get /containers/{id}">client.containers.<a href="./src/resources/containers.ts">retrieve</a>(id, { ...params }) -> ContainerRetrieveResponse</code>
- <code title="patch /containers">client.containers.<a href="./src/resources/containers.ts">update</a>({ ...params }) -> ContainerUpdateResponse</code>
- <code title="get /containers">client.containers.<a href="./src/resources/containers.ts">list</a>({ ...params }) -> ContainerListResponse</code>
- <code title="get /containers/{id}/raw_events">client.containers.<a href="./src/resources/containers.ts">getRawEvents</a>(id) -> ContainerGetRawEventsResponse</code>
- <code title="get /containers/{id}/transport_events">client.containers.<a href="./src/resources/containers.ts">getTransportEvents</a>(id, { ...params }) -> ContainerGetTransportEventsResponse</code>

# ShippingLines

Types:

- <code><a href="./src/resources/shipping-lines.ts">ShippingLine</a></code>
- <code><a href="./src/resources/shipping-lines.ts">ShippingLineRetrieveResponse</a></code>
- <code><a href="./src/resources/shipping-lines.ts">ShippingLineListResponse</a></code>

Methods:

- <code title="get /shipping_lines/{id}">client.shippingLines.<a href="./src/resources/shipping-lines.ts">retrieve</a>(id) -> ShippingLineRetrieveResponse</code>
- <code title="get /shipping_lines">client.shippingLines.<a href="./src/resources/shipping-lines.ts">list</a>() -> ShippingLineListResponse</code>

# MetroAreas

Types:

- <code><a href="./src/resources/metro-areas.ts">MetroArea</a></code>
- <code><a href="./src/resources/metro-areas.ts">MetroAreaRetrieveResponse</a></code>

Methods:

- <code title="get /metro_areas/{id}">client.metroAreas.<a href="./src/resources/metro-areas.ts">retrieve</a>(id) -> MetroAreaRetrieveResponse</code>

# Ports

Types:

- <code><a href="./src/resources/ports.ts">Port</a></code>
- <code><a href="./src/resources/ports.ts">PortRetrieveResponse</a></code>

Methods:

- <code title="get /ports/{id}">client.ports.<a href="./src/resources/ports.ts">retrieve</a>(id) -> PortRetrieveResponse</code>

# Vessels

Types:

- <code><a href="./src/resources/vessels.ts">Vessel</a></code>
- <code><a href="./src/resources/vessels.ts">VesselRetrieveByIDResponse</a></code>
- <code><a href="./src/resources/vessels.ts">VesselRetrieveByImoResponse</a></code>

Methods:

- <code title="get /vessels/{id}">client.vessels.<a href="./src/resources/vessels.ts">retrieveByID</a>(id) -> VesselRetrieveByIDResponse</code>
- <code title="get /vessels/{imo}">client.vessels.<a href="./src/resources/vessels.ts">retrieveByImo</a>(imo) -> VesselRetrieveByImoResponse</code>

# Terminals

Types:

- <code><a href="./src/resources/terminals.ts">Terminal</a></code>
- <code><a href="./src/resources/terminals.ts">TerminalRetrieveResponse</a></code>

Methods:

- <code title="get /terminals/{id}">client.terminals.<a href="./src/resources/terminals.ts">retrieve</a>(id) -> TerminalRetrieveResponse</code>

# Parties

Types:

- <code><a href="./src/resources/parties.ts">LinkSelf</a></code>
- <code><a href="./src/resources/parties.ts">Party</a></code>
- <code><a href="./src/resources/parties.ts">PartyCreateResponse</a></code>
- <code><a href="./src/resources/parties.ts">PartyRetrieveResponse</a></code>
- <code><a href="./src/resources/parties.ts">PartyUpdateResponse</a></code>
- <code><a href="./src/resources/parties.ts">PartyListResponse</a></code>

Methods:

- <code title="post /parties">client.parties.<a href="./src/resources/parties.ts">create</a>({ ...params }) -> PartyCreateResponse</code>
- <code title="get /parties/{id}">client.parties.<a href="./src/resources/parties.ts">retrieve</a>(id) -> PartyRetrieveResponse</code>
- <code title="patch /parties/{id}">client.parties.<a href="./src/resources/parties.ts">update</a>(id, { ...params }) -> PartyUpdateResponse</code>
- <code title="get /parties">client.parties.<a href="./src/resources/parties.ts">list</a>({ ...params }) -> PartyListResponse</code>
