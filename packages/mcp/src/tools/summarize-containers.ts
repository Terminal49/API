/**
 * summarize_containers tool
 * Counts containers grouped by one dimension, for "how many" and "break down by"
 * questions, with one call to GET /v2/containers/summary. The API applies the
 * same filters as the container list, so a count matches the list it describes.
 */

import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';
import {
  containerListInputSchema,
  getContainerFilters,
} from './list-filters.js';

export const GROUP_BY = [
  'pod_terminal',
  'current_status',
  'shipping_line',
  'port_of_discharge',
  'hold_type',
  'pickup_lfd_date',
  'pod_arrival_date',
] as const;

const SHAPE_ONLY = {
  page: true,
  page_size: true,
  sort: true,
  include: true,
  view: true,
} as const;
const filterSchema = containerListInputSchema.omit(SHAPE_ONLY);

export const summarizeContainersInputSchema = filterSchema.extend({
  group_by: z
    .enum(GROUP_BY)
    .describe(
      'Dimension to count by. Terminals and ports are labeled by name, shipping lines by SCAC. hold_type counts each active hold (a container with two holds counts twice); dates are UTC calendar days.',
    ),
});
export type SummarizeContainersArgs = z.input<
  typeof summarizeContainersInputSchema
>;

export async function executeSummarizeContainers(
  rawArgs: SummarizeContainersArgs,
  client: Terminal49Client,
): Promise<any> {
  const { group_by: groupBy, ...filterArgs } =
    summarizeContainersInputSchema.parse(rawArgs);
  const filters = getContainerFilters(
    containerListInputSchema.parse(filterArgs),
  );
  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'summarize_containers',
    filter_keys: Object.keys(filters),
    group_by: groupBy,
    timestamp: new Date().toISOString(),
  });

  try {
    const summary = await client.containers.summary(groupBy, filters as any, {
      format: 'mapped',
    });
    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'summarize_containers',
      item_count: summary.groups.length,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
    return {
      total: summary.total,
      group_by: groupBy,
      truncated: summary.truncated,
      groups: summary.groups,
      applied_filters: filters,
    };
  } catch (error) {
    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'summarize_containers',
      error: (error as Error).name,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
