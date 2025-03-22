# Terminal49 Documentation Navigation Structure

This document outlines the proposed navigation structure for Terminal49's documentation portal. The documentation is organized into three main tabs with various sections within each tab.

## Top-Level Navigation

The documentation is divided into three main sections:

| Tab | Purpose |
|-----|---------|
| **Integration Guide** | Focuses on use cases, quickstart guides, and conceptual information about integrating with Terminal49. |
| **API Reference** | Contains detailed technical documentation for specific API endpoints and operations. |
| **DataSync** | Covers Terminal49's data warehouse integration solution. |

## Tab 1: Integration Guide

This section helps users understand how to integrate Terminal49 into their systems and workflows.

### Groups and Pages

#### Group: [blank]
- home

#### Group: Overview
- Quickstart (`api-docs/in-depth-guides/quickstart`)
- Terminal49 API Capabilities Overview (`api-docs/getting-started/capabilities-overview`)

#### Group: Guides
- Use Cases (`api-docs/in-depth-guides/use-cases`)
- JSON:API Guide (`api-docs/in-depth-guides/json-api-guide`)
- Authentication (`api-docs/in-depth-guides/authentication`)
- Error Handling (`api-docs/in-depth-guides/error-handling`)
- Rate Limiting (`api-docs/in-depth-guides/rate-limiting`)
- Polling vs. Webhooks (`api-docs/in-depth-guides/polling-vs-webhooks`)
- Webhooks (`api-docs/in-depth-guides/webhooks`)
- Tracking Shipments and Containers (`api-docs/getting-started/tracking-shipments-and-containers`)
- List Shipments and Containers (`api-docs/getting-started/list-shipments-and-containers`)
- Receive Status Updates (`api-docs/getting-started/receive-status-updates`)
- Including Resources (`api-docs/in-depth-guides/including-resources`)
- Adding Customer (`api-docs/in-depth-guides/adding-customer`)
- Tracking Request Lifecycle (`api-docs/in-depth-guides/tracking-request-lifecycle`)
- Event Timestamps (`api-docs/in-depth-guides/event-timestamps`)
- Terminal49 Map (`api-docs/in-depth-guides/terminal49-map`)
- Terminal49 Widget (`api-docs/in-depth-guides/terminal49-widget`)
- Rail Integration Guide (`api-docs/in-depth-guides/rail-integration-guide`)

#### Group: Useful Info
- API Data Sources & Availability (`api-docs/useful-info/api-data-sources-availability`)
- Pricing (`api-docs/useful-info/pricing`)
- Test Numbers (`api-docs/useful-info/test-numbers`)
- Tracking Request Retrying (`api-docs/useful-info/tracking-request-retrying`)
- Webhook Events Examples (`api-docs/useful-info/webhook-events-examples`)

## Tab 2: API Reference

This section provides detailed technical documentation for specific API endpoints.

### Groups and Pages

#### Group: Shipments
- List Shipments (`api-docs/api-reference/shipments/list-shipments`)
- Get a Shipment (`api-docs/api-reference/shipments/get-a-shipment`)
- Edit a Shipment (`api-docs/api-reference/shipments/edit-a-shipment`)
- Stop Tracking Shipment (`api-docs/api-reference/shipments/stop-tracking-shipment`)
- Resume Tracking Shipment (`api-docs/api-reference/shipments/resume-tracking-shipment`)

#### Group: Tracking Requests
- List Tracking Requests (`api-docs/api-reference/tracking-requests/list-tracking-requests`)
- Create a Tracking Request (`api-docs/api-reference/tracking-requests/create-a-tracking-request`)
- Get a Single Tracking Request (`api-docs/api-reference/tracking-requests/get-a-single-tracking-request`)
- Edit a Tracking Request (`api-docs/api-reference/tracking-requests/edit-a-tracking-request`)

#### Group: Webhooks
- Get Single Webhook (`api-docs/api-reference/webhooks/get-single-webhook`)
- Delete a Webhook (`api-docs/api-reference/webhooks/delete-a-webhook`)
- Edit a Webhook (`api-docs/api-reference/webhooks/edit-a-webhook`)
- List Webhooks (`api-docs/api-reference/webhooks/list-webhooks`)
- Create a Webhook (`api-docs/api-reference/webhooks/create-a-webhook`)
- List Webhook IPs (`api-docs/api-reference/webhooks/list-webhook-ips`)

#### Group: Webhook Notifications
- Get a Single Webhook Notification (`api-docs/api-reference/webhook-notifications/get-a-single-webhook-notification`)
- List Webhook Notifications (`api-docs/api-reference/webhook-notifications/list-webhook-notifications`)
- Get Webhook Notification Payload Examples (`api-docs/api-reference/webhook-notifications/get-webhook-notification-payload-examples`)

#### Group: Containers
- List Containers (`api-docs/api-reference/containers/list-containers`)
- Edit a Container (`api-docs/api-reference/containers/edit-a-container`)
- Get a Container (`api-docs/api-reference/containers/get-a-container`)
- Get a Container's Raw Events (`api-docs/api-reference/containers/get-a-containers-raw-events`)
- Get a Container's Transport Events (`api-docs/api-reference/containers/get-a-containers-transport-events`)

#### Group: Shipping Lines
- Shipping Lines (`api-docs/api-reference/shipping-lines/shipping-lines`)
- Get a Single Shipping Line (`api-docs/api-reference/shipping-lines/get-a-single-shipping-line`)

#### Group: Metro Areas
- Get a Metro Area Using the UNLOCODE or the ID (`api-docs/api-reference/metro-areas/get-a-metro-area-using-the-unlocode-or-the-id`)

#### Group: Ports
- Get a Port Using the LOCODE or the ID (`api-docs/api-reference/ports/get-a-port-using-the-locode-or-the-id`)

#### Group: Vessels
- Get a Vessel Using the ID (`api-docs/api-reference/vessels/get-a-vessel-using-the-id`)
- Get a Vessel Using the IMO (`api-docs/api-reference/vessels/get-a-vessel-using-the-imo`)

#### Group: Terminals
- Get a Terminal Using the ID (`api-docs/api-reference/terminals/get-a-terminal-using-the-id`)

#### Group: Parties
- List Parties (`api-docs/api-reference/parties/list-parties`)
- Create a Party (`api-docs/api-reference/parties/create-a-party`)
- Get a Party (`api-docs/api-reference/parties/get-a-party`)
- Edit a Party (`api-docs/api-reference/parties/edit-a-party`)

## Tab 3: DataSync

This section covers Terminal49's data warehouse integration solution.

### Groups and Pages

#### Group: [blank]
- home (`datasync/home`)

#### Group: [blank]
- Overview (`datasync/overview`)
- Supported Destinations (`datasync/supported-destinations`)

#### Group: Table Properties
- Containers Rail (`datasync/table-properties/containers_rail`)
- Shipments (`datasync/table-properties/shipments`)
- Tracking Requests (`datasync/table-properties/tracking-requests`)
- Transport Events (`datasync/table-properties/transport-events`)
- Transfer Status (`datasync/table-properties/transfer-status`)
- Containers (`datasync/table-properties/containers`)

## Notes on Structure

1. **Integration Guide to API Reference Flow**:
   - The Integration Guide introduces concepts, use cases, and patterns.
   - Users then move to API Reference for specific implementation details.
   - This creates a natural learning progression from high-level to specific details.

2. **Use Case Focus**:
   - The Use Cases document in the Integration Guide helps users understand real-world applications.
   - Each use case can link to specific API endpoints in the Reference section.

3. **DataSync Integration**:
   - The DataSync tab provides a separate but related product offering.
   - Could potentially add cross-references between API use cases and when DataSync might be more appropriate.

4. **Naming Conventions**:
   - Groups use clear, descriptive names.
   - Page titles are consistently formatted.

5. **Potential Improvements**:
   - Consider organizing the Guides section into subcategories as it grows.
   - Group related guides (e.g., authentication, error handling, and rate limiting might form a "Best Practices" subgroup).
