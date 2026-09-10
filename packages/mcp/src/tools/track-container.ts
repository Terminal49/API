/**
 * track_container tool
 * Creates a tracking request for a container/BL/booking number and returns the container details
 */

import { NotFoundError, Terminal49Client } from '@terminal49/sdk';
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

function inferScacFromPrefix(number: string): string | undefined {
  const match = number.match(/^([A-Za-z]{4})/);
  return match ? match[1].toUpperCase() : undefined;
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

function hasValidIso6346CheckDigit(number: string): boolean {
  if (!/^[A-Z]{4}\d{7}$/.test(number)) {
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

async function findExistingTrackedContainer(
  number: string,
  client: Terminal49Client,
): Promise<{ id: string; shippingLine?: string } | null> {
  if (typeof (client as any).search !== 'function') {
    return null;
  }

  try {
    const result = await executeSearchContainer({ query: number }, client);
    if (!Array.isArray(result.containers) || result.containers.length === 0) {
      return null;
    }

    const exactMatch = result.containers.find(
      (container) =>
        normalizeTrackingNumber(container.container_number) === number,
    );
    const match =
      exactMatch ??
      (result.containers.length === 1 ? result.containers[0] : null);
    if (!match?.id) {
      return null;
    }

    return {
      id: match.id,
      shippingLine: normalizeText(match.shipping_line),
    };
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
  const heuristicScac = inferScacFromPrefix(number);
  const inferredNumberType =
    numberTypeOverride || inferNumberTypeFromPattern(number);

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'track_container',
    number,
    scac: requestedScac || heuristicScac,
    timestamp: new Date().toISOString(),
  });

  try {
    const existingContainer = await findExistingTrackedContainer(
      number,
      client,
    );
    if (existingContainer?.id) {
      let containerDetails: Awaited<ReturnType<typeof executeGetContainer>>;
      try {
        containerDetails = await executeGetContainer(
          { id: existingContainer.id },
          client,
        );
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
        return {
          error: 'ContainerUnavailable',
          message:
            'A tracked container matched this number, but its details are not available yet. Retry the container lookup shortly.',
          tracking_request_created: false,
          container: { id: existingContainer.id },
        };
      }
      return {
        ...containerDetails,
        tracking_request_created: false,
        infer_result: {
          inferred_type: inferredNumberType,
          selected_scac:
            requestedScac || existingContainer.shippingLine || heuristicScac,
          source: 'search_match',
        },
      };
    }

    const selectedScac = requestedScac || heuristicScac;
    let infer: any;
    let trackingRequest: any;

    // Step 1: Infer + create tracking request
    try {
      const inferResult = await client.createTrackingRequestFromInfer(number, {
        scac: selectedScac,
        numberType: numberTypeOverride,
        refNumbers: args.refNumbers,
      });
      infer = inferResult.infer;
      trackingRequest = inferResult.trackingRequest;
    } catch (error) {
      const message = (error as Error).message;
      const pointer = parseValidationPointer(message);
      const canFallbackToDirectCreate = Boolean(
        inferredNumberType && selectedScac,
      );

      if (
        (pointer === '/data/attributes/number' || /infer/i.test(message)) &&
        canFallbackToDirectCreate
      ) {
        infer = {
          fallback: 'create_tracking_request',
          inferred_type: inferredNumberType,
          selected_scac: selectedScac,
          reason:
            'infer endpoint returned validation error; used direct create_tracking_request flow',
        };
        trackingRequest = await client.createTrackingRequest({
          requestType: inferredNumberType as any,
          requestNumber: number,
          scac: selectedScac,
          refNumbers: args.refNumbers,
        });
      } else {
        throw error;
      }
    }

    // Extract container ID from the tracking response
    const containerId = extractContainerId(trackingRequest);

    if (!containerId) {
      logMcpEvent({
        event: 'tracking_request.pending',
        number,
        numberType: numberTypeOverride,
        scac: requestedScac || heuristicScac,
        timestamp: new Date().toISOString(),
      });

      return {
        tracking_request_created: true,
        infer_result: infer,
        tracking_request: {
          request_number: number,
          number_type: inferredNumberType,
          scac: requestedScac || heuristicScac,
        },
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
        tracking_request: {
          request_number: number,
          number_type: inferredNumberType,
          scac: requestedScac || heuristicScac,
          container_id: containerId,
        },
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
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = (error as Error).message;

    if (isNotFound(error)) {
      logMcpEvent({
        event: 'tracking_request.not_found',
        number,
        numberType: inferredNumberType,
        scac: requestedScac || heuristicScac,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });
      return {
        error: 'NotFound',
        message: `No container found for identifier ${number}. Verify the number and carrier SCAC.`,
        tracking_request_created: false,
      };
    }

    if (
      /Unable to infer/.test(message) ||
      /SCAC/.test(message) ||
      /request_number/.test(message) ||
      /request type/.test(message) ||
      /\/data\/attributes\/number/.test(message)
    ) {
      logMcpEvent({
        event: 'tracking_request.hint',
        number,
        message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(
        `${message}. Automatic inference is currently unavailable for this input. Provide numberType (` +
          'container | booking_number | bill_of_lading) and scac, or use search_container/get_container if it is already tracked.',
      );
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

    throw error;
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
