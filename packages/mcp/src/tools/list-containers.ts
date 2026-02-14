/**
 * list_containers tool
 * List containers with filters + pagination
 */

import { Terminal49Client } from '@terminal49/sdk';

export interface ListContainersArgs {
  status?: string;
  port?: string;
  carrier?: string;
  updated_after?: string;
  include?: string;
  page?: number;
  page_size?: number;
}

export async function executeListContainers(
  args: ListContainersArgs,
  client: Terminal49Client
): Promise<any> {
  const startTime = Date.now();
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'list_containers',
      filters: {
        status: args.status,
        port: args.port,
        carrier: args.carrier,
        updated_after: args.updated_after,
        include: args.include,
      },
      page: args.page,
      page_size: args.page_size,
      timestamp: new Date().toISOString(),
    })
  );

  try {
    const result = await client.containers.list(
      {
        status: args.status,
        port: args.port,
        carrier: args.carrier,
        updatedAfter: args.updated_after,
        include: args.include,
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
        tool: 'list_containers',
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
        tool: 'list_containers',
        error: (error as Error).name,
        message: (error as Error).message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    );
    throw error;
  }
}
