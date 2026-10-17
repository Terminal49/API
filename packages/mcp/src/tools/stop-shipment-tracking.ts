/**
 * stop_shipment_tracking tool (tier C)
 * Stops carrier and terminal updates for a shipment and its containers. It
 * needs a confirmed preview because updates published while tracking is
 * stopped may never come back after a resume.
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
  WRITE_RATE_LIMITED,
  type WriteRateLimited,
} from './shipment-tracking.js';
import { httpStatus, isFeatureNotEnabled } from './soft-results.js';
import {
  confirmationTokenInput,
  confirmedWriteResultSchema,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  runConfirmedWrite,
} from './write-kit.js';

export const stopShipmentTrackingInputSchema = z
  .object({
    shipment_id: shipmentIdInput,
    confirmation_token: confirmationTokenInput,
  })
  .strict();

export type StopShipmentTrackingArgs = z.input<
  typeof stopShipmentTrackingInputSchema
>;

const stopPreviewSchema = z.object({
  current: shipmentTrackingSchema,
  proposed: z.object({ tracking: z.literal('stopped') }),
  reach: z.string(),
});

export type StopPreview = z.infer<typeof stopPreviewSchema>;

export const stopShipmentTrackingOutputSchema = confirmedWriteResultSchema(
  stopPreviewSchema,
  {
    shipment: shipmentTrackingSchema.optional(),
    undo: z.string().optional(),
  },
);

const STOP_REACH =
  'Every container on this shipment stops getting carrier and terminal updates. Resuming later may leave updates from the stopped period missing.';

interface StopOutcome {
  status: 'stopped' | 'already_stopped';
  message: string;
  shipment: ShipmentTracking;
  undo?: 'resume_shipment_tracking';
}

type StopSoftResult =
  | TrackingUnchanged
  | StopTrackingNotEnabled
  | WriteRateLimited;

function alreadyStopped(shipment: ShipmentTracking): StopOutcome {
  return {
    status: 'already_stopped',
    message:
      'Terminal49 already stopped tracking this shipment. Nothing was changed.',
    shipment,
  };
}

type StopEarly = StopOutcome | StopTrackingNotEnabled;

export type StopShipmentTrackingResult = ConfirmedWriteResult<
  StopPreview,
  StopEarly,
  StopOutcome | StopSoftResult
>;

async function stopTrackingEnabled(context: ToolContext): Promise<boolean> {
  const { features } = await context.me();
  return features.stop_tracking?.status === 'available';
}

export async function executeStopShipmentTracking(
  args: StopShipmentTrackingArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<StopShipmentTrackingResult> {
  const parsed = stopShipmentTrackingInputSchema.parse(args);
  const { shipment_id } = parsed;
  return runConfirmedWrite(context, {
    tool: 'stop_shipment_tracking',
    entityType: 'shipment',
    entityId: shipment_id,
    args: parsed,
    async read(): Promise<ConfirmedWriteRead<StopPreview, StopEarly>> {
      if (!(await stopTrackingEnabled(context))) {
        return { stop: { ...STOP_TRACKING_NOT_ENABLED } };
      }
      const current = await readShipmentTracking(client, shipment_id);
      if (current.tracking === 'stopped') {
        return { stop: alreadyStopped(current) };
      }
      return {
        // The preview's facts: a token stops working if the shipment gains
        // containers or changes its Bill of Lading before the user approves.
        state: {
          bill_of_lading: current.bill_of_lading,
          container_count: current.container_count,
          tracking_stopped_at: current.tracking_stopped_at,
        },
        preview: {
          current,
          proposed: { tracking: 'stopped' },
          reach: STOP_REACH,
        },
      };
    },
    async write(): Promise<StopOutcome | StopSoftResult> {
      try {
        const raw = await client.shipments.stopTracking(shipment_id, {
          format: 'raw',
        });
        return {
          status: 'stopped',
          message:
            'Tracking stopped. This shipment and its containers get no more updates until tracking is resumed.',
          shipment: parseShipmentTracking(raw),
          undo: 'resume_shipment_tracking',
        };
      } catch (error) {
        if (isFeatureNotEnabled(error)) return { ...STOP_TRACKING_NOT_ENABLED };
        if (httpStatus(error) === 429) return { ...WRITE_RATE_LIMITED };
        if (httpStatus(error) === 422) {
          const after = await readShipmentTracking(client, shipment_id);
          return after.tracking === 'stopped'
            ? alreadyStopped(after)
            : trackingUnchanged('stop', after);
        }
        throw error;
      }
    },
  });
}
