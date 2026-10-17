/**
 * Reads whether Terminal49 is tracking a shipment, for the tools that stop
 * and resume it.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { nullableString, relationshipList } from './api-fields.js';
import type { SoftResult } from './soft-results.js';

export const shipmentIdInput = z
  .string()
  .uuid()
  .describe(
    'The Terminal49 shipment ID (UUID format). Identifier only; never pass conversation text.',
  );

export const shipmentTrackingSchema = z.object({
  id: z.string(),
  bill_of_lading: z.string().nullable(),
  shipping_line_scac: z.string().nullable(),
  /** Null when the API did not list the shipment's containers. */
  container_count: z.number().nullable(),
  tracking: z.enum(['active', 'stopped']),
  tracking_stopped_at: z.string().nullable(),
  tracking_stopped_reason: z.string().nullable(),
});

export type ShipmentTracking = z.infer<typeof shipmentTrackingSchema>;

const rawShipmentSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      bill_of_lading_number: nullableString,
      shipping_line_scac: nullableString,
      line_tracking_stopped_at: nullableString,
      line_tracking_stopped_reason: nullableString,
    }),
    relationships: z
      .object({ containers: relationshipList })
      .catch({ containers: null }),
  }),
});

/** Parses a raw GET, stop_tracking or resume_tracking shipment response. */
export function parseShipmentTracking(raw: unknown): ShipmentTracking {
  const { data } = rawShipmentSchema.parse(raw);
  const stoppedAt = data.attributes.line_tracking_stopped_at;
  return {
    id: data.id,
    bill_of_lading: data.attributes.bill_of_lading_number,
    shipping_line_scac: data.attributes.shipping_line_scac,
    container_count: data.relationships.containers?.data.length ?? null,
    tracking: stoppedAt ? 'stopped' : 'active',
    tracking_stopped_at: stoppedAt,
    tracking_stopped_reason: data.attributes.line_tracking_stopped_reason,
  };
}

export async function readShipmentTracking(
  client: Terminal49Client,
  id: string,
): Promise<ShipmentTracking> {
  return parseShipmentTracking(
    await client.shipments.get(id, false, { format: 'raw' }),
  );
}

export type StopTrackingNotEnabled = SoftResult<'FeatureNotEnabled'>;

export const STOP_TRACKING_NOT_ENABLED: StopTrackingNotEnabled = {
  error: 'FeatureNotEnabled',
  message:
    'Stopping and resuming shipment tracking is not enabled for this Terminal49 account or credential. Nothing was changed.',
  alternative:
    'Ask an account admin to enable it, or stop tracking from the Terminal49 dashboard.',
};

export type WriteRateLimited = SoftResult<'rate_limited'>;

export const WRITE_RATE_LIMITED: WriteRateLimited = {
  error: 'rate_limited',
  message:
    'Terminal49 is limiting how often this change can be made. Nothing was changed.',
  alternative: 'Wait a minute and try again.',
};

/** Terminal49 refused a stop or resume with 422 and the state did not change. */
export interface TrackingUnchanged {
  status: 'noop';
  message: string;
  alternative: string;
  shipment: ShipmentTracking;
}

export function trackingUnchanged(
  action: 'stop' | 'resume',
  shipment: ShipmentTracking,
): TrackingUnchanged {
  return {
    status: 'noop',
    message: `Terminal49 would not ${action} tracking for this shipment in its current state. Nothing was changed.`,
    alternative:
      'Show the user the current tracking state. To change it, use the Terminal49 dashboard or contact Terminal49 support.',
    shipment,
  };
}
