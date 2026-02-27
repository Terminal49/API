'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/features';
import { CodePanel } from '@/components/code-panel';

/**
 * Webhooks Simulator Page
 *
 * This page demonstrates webhook event structures and handling patterns.
 * It simulates webhook payloads without requiring actual webhook setup.
 *
 * Note: The Terminal49 SDK does not include webhook CRUD methods.
 * Webhook management is done through the Terminal49 web dashboard.
 */

type WebhookEventType =
  | 'shipment.estimated.arrival'
  | 'shipment.estimated.departure'
  | 'shipment.transport.arrival'
  | 'shipment.transport.departure'
  | 'container.transport.vessel_loaded'
  | 'container.transport.vessel_departed'
  | 'container.transport.vessel_arrived'
  | 'container.transport.vessel_discharged'
  | 'container.transport.full_out'
  | 'container.transport.empty_returned'
  | 'container.transport.transshipment_arrived'
  | 'container.transport.transshipment_departed'
  | 'container.availability.changed'
  | 'container.lfd.updated'
  | 'container.hold.added'
  | 'container.hold.released'
  | 'tracking_request.created'
  | 'tracking_request.failed';

interface EventExample {
  type: WebhookEventType;
  label: string;
  description: string;
  category: string;
  payload: object;
}

const webhookEvents: EventExample[] = [
  {
    type: 'shipment.estimated.arrival',
    label: 'ETA Updated',
    description: 'Triggered when the estimated time of arrival changes',
    category: 'Shipment',
    payload: {
      id: 'evt_abc123',
      type: 'shipment.estimated.arrival',
      created_at: '2025-02-08T10:30:00Z',
      data: {
        shipment_id: 'ship_def456',
        bill_of_lading: 'MAEUSEA12345678',
        pod_eta_at: '2025-02-15T08:00:00Z',
        previous_pod_eta_at: '2025-02-14T08:00:00Z',
        change_reason: 'vessel_delay',
      },
    },
  },
  {
    type: 'shipment.transport.arrival',
    label: 'Vessel Arrived',
    description: 'Triggered when the vessel arrives at port of discharge',
    category: 'Shipment',
    payload: {
      id: 'evt_abc124',
      type: 'shipment.transport.arrival',
      created_at: '2025-02-08T14:30:00Z',
      data: {
        shipment_id: 'ship_def456',
        bill_of_lading: 'MAEUSEA12345678',
        pod_ata_at: '2025-02-08T14:30:00Z',
        port_name: 'Los Angeles',
        port_locode: 'USLAX',
      },
    },
  },
  {
    type: 'container.transport.vessel_discharged',
    label: 'Container Discharged',
    description: 'Triggered when a container is unloaded from the vessel',
    category: 'Container',
    payload: {
      id: 'evt_abc125',
      type: 'container.transport.vessel_discharged',
      created_at: '2025-02-08T18:45:00Z',
      data: {
        container_id: 'cont_ghi789',
        container_number: 'MSCU1234567',
        shipment_id: 'ship_def456',
        discharged_at: '2025-02-08T18:45:00Z',
        terminal_name: 'APM Los Angeles',
        terminal_firms_code: 'Y258',
      },
    },
  },
  {
    type: 'container.availability.changed',
    label: 'Availability Changed',
    description: 'Triggered when container availability status changes',
    category: 'Container',
    payload: {
      id: 'evt_abc126',
      type: 'container.availability.changed',
      created_at: '2025-02-09T09:00:00Z',
      data: {
        container_id: 'cont_ghi789',
        container_number: 'MSCU1234567',
        available_for_pickup: true,
        available_for_pickup_at: '2025-02-09T09:00:00Z',
        previous_available_for_pickup: false,
      },
    },
  },
  {
    type: 'container.lfd.updated',
    label: 'LFD Updated',
    description: 'Triggered when the Last Free Day changes',
    category: 'Container',
    payload: {
      id: 'evt_abc127',
      type: 'container.lfd.updated',
      created_at: '2025-02-09T10:00:00Z',
      data: {
        container_id: 'cont_ghi789',
        container_number: 'MSCU1234567',
        pickup_lfd: '2025-02-12',
        previous_pickup_lfd: '2025-02-10',
        terminal_name: 'APM Los Angeles',
      },
    },
  },
  {
    type: 'container.hold.added',
    label: 'Hold Added',
    description: 'Triggered when a hold is placed on a container',
    category: 'Container',
    payload: {
      id: 'evt_abc128',
      type: 'container.hold.added',
      created_at: '2025-02-08T20:00:00Z',
      data: {
        container_id: 'cont_ghi789',
        container_number: 'MSCU1234567',
        hold_type: 'customs',
        hold_status: 'active',
        description: 'Customs examination required',
      },
    },
  },
  {
    type: 'container.hold.released',
    label: 'Hold Released',
    description: 'Triggered when a hold is released from a container',
    category: 'Container',
    payload: {
      id: 'evt_abc129',
      type: 'container.hold.released',
      created_at: '2025-02-09T11:00:00Z',
      data: {
        container_id: 'cont_ghi789',
        container_number: 'MSCU1234567',
        hold_type: 'customs',
        hold_status: 'released',
        released_at: '2025-02-09T11:00:00Z',
      },
    },
  },
  {
    type: 'container.transport.full_out',
    label: 'Container Picked Up',
    description: 'Triggered when a full container leaves the terminal',
    category: 'Container',
    payload: {
      id: 'evt_abc130',
      type: 'container.transport.full_out',
      created_at: '2025-02-10T07:30:00Z',
      data: {
        container_id: 'cont_ghi789',
        container_number: 'MSCU1234567',
        full_out_at: '2025-02-10T07:30:00Z',
        terminal_name: 'APM Los Angeles',
      },
    },
  },
  {
    type: 'tracking_request.created',
    label: 'Tracking Started',
    description: 'Triggered when a new tracking request is created and acknowledged',
    category: 'Tracking',
    payload: {
      id: 'evt_abc131',
      type: 'tracking_request.created',
      created_at: '2025-02-01T12:00:00Z',
      data: {
        tracking_request_id: 'tr_jkl012',
        request_number: 'MSCU1234567',
        request_type: 'container',
        shipping_line_scac: 'MSCU',
        status: 'pending',
      },
    },
  },
  {
    type: 'tracking_request.failed',
    label: 'Tracking Failed',
    description: 'Triggered when a tracking request cannot be fulfilled',
    category: 'Tracking',
    payload: {
      id: 'evt_abc132',
      type: 'tracking_request.failed',
      created_at: '2025-02-01T12:30:00Z',
      data: {
        tracking_request_id: 'tr_jkl013',
        request_number: 'INVALID123',
        request_type: 'container',
        status: 'failed',
        failed_reason: 'not_found',
        error_message: 'Container number not found in carrier system',
      },
    },
  },
];

const webhookHandlerCode = `// Example: Express.js webhook handler
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Verify webhook signature (recommended)
function verifySignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Webhook endpoint
app.post('/webhooks/terminal49', (req, res) => {
  const signature = req.headers['x-t49-signature'];
  const webhookSecret = process.env.WEBHOOK_SECRET;

  // Verify signature
  if (!verifySignature(req.body, signature, webhookSecret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;

  // Handle different event types
  switch (event.type) {
    case 'container.availability.changed':
      handleAvailabilityChange(event.data);
      break;
    case 'container.lfd.updated':
      handleLfdUpdate(event.data);
      break;
    case 'container.hold.added':
      handleHoldAdded(event.data);
      break;
    // ... handle other events
  }

  // Always respond with 200 to acknowledge receipt
  res.status(200).json({ received: true });
});

// Event handlers
function handleAvailabilityChange(data) {
  if (data.available_for_pickup) {
    // Notify operations team
    sendNotification(\`Container \${data.container_number} is ready for pickup!\`);
    // Update your TMS
    updateTMS(data.container_id, { status: 'available' });
  }
}

function handleLfdUpdate(data) {
  const daysUntilLfd = calculateDaysUntil(data.pickup_lfd);
  if (daysUntilLfd <= 2) {
    // Urgent notification
    sendAlert(\`URGENT: LFD for \${data.container_number} is in \${daysUntilLfd} days!\`);
  }
}

function handleHoldAdded(data) {
  // Log the hold for compliance
  logHold(data);
  // Notify compliance team
  sendNotification(\`Hold placed on \${data.container_number}: \${data.hold_type}\`);
}`;

const categories = ['All', 'Shipment', 'Container', 'Tracking'];

export default function WebhooksPage() {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedEvent, setSelectedEvent] = useState<EventExample | null>(webhookEvents[0]);

  const filteredEvents =
    selectedCategory === 'All'
      ? webhookEvents
      : webhookEvents.filter((e) => e.category === selectedCategory);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Webhooks"
        description="Explore webhook event types and payload structures"
      />

      <div className="flex-1 p-6 space-y-6">
        {/* Info Banner */}
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800">
          <p className="font-medium">Webhook Event Simulator</p>
          <p className="text-sm mt-1">
            This page demonstrates webhook event structures. To configure real webhooks, visit the{' '}
            <a
              href="https://app.terminal49.com/settings/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-600"
            >
              Terminal49 Dashboard
            </a>
            .
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-kumo-recessed text-kumo-secondary hover:bg-kumo-elevated'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Event Selector and Payload Display */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Event List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Event Types ({filteredEvents.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {filteredEvents.map((event) => (
                  <button
                    key={event.type}
                    onClick={() => setSelectedEvent(event)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedEvent?.type === event.type
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-kumo-recessed hover:bg-kumo-elevated'
                    }`}
                  >
                    <p className="font-medium text-sm">{event.label}</p>
                    <p className="text-xs text-kumo-muted mt-1">{event.type}</p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Event Details */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>
                {selectedEvent ? selectedEvent.label : 'Select an Event'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedEvent ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Event Type</p>
                    <code className="px-2 py-1 rounded bg-kumo-recessed text-sm font-mono">
                      {selectedEvent.type}
                    </code>
                  </div>

                  <div>
                    <p className="text-sm text-kumo-secondary mb-1">Description</p>
                    <p className="text-kumo-default">{selectedEvent.description}</p>
                  </div>

                  <div>
                    <p className="text-sm text-kumo-secondary mb-2">Example Payload</p>
                    <pre className="p-4 rounded-lg bg-kumo-recessed overflow-x-auto text-sm max-h-80">
                      <code>{JSON.stringify(selectedEvent.payload, null, 2)}</code>
                    </pre>
                  </div>
                </div>
              ) : (
                <p className="text-kumo-muted text-center py-8">
                  Select an event type to see its payload structure
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Webhook Handler Example */}
        <Card>
          <CardHeader>
            <CardTitle>Webhook Handler Example</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-kumo-secondary mb-4">
              Here's an example of how to handle Terminal49 webhooks in your application:
            </p>
            <CodePanel title="webhook-handler.js" code={webhookHandlerCode} collapsible={false} />
          </CardContent>
        </Card>

        {/* Best Practices */}
        <Card>
          <CardHeader>
            <CardTitle>Webhook Best Practices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">✅ Do</h4>
                <ul className="space-y-2 text-sm text-kumo-secondary">
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span>
                    <span>Verify webhook signatures to ensure authenticity</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span>
                    <span>Respond with 200 status immediately, process async</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span>
                    <span>Implement idempotency to handle duplicate deliveries</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span>
                    <span>Log all webhook events for debugging</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-500">•</span>
                    <span>Set up alerting for webhook failures</span>
                  </li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">❌ Don't</h4>
                <ul className="space-y-2 text-sm text-kumo-secondary">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500">•</span>
                    <span>Don't do heavy processing before responding</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500">•</span>
                    <span>Don't rely on webhooks as the only data source</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500">•</span>
                    <span>Don't ignore webhook signature verification</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500">•</span>
                    <span>Don't assume events arrive in order</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500">•</span>
                    <span>Don't expose your webhook endpoint publicly</span>
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SDK Note */}
        <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800">
          <p className="font-medium">SDK Note</p>
          <p className="text-sm mt-1">
            The Terminal49 TypeScript SDK does not currently include methods for webhook management
            (create, list, update, delete). Webhooks are configured through the Terminal49 web
            dashboard. This is a known gap that may be addressed in future SDK versions.
          </p>
        </div>
      </div>
    </div>
  );
}
