/**
 * MCP tools for Tracking Requests API
 */

import { makeRequest } from '../../http/simple-client.js';
import { mapDocument, mapCollection } from '../../jsonapi/mappers/index.js';
import type { TrackingRequest } from '../../domain/index.js';

export interface CreateTrackingRequestArgs {
  billOfLadingNumber: string;
  shippingLineScac: string;
  refNumbers?: string[];
  tags?: string[];
}

export interface GetTrackingRequestArgs {
  id: string;
}

export interface ListTrackingRequestsArgs {
  page?: number;
  pageSize?: number;
}

/**
 * Create a new tracking request
 */
export async function createTrackingRequest(args: CreateTrackingRequestArgs): Promise<TrackingRequest> {
  const body = {
    data: {
      type: 'tracking_request',
      attributes: {
        request_type: 'bill_of_lading',
        request_number: args.billOfLadingNumber,
        scac: args.shippingLineScac,
        ...(args.refNumbers && { ref_numbers: args.refNumbers }),
        ...(args.tags && { shipment_tags: args.tags }),
      },
    },
  };

  const data = await makeRequest('/tracking_requests', {
    method: 'POST',
    body,
  });

  return mapDocument<TrackingRequest>(data);
}

/**
 * Get a tracking request by ID
 */
export async function getTrackingRequest(args: GetTrackingRequestArgs): Promise<TrackingRequest> {
  const data = await makeRequest(`/tracking_requests/${args.id}`);
  return mapDocument<TrackingRequest>(data);
}

/**
 * List tracking requests
 */
export async function listTrackingRequests(args: ListTrackingRequestsArgs = {}): Promise<TrackingRequest[]> {
  const query: Record<string, string | number> = {};

  if (args.page) query['page[number]'] = args.page;
  if (args.pageSize) query['page[size]'] = args.pageSize;

  const data = await makeRequest('/tracking_requests', { query });
  return mapCollection<TrackingRequest>(data);
}
