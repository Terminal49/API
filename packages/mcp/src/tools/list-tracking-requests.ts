/**
 * list_tracking_requests tool
 * List tracking requests with filters + pagination
 */

import { Terminal49Client } from '@terminal49/sdk';

export interface ListTrackingRequestsArgs {
  filters?: Record<string, string>;
  status?: string;
  request_type?: string;
  page?: number;
  page_size?: number;
}

export async function executeListTrackingRequests(
  args: ListTrackingRequestsArgs,
  client: Terminal49Client
): Promise<any> {
  const startTime = Date.now();
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'list_tracking_requests',
      filters: args.filters,
      page: args.page,
      page_size: args.page_size,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    // Pagination is owned exclusively by the capped `page`/`page_size` schema.
    // The raw `filters` pass-through is copied verbatim into the SDK query, so a
    // caller could otherwise smuggle `page[size]`/`page[number]` through it and
    // bypass the MAX_LIST_PAGE_SIZE clamp. Drop those keys here.
    const safeFilters = { ...args.filters };
    delete safeFilters['page[size]'];
    delete safeFilters['page[number]'];

    const filters = {
      ...safeFilters,
      ...(args.status ? { 'filter[status]': args.status } : {}),
      ...(args.request_type ? { 'filter[request_type]': args.request_type } : {}),
    };

    const result = await client.trackingRequests.list(filters, {
      format: 'mapped',
      page: args.page,
      pageSize: args.page_size,
    });

    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'list_tracking_requests',
        item_count: Array.isArray((result as any)?.items) ? (result as any).items.length : null,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'list_tracking_requests',
        error: (error as Error).name,
        message: (error as Error).message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );
    throw error;
  }
}
