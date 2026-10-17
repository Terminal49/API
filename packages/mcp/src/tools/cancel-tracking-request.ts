/**
 * cancel_tracking_request tool (tier C)
 * Cancels a tracking request that Terminal49 is still working on, such as
 * one with a typo or the wrong carrier. It cannot be undone, so it needs a
 * confirmed preview.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { ToolContext } from './context.js';
import {
  executeGetTrackingRequest,
  type GetTrackingRequestResult,
} from './get-tracking-request.js';
import { httpStatus, type SoftResult } from './soft-results.js';
import {
  confirmationTokenInput,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  confirmedWriteResultSchema,
  runConfirmedWrite,
  WRITE_RATE_LIMITED,
  type WriteRateLimited,
} from './write-kit.js';

/** The only statuses the API lets a caller cancel. */
export const CANCELLABLE_STATUSES = ['pending', 'awaiting_manifest'] as const;

export const cancelTrackingRequestInputSchema = z
  .object({
    tracking_request_id: z
      .string()
      .uuid()
      .describe(
        'The Terminal49 tracking request ID (UUID format). Identifier only; never pass conversation text.',
      ),
    confirmation_token: confirmationTokenInput,
  })
  .strict();

export type CancelTrackingRequestArgs = z.input<
  typeof cancelTrackingRequestInputSchema
>;

const trackingRequestSummarySchema = z.object({
  id: z.string(),
  request_number: z.string().nullable(),
  request_type: z.string().nullable(),
  scac: z.string().nullable(),
  status: z.string().nullable(),
  failed_reason: z.string().nullable(),
});

type TrackingRequestSummary = z.infer<typeof trackingRequestSummarySchema>;

const cancelPreviewSchema = z.object({
  current: trackingRequestSummarySchema,
  proposed: z.object({ status: z.literal('cancelled') }),
  reach: z.string(),
});

type CancelPreview = z.infer<typeof cancelPreviewSchema>;

export const cancelTrackingRequestOutputSchema = confirmedWriteResultSchema(
  cancelPreviewSchema,
  { tracking_request: trackingRequestSummarySchema.optional() },
);

const CANCEL_REACH =
  'This cannot be undone. Terminal49 stops working on this request and it never creates a shipment. To track the number later, create a new tracking request.';

export interface NotCancellableResult extends SoftResult<'not_cancellable'> {
  tracking_request: TrackingRequestSummary;
}

interface CancelledResult {
  status: 'cancelled';
  message: string;
  tracking_request: TrackingRequestSummary;
}

/** Terminal49 refused the cancel with 422, but the request is still cancellable. */
interface CancelUnchangedResult {
  status: 'noop';
  message: string;
  alternative: string;
  tracking_request: TrackingRequestSummary;
}

export type CancelTrackingRequestResult = ConfirmedWriteResult<
  CancelPreview,
  NotCancellableResult,
  | CancelledResult
  | CancelUnchangedResult
  | NotCancellableResult
  | WriteRateLimited
>;

function summarize(request: GetTrackingRequestResult): TrackingRequestSummary {
  return {
    id: request.id,
    request_number: request.request_number,
    request_type: request.request_type,
    scac: request.scac,
    status: request.status,
    failed_reason: request.failed_reason,
  };
}

function isCancellable(status: string | null): boolean {
  return CANCELLABLE_STATUSES.some((cancellable) => cancellable === status);
}

function notCancellable(request: TrackingRequestSummary): NotCancellableResult {
  return {
    error: 'not_cancellable',
    message: `Only a pending or awaiting_manifest tracking request can be cancelled. This one is ${request.status ?? 'in an unknown status'}. Nothing was changed.`,
    alternative:
      request.status === 'created'
        ? 'The request already created a shipment. To stop its updates, stop tracking that shipment instead.'
        : 'Nothing needs to be cancelled.',
    tracking_request: request,
  };
}

function cancelUnchanged(
  request: TrackingRequestSummary,
): CancelUnchangedResult {
  return {
    status: 'noop',
    message: `Terminal49 would not cancel this tracking request in its current state. It is still ${request.status}. Nothing was changed.`,
    alternative:
      'Show the user the current status. To cancel it, use the Terminal49 dashboard or contact Terminal49 support.',
    tracking_request: request,
  };
}

export async function executeCancelTrackingRequest(
  args: CancelTrackingRequestArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<CancelTrackingRequestResult> {
  const parsed = cancelTrackingRequestInputSchema.parse(args);
  const id = parsed.tracking_request_id;
  const read = async () =>
    summarize(await executeGetTrackingRequest({ id }, client));

  return runConfirmedWrite(context, {
    tool: 'cancel_tracking_request',
    entityType: 'tracking_request',
    entityId: id,
    args: parsed,
    async read(): Promise<
      ConfirmedWriteRead<CancelPreview, NotCancellableResult>
    > {
      const current = await read();
      if (!isCancellable(current.status)) {
        return { stop: notCancellable(current) };
      }
      return {
        state: { status: current.status },
        preview: {
          current,
          proposed: { status: 'cancelled' },
          reach: CANCEL_REACH,
        },
      };
    },
    async write({ current }) {
      try {
        await client.trackingRequests.cancel(id, { format: 'raw' });
      } catch (error) {
        if (httpStatus(error) === 422) {
          const after = await read();
          return isCancellable(after.status)
            ? cancelUnchanged(after)
            : notCancellable(after);
        }
        if (httpStatus(error) === 429) return { ...WRITE_RATE_LIMITED };
        throw error;
      }
      // The cancel response body is empty, so read the request again for
      // the status it ended in. The cancel already happened, so a failed
      // read must not report it as an error.
      const after = await read().catch(() => ({
        ...current,
        status: 'cancelled',
      }));
      return {
        status: 'cancelled' as const,
        message:
          'Tracking request cancelled. It will not create a shipment. This cannot be undone.',
        tracking_request: after,
      };
    },
  });
}
