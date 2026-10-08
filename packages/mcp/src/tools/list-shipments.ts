/**
 * list_shipments tool
 * List shipments with filters + pagination
 */

import { Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';

const MAX_PAGE_SIZE = 25;

export type { ListShipmentsArgs } from './list-filters.js';
import {
  shipmentListInputSchema,
  getShipmentFilters,
  getListResponseMetadata,
  type ListShipmentsArgs,
} from './list-filters.js';

export async function executeListShipments(
  args: ListShipmentsArgs,
  client: Terminal49Client,
): Promise<any> {
  args = shipmentListInputSchema.parse({
    ...args,
    page_size: Math.min(args.page_size ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE),
  });
  const filters = getShipmentFilters(args);
  const startTime = Date.now();
  const includeContainers = args.include_containers ?? false;
  const pageSize = Math.min(args.page_size ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'list_shipments',
    filter_keys: Object.keys(filters),
    include_containers: includeContainers,
    page: args.page,
    page_size: pageSize,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await client.shipments.list(
      {
        ...filters,
        sort: args.sort,
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

    return {
      ...result,
      _metadata: getListResponseMetadata(result, filters, args, pageSize),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'list_shipments',
      error: (error as Error).name,

      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
