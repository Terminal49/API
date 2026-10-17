/**
 * list_tracking_requests tool
 * List tracking requests with filters + pagination
 */

import type { paths, Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';

const MAX_PAGE_SIZE = 25;

type TrackingRequestStatusFilter = NonNullable<
  NonNullable<
    paths['/tracking_requests']['get']['parameters']['query']
  >['filter[status]']
>;

/** The `filter[status]` values the API honors; anything else is treated as `pending`. */
export const TRACKING_REQUEST_STATUS_FILTERS = [
  'pending',
  'created',
  'failed',
  'cancelled',
] as const satisfies readonly TrackingRequestStatusFilter[];

const _everyStatusFilterListed: Exclude<
  TrackingRequestStatusFilter,
  (typeof TRACKING_REQUEST_STATUS_FILTERS)[number]
> extends never
  ? true
  : never = true;

export interface ListTrackingRequestsArgs {
  request_number?: string;
  status?: TrackingRequestStatusFilter;
  scac?: string;
  page?: number;
  page_size?: number;
}

export async function executeListTrackingRequests(
  args: ListTrackingRequestsArgs,
  client: Terminal49Client,
): Promise<any> {
  const startTime = Date.now();
  const pageSize = Math.min(args.page_size ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'list_tracking_requests',
    filters: {
      request_number: args.request_number,
      status: args.status,
      scac: args.scac,
    },
    page: args.page,
    page_size: pageSize,
    timestamp: new Date().toISOString(),
  });

  try {
    const filters = {
      ...(args.request_number
        ? { 'filter[request_number]': args.request_number }
        : {}),
      ...(args.status ? { 'filter[status]': args.status } : {}),
      ...(args.scac ? { 'filter[scac]': args.scac } : {}),
    };

    const result = await client.trackingRequests.list(filters, {
      format: 'mapped',
      page: args.page,
      pageSize,
    });

    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'list_tracking_requests',
      item_count: Array.isArray((result as any)?.items)
        ? (result as any).items.length
        : null,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'list_tracking_requests',
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
