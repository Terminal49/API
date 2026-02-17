/**
 * track_container tool
 * Creates a tracking request for a container/BL/booking number and returns the container details
 */

import { Terminal49Client } from '@terminal49/sdk';
import { executeGetContainer } from './get-container.js';

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

  if (normalized === 'BL' || normalized === 'B/L' || normalized === 'BILL_OF_LADING') {
    return 'bill_of_lading';
  }

  return normalized;
}

function inferScacFromPrefix(number: string): string | undefined {
  const match = number.match(/^([A-Za-z]{4})/);
  return match ? match[1].toUpperCase() : undefined;
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
  const scac = normalizeText(args.scac) || inferScacFromPrefix(number);

  const startTime = Date.now();
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'track_container',
      number,
      scac,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    // Step 1: Infer + create tracking request
    const { infer, trackingRequest } = await client.createTrackingRequestFromInfer(number, {
      scac,
      numberType: numberTypeOverride,
      refNumbers: args.refNumbers,
    });

    // Extract container ID from the tracking response
    const containerId = extractContainerId(trackingRequest);

    if (!containerId) {
      console.error(
        JSON.stringify({
          event: 'tracking_request.pending',
          number,
          numberType: numberTypeOverride,
          scac,
          timestamp: new Date().toISOString(),
        })
      );

      return {
        tracking_request_created: true,
        infer_result: infer,
        tracking_request: {
          request_number: number,
          number_type: numberTypeOverride,
          scac,
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
      /request type/.test(message)
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
        `${message}. Provide a valid tracking number and either an explicit numberType (` +
          'container | booking_number | bill_of_lading) and/or scac.'
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
