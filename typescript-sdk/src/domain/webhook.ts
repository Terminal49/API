/**
 * Webhook domain models
 */

import type { BaseModel } from './common.js';

export interface Webhook extends BaseModel {
  type: 'webhook';

  // Configuration
  url?: string;
  eventTypes?: string[];
  secret?: string;
  active?: boolean;

  // Metadata
  createdAt?: string;
  updatedAt?: string;

  // Stats
  totalNotifications?: number;
  successfulNotifications?: number;
  failedNotifications?: number;

  raw?: unknown;
}

export interface WebhookNotification extends BaseModel {
  type: 'webhook_notification';

  // Details
  webhookId?: string;
  eventType?: string;
  url?: string;

  // Status
  status?: string;
  attemptCount?: number;
  lastAttemptAt?: string | null;

  // Response
  responseCode?: number | null;
  responseBody?: string | null;

  // Payload
  payload?: Record<string, unknown>;

  // Timestamps
  createdAt?: string;
  processedAt?: string | null;

  raw?: unknown;
}

/**
 * Webhook event types
 */
export enum WebhookEventType {
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
