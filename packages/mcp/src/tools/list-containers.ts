/**
 * list_containers tool
 * List containers with filters + pagination
 */

import { Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';

export interface ListContainersArgs {
  include?: string;
  page?: number;
  page_size?: number;
}

export async function executeListContainers(
  args: ListContainersArgs,
  client: Terminal49Client,
): Promise<any> {
  const startTime = Date.now();
  const include = args.include?.trim() || undefined;
  const pageSize = args.page_size ?? 25;
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'list_containers',
    include,
    page: args.page,
    page_size: pageSize,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await client.containers.list(
      {
        include: include
          ? (include.split(',').map((s) => s.trim()) as any)
          : undefined,
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
      tool: 'list_containers',
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
      tool: 'list_containers',
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
