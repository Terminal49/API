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

export async function executeTrackContainer(
  args: TrackContainerArgs,
  client: Terminal49Client
): Promise<any> {
  const number = args.number || args.containerNumber || args.bookingNumber;
  if (!number || number.trim() === '') {
    throw new Error('Tracking number is required');
  }

  const numberTypeOverride =
    args.numberType ||
    (args.containerNumber ? 'container' : args.bookingNumber ? 'booking_number' : undefined);

  const startTime = Date.now();
  console.log(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'track_container',
      number,
      scac: args.scac,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    // Step 1: Infer + create tracking request
    const { infer, trackingRequest } = await client.createTrackingRequestFromInfer(number, {
      scac: args.scac,
      numberType: numberTypeOverride,
      refNumbers: args.refNumbers,
    });

    // Extract container ID from the tracking response
    const containerId = extractContainerId(trackingRequest);

    if (!containerId) {
      throw new Error(
        'Could not find container ID in tracking response. ' +
          'The container may not be in the system yet, or there was an error creating the tracking request.'
      );
    }

    console.log(
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
    console.log(
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

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'track_container',
        number,
        error: (error as Error).name,
        message: (error as Error).message,
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
