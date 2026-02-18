/**
 * track_container tool
 * Creates a tracking request for a container/BL/booking number and returns the container details
 */

import { Terminal49Client } from '@terminal49/sdk';
import { executeGetContainer } from './get-container.js';
import { executeSearchContainer } from './search-container.js';

export interface TrackContainerArgs {
  number?: string;
  numberType?: string;
  containerNumber?: string;
  bookingNumber?: string;
  scac?: string;
  refNumbers?: string[];
}

export const trackContainerTool = {
  name: 'track_container',
  description:
    'Track a container, bill of lading, or booking number. ' +
    'This will infer number type + carrier when possible, create a tracking request, ' +
    'and return detailed container information. Optionally provide SCAC or reference numbers.',
  inputSchema: {
    type: 'object',
    properties: {
      number: {
        type: 'string',
        description: 'Container, bill of lading, or booking number to track',
      },
      numberType: {
        type: 'string',
        description: 'Optional override: container | bill_of_lading | booking_number',
      },
      containerNumber: {
        type: 'string',
        description: 'Deprecated alias for number (container number)',
      },
      bookingNumber: {
        type: 'string',
        description: 'Deprecated alias for number (booking/BL number)',
      },
      scac: {
        type: 'string',
        description: 'Optional SCAC code of the shipping line (e.g., MAEU for Maersk)',
      },
      refNumbers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional reference numbers for matching',
      },
    },
  },
};

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

  if (normalized === 'BL' || normalized === 'B/L' || normalized === 'BILL_OF_LADING') {
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

function parseValidationPointer(message: string): string | undefined {
  const pointerMatch = message.match(/\((\/data\/attributes\/[a-z_]+)\)/i);
  return pointerMatch?.[1];
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
      (container) => normalizeTrackingNumber(container.container_number) === number,
    );
    const match = exactMatch ?? (result.containers.length === 1 ? result.containers[0] : null);
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
  client: Terminal49Client
): Promise<any> {
  const number = normalizeTrackingNumber(args.number || args.containerNumber || args.bookingNumber || '');
  if (!number || number.trim() === '') {
    throw new Error('Tracking number is required');
  }

  const numberTypeOverride =
    normalizeNumberType(
      args.numberType ||
        (args.containerNumber ? 'container' : args.bookingNumber ? 'booking_number' : undefined),
    );
  const requestedScac = normalizeText(args.scac);
  const heuristicScac = inferScacFromPrefix(number);
  const inferredNumberType = numberTypeOverride || inferNumberTypeFromPattern(number);

  const startTime = Date.now();
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'track_container',
      number,
      scac: requestedScac || heuristicScac,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const existingContainer = await findExistingTrackedContainer(number, client);
    if (existingContainer?.id) {
      const containerDetails = await executeGetContainer({ id: existingContainer.id }, client);
      return {
        ...containerDetails,
        tracking_request_created: false,
        infer_result: {
          inferred_type: inferredNumberType,
          selected_scac: requestedScac || existingContainer.shippingLine || heuristicScac,
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
      const canFallbackToDirectCreate = Boolean(inferredNumberType && selectedScac);

      if ((pointer === '/data/attributes/number' || /infer/i.test(message)) && canFallbackToDirectCreate) {
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
      console.error(
        JSON.stringify({
          event: 'tracking_request.pending',
          number,
          numberType: numberTypeOverride,
          scac: requestedScac || heuristicScac,
          timestamp: new Date().toISOString(),
        })
      );

      return {
        tracking_request_created: true,
        infer_result: infer,
        tracking_request: {
          request_number: number,
          number_type: inferredNumberType,
          scac: requestedScac || heuristicScac,
        },
        _metadata: {
          presentation_guidance:
            'Tracking request was created, but no container is linked yet. Poll list_tracking_requests or retry in a short while.',
          recommendations: ['list_tracking_requests', 'get_container'],
        },
      };
    }

    console.error(
      JSON.stringify({
        event: 'tracking_request.created',
        number,
        container_id: containerId,
        timestamp: new Date().toISOString(),
      })
    );

    // Step 2: Get full container details using the ID
    const containerDetails = await executeGetContainer({ id: containerId }, client);

    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'track_container',
        number,
        container_id: containerId,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    return {
      ...containerDetails,
      tracking_request_created: true,
      infer_result: infer,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = (error as Error).message;

    if (
      /Unable to infer/.test(message) ||
      /SCAC/.test(message) ||
      /request_number/.test(message) ||
      /request type/.test(message) ||
      /\/data\/attributes\/number/.test(message)
    ) {
      console.error(
        JSON.stringify({
          event: 'tracking_request.hint',
          number,
          message,
          timestamp: new Date().toISOString(),
        })
      );
      throw new Error(
        `${message}. Automatic inference is currently unavailable for this input. Provide numberType (` +
          'container | booking_number | bill_of_lading) and scac, or use search_container/get_container if it is already tracked.'
      );
    }

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'track_container',
        number,
        error: (error as Error).name,
        message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

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
    const container = response.included.find((item: any) => item.type === 'container');
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
