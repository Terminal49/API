/**
 * list_containers tool
 * List containers with filters + pagination
 */

import { Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';
import { assertNoIgnoredFilters } from './ignored-filters.js';
import { compactContainer } from './compact-rows.js';
import { statusLabel } from '../lib/container-status.js';

const MAX_PAGE_SIZE = 25;

export type { ListContainersArgs } from './list-filters.js';
import {
  containerListInputSchema,
  getContainerFilters,
  getListResponseMetadata,
  labelStatusFilter,
  type ListContainersArgs,
} from './list-filters.js';

export async function executeListContainers(
  args: ListContainersArgs,
  client: Terminal49Client,
): Promise<any> {
  args = containerListInputSchema.parse({
    ...args,
    page_size: Math.min(args.page_size ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE),
  });
  const filters = getContainerFilters(args);
  const startTime = Date.now();
  const compact = args.view !== 'full';
  // Compact rows show the POD terminal and the shipment's BL, carrier and ETA.
  const include =
    args.include ?? (compact ? ['shipment', 'pod_terminal'] : undefined);
  const pageSize = Math.min(args.page_size ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE);
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'list_containers',
    filter_keys: Object.keys(filters),
    include,
    page: args.page,
    page_size: pageSize,
    timestamp: new Date().toISOString(),
  });

  try {
    const result = await client.containers.list(
      {
        ...filters,
        sort: args.sort,
        include,
      },
      {
        format: 'mapped',
        page: args.page,
        pageSize,
      },
    );

    assertNoIgnoredFilters(result?.meta?.ignored_filters);

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

    const rawItems = (result as any)?.items;
    const items = Array.isArray(rawItems)
      ? rawItems.map(compact ? compactContainer : labelFullRow)
      : rawItems;
    return {
      ...result,
      items,
      _metadata: getListResponseMetadata(
        result,
        labelStatusFilter(filters),
        args,
        pageSize,
      ),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'list_containers',
      error: (error as Error).name,

      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

/** Full rows show the dashboard status label in place of the code. */
function labelFullRow(container: any) {
  return {
    ...container,
    status: statusLabel(container.status) ?? container.status,
    currentStatus:
      statusLabel(container.currentStatus) ?? container.currentStatus,
  };
}
