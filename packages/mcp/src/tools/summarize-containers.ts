/**
 * summarize_containers tool
 * Counts containers grouped by one dimension, for "how many" and "break down by"
 * questions, so the model receives a few rows of counts instead of every page.
 * The API has no aggregation endpoint yet, so the MCP pages the filtered list
 * itself (up to max_rows) and counts.
 */

import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';
import { logMcpEvent } from '../logging.js';
import {
  containerListInputSchema,
  getContainerFilters,
} from './list-filters.js';

const PAGE_SIZE = 50;
const CONCURRENCY = 6;
const DEFAULT_MAX_ROWS = 3000;
const MAX_ROWS = 6000;
const MAX_GROUPS = 50;

export const GROUP_BY = [
  'pod_terminal',
  'current_status',
  'shipping_line',
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
      'Dimension to count by. hold_type counts each active hold name (a container with two holds counts twice); dates are UTC calendar days.',
    ),
  max_rows: z
    .number()
    .int()
    .positive()
    .max(MAX_ROWS)
    .describe(
      `Most containers to count (default ${DEFAULT_MAX_ROWS}). Results say when the set was larger.`,
    )
    .default(DEFAULT_MAX_ROWS),
});
export type SummarizeContainersArgs = z.input<
  typeof summarizeContainersInputSchema
>;

function groupKeys(
  container: any,
  groupBy: (typeof GROUP_BY)[number],
): string[] {
  switch (groupBy) {
    case 'pod_terminal':
      return [container?.terminals?.podTerminal?.name ?? 'No POD terminal'];
    case 'current_status':
      return [container?.currentStatus ?? container?.status ?? 'unknown'];
    case 'shipping_line':
      return [container?.shipment?.shippingLineScac ?? 'unknown'];
    case 'hold_type': {
      const holds = (container?.demurrage?.holds ?? []).filter(
        (hold: any) => hold?.status === 'hold',
      );
      return holds.length
        ? holds.map((hold: any) => hold.name ?? 'other')
        : ['no hold'];
    }
    case 'pickup_lfd_date':
      return [container?.demurrage?.pickupLfd?.slice(0, 10) ?? 'no LFD'];
    case 'pod_arrival_date': {
      const arrival =
        container?.location?.podArrivedAt ??
        container?.shipment?.podAtaAt ??
        container?.shipment?.podEtaAt;
      return [arrival?.slice(0, 10) ?? 'no arrival date'];
    }
  }
}

export async function executeSummarizeContainers(
  rawArgs: SummarizeContainersArgs,
  client: Terminal49Client,
): Promise<any> {
  const args = summarizeContainersInputSchema.parse(rawArgs);
  const { group_by: _groupBy, max_rows: _maxRows, ...filterArgs } = args;
  const filters = getContainerFilters(
    containerListInputSchema.parse(filterArgs),
  );
  const include = ['shipment', 'pod_terminal'];
  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'summarize_containers',
    filter_keys: Object.keys(filters),
    group_by: args.group_by,
    timestamp: new Date().toISOString(),
  });

  const fetchPage = (page: number) =>
    client.containers.list({ ...filters, include } as any, {
      format: 'mapped',
      page,
      pageSize: PAGE_SIZE,
    });

  try {
    const first: any = await fetchPage(1);
    const rows: any[] = [...(first?.items ?? [])];
    let total: number | null;
    let morePages: boolean;
    if (typeof first?.meta?.total === 'number') {
      total = first.meta.total;
      const pages = Math.ceil(Math.min(total, args.max_rows) / PAGE_SIZE);
      for (let start = 2; start <= pages; start += CONCURRENCY) {
        const batch = await Promise.all(
          Array.from(
            { length: Math.min(CONCURRENCY, pages - start + 1) },
            (_, i) => fetchPage(start + i),
          ),
        );
        for (const page of batch) rows.push(...((page as any)?.items ?? []));
      }
      morePages = false;
    } else {
      // Without meta.total the only completeness signal is links.next, so
      // pages are fetched one at a time until it disappears or max_rows hits.
      let page: any = first;
      let next = 2;
      while (page?.links?.next && rows.length < args.max_rows) {
        page = await fetchPage(next++);
        rows.push(...(page?.items ?? []));
      }
      morePages = Boolean(page?.links?.next);
      total = morePages ? null : rows.length;
    }
    const counted = rows.slice(0, args.max_rows);
    const counts = new Map<string, number>();
    for (const container of counted) {
      for (const key of groupKeys(container, args.group_by))
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const groups = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, count }));

    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'summarize_containers',
      item_count: counted.length,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
    return {
      total,
      counted: counted.length,
      truncated:
        morePages ||
        counted.length < (total ?? 0) ||
        rows.length > counted.length,
      group_by: args.group_by,
      groups: groups.slice(0, MAX_GROUPS),
      other_groups: groups.length > MAX_GROUPS ? groups.length - MAX_GROUPS : 0,
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
