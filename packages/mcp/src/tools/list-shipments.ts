/**
 * list_shipments tool
 * List shipments with filters + pagination
 */

import { Terminal49Client } from '@terminal49/sdk';

export interface ListShipmentsArgs {
  status?: string;
  port?: string;
  carrier?: string;
  updated_after?: string;
  include_containers?: boolean;
  page?: number;
  page_size?: number;
}

export async function executeListShipments(
  args: ListShipmentsArgs,
  client: Terminal49Client
): Promise<any> {
  const startTime = Date.now();
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'list_shipments',
      filters: {
        status: args.status,
        port: args.port,
        carrier: args.carrier,
        updated_after: args.updated_after,
        include_containers: args.include_containers,
      },
      page: args.page,
      page_size: args.page_size,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const result = await client.shipments.list(
      {
        status: args.status,
        port: args.port,
        carrier: args.carrier,
        updatedAfter: args.updated_after,
        includeContainers: args.include_containers,
      },
      {
        format: 'mapped',
        page: args.page,
        pageSize: args.page_size,
      }
    );

    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'list_shipments',
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
        tool: 'list_shipments',
        error: (error as Error).name,
        message: (error as Error).message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );
    throw error;
  }
}
