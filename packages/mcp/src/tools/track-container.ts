/**
 * track_container tool
 * Creates a tracking request for a container/BL/booking number and returns the container details
 */

import {
  NotFoundError,
  Terminal49Client,
  ValidationError,
} from '@terminal49/sdk';
import { z } from 'zod';
import { logMcpEvent } from '../logging.js';
import { executeGetContainer } from './get-container.js';
import { executeSearchContainer } from './search-container.js';

export interface TrackContainerArgs {
  number: string;
  numberType?: string;
  containerNumber?: string;
  bookingNumber?: string;
  scac?: string;
  refNumbers?: string[];
}

function normalizeText(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }

  return text.toUpperCase();
}

function normalizeTrackingNumber(value: string): string {
  return value.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeNumberType(value: string | undefined): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'BOOKING') {
    return 'booking_number';
  }

  if (normalized === 'BOOKING_NUMBER') {
    return 'booking_number';
  }

  if (normalized === 'CONTAINER') {
    return 'container';
  }

  if (
    normalized === 'BL' ||
    normalized === 'B/L' ||
    normalized === 'BILL_OF_LADING'
  ) {
    return 'bill_of_lading';
  }

  return normalized;
}

function inferNumberTypeFromPattern(number: string): string | undefined {
  if (/^[A-Z]{4}\d{7}$/.test(number)) {
    return 'container';
  }

  return undefined;
}

const ISO_6346_LETTER_VALUES: Record<string, number> = {
  A: 10,
  B: 12,
  C: 13,
  D: 14,
  E: 15,
  F: 16,
  G: 17,
  H: 18,
  I: 19,
  J: 20,
  K: 21,
  L: 23,
  M: 24,
  N: 25,
  O: 26,
  P: 27,
  Q: 28,
  R: 29,
  S: 30,
  T: 31,
  U: 32,
  V: 34,
  W: 35,
  X: 36,
  Y: 37,
  Z: 38,
};

class ContainerCheckDigitError extends Error {
  constructor(number: string) {
    super(`Container number ${number} fails the ISO 6346 check digit`);
    this.name = 'ContainerCheckDigitError';
  }
}

/** A track_container failure whose message is written for the caller. */
export class TrackContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackContainerError';
  }
}

function inputRequiredError(
  error: unknown,
  number: string,
): TrackContainerError | undefined {
  const message = (error as Error).message ?? '';
  if (message.startsWith('Unable to infer carrier SCAC')) {
    return new TrackContainerError(
      `Terminal49 could not infer the carrier for ${number}; scac is required.`,
    );
  }
  if (message.startsWith('Unable to infer tracking number type')) {
    return new TrackContainerError(
      `Terminal49 could not tell whether ${number} is a container, bill of lading, or booking number; ` +
        'numberType is required (container, bill_of_lading, or booking_number).',
    );
  }
  return undefined;
}

const rejectionBodySchema = z.object({
  errors: z.union([
    z.string(),
    z.array(
      z.object({
        code: z.string().nullish(),
        detail: z.string().nullish(),
        source: z.object({ pointer: z.string().nullish() }).nullish(),
        meta: z
          .object({
            tracking_request_id: z.string().nullish(),
            shipment_id: z.string().nullish(),
          })
          .nullish(),
      }),
    ),
  ]),
});

/** Why the API refused to create a tracking request, parsed from its 4xx body. */
type TrackingRequestRejection =
  | {
      kind: 'duplicate';
      detail: string;
      trackingRequestId?: string;
      shipmentId?: string;
    }
  /** Quota, credit, party, and other refusals whose detail is written for the user. */
  | { kind: 'refused'; detail: string }
  | { kind: 'invalid_identifier' };

const ACCOUNT_REJECTION_CODES = new Set([
  'tracking_slot_limit_reached',
  'insufficient_credits',
]);
const IDENTIFIER_POINTER =
  /^\/data\/attributes\/(?:request_number|request_type|number|scac)$/;
/**
 * Codes that mean the number, type, or SCAC itself is wrong. Other codes on
 * the same attributes are account or carrier refusals, such as
 * container_number_tracking_disabled or no_container_request_type_support,
 * whose detail tells the user what to do instead.
 */
const IDENTIFIER_CODES = new Set([
  'blank',
  'too_short',
  'invalid_chars',
  'invalid_format',
  'invalid_container',
  'invalid_container_for_bl',
  'invalid_request_type',
  'not_recognized',
]);

function parseRejection(error: unknown): TrackingRequestRejection | undefined {
  if (!(error instanceof ValidationError)) {
    return undefined;
  }
  const body = rejectionBodySchema.safeParse(error.details);
  if (!body.success) {
    return undefined;
  }
  const { errors } = body.data;
  if (typeof errors === 'string') {
    return { kind: 'refused', detail: errors };
  }
  for (const entry of errors) {
    if (entry.code === 'duplicate') {
      return {
        kind: 'duplicate',
        detail: entry.detail ?? 'This number is already being tracked.',
        trackingRequestId: entry.meta?.tracking_request_id ?? undefined,
        shipmentId: entry.meta?.shipment_id ?? undefined,
      };
    }
    if (entry.code && ACCOUNT_REJECTION_CODES.has(entry.code) && entry.detail) {
      return { kind: 'refused', detail: entry.detail };
    }
  }
  if (
    errors.some(
      (entry) =>
        IDENTIFIER_POINTER.test(entry.source?.pointer ?? '') &&
        (!entry.code || IDENTIFIER_CODES.has(entry.code)),
    )
  ) {
    return { kind: 'invalid_identifier' };
  }
  // infer_number rejects an unusable number with a bare detail: no code, no pointer.
  if (
    errors.length > 0 &&
    errors.every((entry) => !entry.code && !entry.source?.pointer)
  ) {
    return { kind: 'invalid_identifier' };
  }
  const details = errors.flatMap((entry) =>
    entry.detail ? [entry.detail] : [],
  );
  return details.length > 0
    ? { kind: 'refused', detail: details.join(' ') }
    : undefined;
}

/**
 * The existing request can be stored under a different number than the one
 * submitted (the API names it in the detail), so the result carries only its id.
 */
function duplicateResult(
  rejection: Extract<TrackingRequestRejection, { kind: 'duplicate' }>,
) {
  return {
    tracking_request_created: false,
    source: 'duplicate',
    message: rejection.detail,
    tracking_request: { id: rejection.trackingRequestId },
    shipment_id: rejection.shipmentId,
  };
}

/**
 * Describes the request the API created. The submitted values are fallbacks
 * for a response that leaves an attribute out.
 */
function createdRequest(
  trackingRequest: any,
  submitted: {
    number: string;
    numberType: string | undefined;
    scac: string | undefined;
  },
) {
  const attributes = trackingRequest?.data?.attributes;
  return {
    id: trackingRequest?.data?.id,
    request_number: attributes?.request_number || submitted.number,
    number_type: attributes?.request_type || submitted.numberType,
    scac: attributes?.scac || submitted.scac,
  };
}

function hasValidIso6346CheckDigit(number: string): boolean {
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(number)) {
    return true;
  }

  let sum = 0;
  for (const [index, character] of [...number.slice(0, 10)].entries()) {
    const value = /\d/.test(character)
      ? Number(character)
      : ISO_6346_LETTER_VALUES[character];
    if (value === undefined) {
      return false;
    }
    sum += value * 2 ** index;
  }

  return (sum % 11) % 10 === Number(number.at(-1));
}

function parseValidationPointer(message: string): string | undefined {
  const pointerMatch = message.match(/\((\/data\/attributes\/[a-z_]+)\)/i);
  return pointerMatch?.[1];
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof NotFoundError ||
    (error as { status?: number })?.status === 404 ||
    (error as { name?: string })?.name === 'NotFoundError'
  );
}

type ExistingTracking =
  | {
      kind: 'containers';
      /** Every container whose number is exactly the one searched, in search order. */
      matches: Array<{ id: string; shippingLine?: string }>;
    }
  | {
      kind: 'pending_request';
      id: string;
      status: string;
      requestNumber: string;
      scac?: string;
    };

/**
 * Tracking request statuses the API still treats as in progress: it rejects a
 * new request for the same number while one is in either status. Search never
 * returns `created` requests, so a succeeded request surfaces as its container.
 */
const IN_PROGRESS_REQUEST_STATUSES: ReadonlySet<string> = new Set([
  'pending',
  'awaiting_manifest',
]);

/**
 * Finds an in-progress tracking request for `number`, or else the containers
 * whose number is exactly `number`. The API rejects a second request for a
 * number only under the same carrier, so an in-progress request under another
 * SCAC is ignored when the caller names one: retracking under the right
 * carrier must reach the API. Search matches substrings and reference
 * numbers, so a container with another number never counts.
 */
async function findExistingTracking(
  number: string,
  requestedScac: string | undefined,
  client: Terminal49Client,
): Promise<ExistingTracking | null> {
  if (typeof (client as any).search !== 'function') {
    return null;
  }

  try {
    const result = await executeSearchContainer({ query: number }, client);

    const pending = result.tracking_requests.find(
      (request) =>
        IN_PROGRESS_REQUEST_STATUSES.has(request.status) &&
        normalizeTrackingNumber(request.request_number) === number &&
        (!requestedScac || normalizeText(request.scac) === requestedScac),
    );
    if (pending) {
      return {
        kind: 'pending_request',
        id: pending.id,
        status: pending.status,
        requestNumber: pending.request_number,
        scac: pending.scac,
      };
    }

    const matches = result.containers.flatMap((candidate) =>
      candidate.id &&
      normalizeTrackingNumber(candidate.container_number) === number
        ? [
            {
              id: candidate.id,
              shippingLine: normalizeText(candidate.shipping_line),
            },
          ]
        : [],
    );
    return matches.length > 0 ? { kind: 'containers', matches } : null;
  } catch {
    return null;
  }
}

export async function executeTrackContainer(
  args: TrackContainerArgs,
  client: Terminal49Client,
): Promise<any> {
  const number = normalizeTrackingNumber(
    args.number || args.containerNumber || args.bookingNumber || '',
  );
  if (!number) {
    throw new Error('number is required');
  }
  if (!hasValidIso6346CheckDigit(number)) {
    throw new ContainerCheckDigitError(number);
  }

  const numberTypeOverride = normalizeNumberType(
    args.numberType ||
      (args.containerNumber
        ? 'container'
        : args.bookingNumber
          ? 'booking_number'
          : undefined),
  );
  const requestedScac = normalizeText(args.scac);
  const inferredNumberType =
    numberTypeOverride || inferNumberTypeFromPattern(number);

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'track_container',
    number,
    scac: requestedScac,
    timestamp: new Date().toISOString(),
  });

  try {
    const existing = await findExistingTracking(number, requestedScac, client);
    if (existing?.kind === 'pending_request') {
      return {
        tracking_request_created: false,
        source: 'search_match',
        message: `${number} already has a tracking request in progress.`,
        tracking_request: {
          id: existing.id,
          status: existing.status,
          request_number: existing.requestNumber,
          scac: existing.scac,
        },
      };
    }
    if (existing?.kind === 'containers') {
      // Search also returns containers whose shipment stopped tracking. The
      // API accepts a new request for such a container, as container numbers
      // are reused on later voyages, so only a tracked one ends the call here.
      let unavailableId: string | undefined;
      for (const match of existing.matches) {
        let containerDetails: Awaited<ReturnType<typeof executeGetContainer>>;
        try {
          containerDetails = await executeGetContainer(
            { id: match.id },
            client,
          );
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
          unavailableId ??= match.id;
          continue;
        }
        if (!containerDetails.shipment?.line_tracking_stopped_at) {
          return {
            ...containerDetails,
            tracking_request_created: false,
            infer_result: {
              inferred_type: inferredNumberType,
              selected_scac: requestedScac || match.shippingLine,
              source: 'search_match',
            },
          };
        }
      }
      if (unavailableId) {
        return {
          error: 'ContainerUnavailable',
          message:
            'A tracked container matched this number, but its details are not available yet. Retry the container lookup shortly.',
          tracking_request_created: false,
          container: { id: unavailableId },
        };
      }
    }

    let infer: any;
    let trackingRequest: any;

    // Step 1: Infer + create tracking request
    try {
      const inferResult = await client.createTrackingRequestFromInfer(number, {
        scac: requestedScac,
        numberType: numberTypeOverride,
        refNumbers: args.refNumbers,
      });
      infer = inferResult.infer;
      trackingRequest = inferResult.trackingRequest;
    } catch (error) {
      const message = (error as Error).message;
      const pointer = parseValidationPointer(message);
      const canFallbackToDirectCreate = Boolean(
        inferredNumberType && requestedScac,
      );

      if (
        (pointer === '/data/attributes/number' || /infer/i.test(message)) &&
        canFallbackToDirectCreate
      ) {
        infer = {
          fallback: 'create_tracking_request',
          inferred_type: inferredNumberType,
          selected_scac: requestedScac,
          reason:
            'infer endpoint returned validation error; used direct create_tracking_request flow',
        };
        trackingRequest = await client.createTrackingRequest({
          requestType: inferredNumberType as any,
          requestNumber: number,
          scac: requestedScac,
          refNumbers: args.refNumbers,
        });
      } else {
        throw inputRequiredError(error, number) ?? error;
      }
    }

    // Extract container ID from the tracking response
    const containerId = extractContainerId(trackingRequest);
    const created = createdRequest(trackingRequest, {
      number,
      numberType: inferredNumberType,
      scac: requestedScac,
    });

    if (!containerId) {
      logMcpEvent({
        event: 'tracking_request.pending',
        number,
        numberType: created.number_type,
        scac: created.scac,
        timestamp: new Date().toISOString(),
      });

      return {
        tracking_request_created: true,
        infer_result: infer,
        tracking_request: created,
      };
    }

    logMcpEvent({
      event: 'tracking_request.created',
      number,
      container_id: containerId,
      timestamp: new Date().toISOString(),
    });

    // Step 2: Get full container details using the ID. A newly-created request
    // can expose its relationship before the container read model is available.
    // Preserve the successful write state instead of misreporting the request as
    // uncreated when that follow-up read briefly returns 404.
    let containerDetails: Awaited<ReturnType<typeof executeGetContainer>>;
    try {
      containerDetails = await executeGetContainer({ id: containerId }, client);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      return {
        tracking_request_created: true,
        infer_result: infer,
        tracking_request: { ...created, container_id: containerId },
      };
    }

    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'track_container',
      number,
      container_id: containerId,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    return {
      ...containerDetails,
      tracking_request_created: true,
      infer_result: infer,
      tracking_request: created,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = (error as Error).message;

    if (isNotFound(error)) {
      logMcpEvent({
        event: 'tracking_request.not_found',
        number,
        numberType: inferredNumberType,
        scac: requestedScac,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });
      return {
        error: 'NotFound',
        message: `No container found for identifier ${number}. Verify the number and carrier SCAC.`,
        tracking_request_created: false,
      };
    }

    const rejection = parseRejection(error);
    if (rejection?.kind === 'duplicate') {
      logMcpEvent({
        event: 'tracking_request.duplicate',
        number,
        tracking_request_id: rejection.trackingRequestId,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });
      return duplicateResult(rejection);
    }

    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'track_container',
      number,
      error: (error as Error).name,
      message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    switch (rejection?.kind) {
      case 'refused':
        throw new TrackContainerError(rejection.detail);
      case 'invalid_identifier':
        throw new TrackContainerError(
          `Tracking identifier ${number} is invalid. Verify the identifier type and carrier SCAC.`,
        );
      default:
        throw error;
    }
  }
}

/**
 * Extract container ID from tracking request response
 */
function extractContainerId(response: any): string | null {
  // The tracking request response can have different formats:
  // 1. Direct container in included array
  // 2. Container reference in relationships
  // 3. Container ID in data

  // Check included array for container
  if (response.included && Array.isArray(response.included)) {
    const container = response.included.find(
      (item: any) => item.type === 'container',
    );
    if (container?.id) {
      return container.id;
    }
  }

  // Check relationships
  if (response.data?.relationships?.container?.data?.id) {
    return response.data.relationships.container.data.id;
  }

  // Check if data itself is the container
  if (response.data?.type === 'container' && response.data?.id) {
    return response.data.id;
  }

  // Check for containers array in relationships
  if (response.data?.relationships?.containers?.data?.[0]?.id) {
    return response.data.relationships.containers.data[0].id;
  }

  return null;
}
