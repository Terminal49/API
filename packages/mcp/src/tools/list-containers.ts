/**
 * list_containers tool
 * List containers with filters + pagination
 */

import { Terminal49Client } from '@terminal49/sdk';
import { resolvePodDeadline } from '../lib/pod-deadline.js';
import { logMcpEvent } from '../logging.js';
import { compactContainer } from './compact-rows.js';

const MAX_PAGE_SIZE = 25;

export type { ListContainersArgs } from './list-filters.js';
import {
  containerListInputSchema,
  getContainerFilters,
  getListResponseMetadata,
  type ListContainersArgs,
} from './list-filters.js';

// The SDK maps `demurrage.pickupLfd` from the legacy flat `pickup_lfd`, which
// can be an inland or superseded deadline. Replace it with the API-selected POD
// deadline so list rows match get_container, the container resource and
// get_shipment_details. The mapper camelCases only top-level keys, so the
// nested deadline block keeps the API's snake_case shape.
function withSelectedPodDeadline(container: any) {
  const { value, source } = resolvePodDeadline(
    container?.importDeadlines || {},
  );
  return {
    ...container,
    demurrage: {
      ...container?.demurrage,
      pickupLfd: value,
      pickupLfdSource: source,
    },
  };
}

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
    const mappedItems = Array.isArray(rawItems)
      ? rawItems.map(withSelectedPodDeadline)
      : rawItems;
    const items =
      compact && Array.isArray(mappedItems)
        ? mappedItems.map(compactContainer)
        : mappedItems;
    return {
      ...result,
      items,
      _metadata: getListResponseMetadata(result, filters, args, pageSize),
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
