/**
 * track_container tool
 * Creates a tracking request for a container number and returns the container details
 */

import { Terminal49Client } from '@terminal49/sdk';
import { executeGetContainer } from './get-container.js';

export interface TrackContainerArgs {
  containerNumber: string;
  scac?: string;
  bookingNumber?: string;
  refNumbers?: string[];
}

export const trackContainerTool = {
  name: 'track_container',
  description:
    'Track a container by its container number (e.g., CAIU2885402). ' +
    'This will create a tracking request if it doesn\'t exist and return detailed container information. ' +
    'Optionally provide SCAC code, booking number, or reference numbers for better matching.',
  inputSchema: {
    type: 'object',
    properties: {
      containerNumber: {
        type: 'string',
        description: 'The container number (e.g., CAIU2885402, TCLU1234567)',
      },
      scac: {
        type: 'string',
        description: 'Optional SCAC code of the shipping line (e.g., MAEU for Maersk)',
      },
      bookingNumber: {
        type: 'string',
        description: 'Optional booking/BL number if tracking by bill of lading',
      },
      refNumbers: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional reference numbers for matching',
      },
    },
    required: ['containerNumber'],
  },
};

export async function executeTrackContainer(
  args: TrackContainerArgs,
  client: Terminal49Client
): Promise<any> {
  if (!args.containerNumber || args.containerNumber.trim() === '') {
    throw new Error('Container number is required');
  }

  const startTime = Date.now();
  console.log(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'track_container',
      container_number: args.containerNumber,
      scac: args.scac,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    // Step 1: Create tracking request
    const trackingResponse = await client.trackContainer({
      containerNumber: args.containerNumber,
      scac: args.scac,
      bookingNumber: args.bookingNumber,
      refNumbers: args.refNumbers,
    });

    // Extract container ID from the tracking response
    const containerId = extractContainerId(trackingResponse);

    if (!containerId) {
      throw new Error(
        'Could not find container ID in tracking response. ' +
          'The container may not be in the system yet, or there was an error creating the tracking request.'
      );
    }

    console.log(
      JSON.stringify({
        event: 'tracking_request.created',
        container_number: args.containerNumber,
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
        container_number: args.containerNumber,
        container_id: containerId,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    return {
      ...containerDetails,
      tracking_request_created: true,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'track_container',
        container_number: args.containerNumber,
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
