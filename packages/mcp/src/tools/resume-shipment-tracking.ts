/**
 * resume_shipment_tracking tool (tier A)
 * Starts tracking a shipment again after it was stopped. It undoes
 * stop_shipment_tracking, so it runs in one call.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  parseShipmentTracking,
  readShipmentTracking,
  type ShipmentTracking,
  shipmentIdInput,
  shipmentTrackingSchema,
  STOP_TRACKING_NOT_ENABLED,
  type StopTrackingNotEnabled,
  trackingUnchanged,
  type TrackingUnchanged,
} from './shipment-tracking.js';
import { httpStatus, isFeatureNotEnabled } from './soft-results.js';
import {
  runWrite,
  type WriteRateLimited,
  writeResultSchema,
} from './write-kit.js';

export const resumeShipmentTrackingInputSchema = z
  .object({ shipment_id: shipmentIdInput })
  .strict();

export type ResumeShipmentTrackingArgs = z.input<
  typeof resumeShipmentTrackingInputSchema
>;

export const resumeShipmentTrackingOutputSchema = writeResultSchema({
  shipment: shipmentTrackingSchema.optional(),
  undo: z.string().optional(),
});

export const RESUME_NOTE =
  'Tracking resumed. Updates the carrier published while tracking was stopped may be missing. A resumed shipment can count against tracking limits.';

export type ResumeShipmentTrackingResult =
  | {
      status: 'resumed' | 'already_tracking';
      message: string;
      shipment: ShipmentTracking;
      undo?: 'stop_shipment_tracking';
    }
  | TrackingUnchanged
  | StopTrackingNotEnabled
  | WriteRateLimited;

function alreadyTracking(shipment: ShipmentTracking) {
  return {
    status: 'already_tracking' as const,
    message:
      'Terminal49 is already tracking this shipment. Nothing was changed.',
    shipment,
  };
}

export async function executeResumeShipmentTracking(
  args: ResumeShipmentTrackingArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<ResumeShipmentTrackingResult> {
  const { shipment_id } = resumeShipmentTrackingInputSchema.parse(args);
  return runWrite(
    context,
    {
      tool: 'resume_shipment_tracking',
      entityType: 'shipment',
      entityId: shipment_id,
    },
    async (): Promise<ResumeShipmentTrackingResult> => {
      const current = await readShipmentTracking(client, shipment_id);
      if (current.tracking === 'active') return alreadyTracking(current);

      try {
        const raw = await client.shipments.resumeTracking(shipment_id, {
          format: 'raw',
        });
        return {
          status: 'resumed',
          message: RESUME_NOTE,
          shipment: parseShipmentTracking(raw),
          undo: 'stop_shipment_tracking',
        };
      } catch (error) {
        if (isFeatureNotEnabled(error)) return { ...STOP_TRACKING_NOT_ENABLED };
        if (httpStatus(error) === 422) {
          const after = await readShipmentTracking(client, shipment_id);
          return after.tracking === 'active'
            ? alreadyTracking(after)
            : trackingUnchanged('resume', after);
        }
        throw error;
      }
    },
  );
}
