/**
 * list_shipments tool
 * List shipments with filters + pagination
 */

import { Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';

const MAX_PAGE_SIZE = 25;

export interface ListShipmentsArgs {
  number?: string;
  tracking_stopped?: boolean;
  include_containers?: boolean;
  page?: number;
  page_size?: number;
}

export async function executeListShipments(
  args: ListShipmentsArgs,
  client: Terminal49Client,
): Promise<any> {
  const startTime = Date.now();
  const includeContainers = args.include_containers ?? false;
  const pageSize = Math.min(args.page_size ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'list_shipments',
    filters: {
      number: args.number,
      tracking_stopped: args.tracking_stopped,
      include_containers: includeContainers,
    },
    page: args.page,
    page_size: pageSize,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await client.shipments.list(
      {
        number: args.number,
        trackingStopped: args.tracking_stopped,
        includeContainers,
      },
      {
        format: 'mapped',
        page: args.page,
        pageSize,
      },
    );

    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'list_shipments',
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
      tool: 'list_shipments',
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
