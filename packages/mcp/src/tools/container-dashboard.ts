/**
 * show_container_dashboard tool
 *
 * One call gathers what the Terminal49 dashboard shows for a set of
 * containers: status, terminal, carrier and hold breakdowns, the next weeks of
 * arrivals and last free days, the attention count, and the first page of
 * containers. MCP Apps hosts render the result in the container dashboard view
 * (ui://terminal49/container-dashboard.html); other clients read the summary.
 */

import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';
import { containerListInputSchema } from './list-filters.js';
import {
  executeSummarizeContainers,
  type SummarizeContainersArgs,
} from './summarize-containers.js';
import { executeListContainers } from './list-containers.js';

export const CONTAINER_DASHBOARD_URI =
  'ui://terminal49/container-dashboard.html';

const PAGE_SIZE = 25;

export const containerDashboardInputSchema = containerListInputSchema
  .omit({ page: true, page_size: true, include: true, view: true })
  .extend({
    title: z
      .string()
      .trim()
      .max(80)
      .describe(
        'Optional heading for the dashboard, such as "Containers at risk" or "Maersk arrivals".',
      )
      .optional(),
  });
export type ContainerDashboardArgs = z.input<
  typeof containerDashboardInputSchema
>;

const group = z.object({
  key: z.string().nullable(),
  label: z.string().nullable(),
  count: z.number(),
});

export const containerDashboardOutputSchema = z.object({
  summary: z.string(),
  title: z.string(),
  generated_at: z.string(),
  app_url: z.string(),
  filters: z.record(z.string(), z.unknown()),
  totals: z.object({
    containers: z.number(),
    needs_attention: z.number(),
    with_holds: z.number(),
  }),
  breakdowns: z.object({
    status: z.array(group),
    terminal: z.array(group),
    carrier: z.array(group),
    hold_type: z.array(group),
    lfd_by_day: z.array(group),
    arrivals_by_day: z.array(group),
  }),
  containers: z.array(z.record(z.string(), z.unknown())),
  page: z.object({
    page: z.number(),
    page_size: z.number(),
    has_more: z.boolean(),
  }),
});
export type ContainerDashboard = z.infer<typeof containerDashboardOutputSchema>;

type Group = z.infer<typeof group>;

export async function executeContainerDashboard(
  rawArgs: ContainerDashboardArgs,
  client: Terminal49Client,
  appUrl: string,
  now: Date = new Date(),
): Promise<ContainerDashboard> {
  const { title, sort, ...filters } =
    containerDashboardInputSchema.parse(rawArgs);
  const summarize = (
    group_by: SummarizeContainersArgs['group_by'],
    extra: Pick<SummarizeContainersArgs, 'requires_attention'> = {},
  ) => executeSummarizeContainers({ ...filters, ...extra, group_by }, client);
  // The attention tile counts requires_attention: true unless the caller
  // already filtered on it.
  const attentionFilter =
    filters.requires_attention === undefined
      ? { requires_attention: true }
      : {};

  const [status, terminal, carrier, holdType, lfd, arrivals, attention, list] =
    await Promise.all([
      summarize('current_status'),
      summarize('pod_terminal'),
      summarize('shipping_line'),
      summarize('hold_type'),
      summarize('pickup_lfd_date'),
      summarize('pod_arrival_date'),
      summarize('current_status', attentionFilter),
      executeListContainers(
        {
          ...filters,
          sort:
            sort ??
            (filters.requires_attention ? 'attention_priority' : undefined),
          page_size: PAGE_SIZE,
        },
        client,
      ),
    ]);

  const today = isoDay(now);
  const horizon = isoDay(new Date(now.getTime() + 21 * 86_400_000));
  const withHolds = byCount(holdType.groups)
    .filter((g) => g.key !== null)
    .reduce((sum, g) => sum + g.count, 0);
  const dashboard: Omit<ContainerDashboard, 'summary'> = {
    title: title ?? 'Container dashboard',
    generated_at: now.toISOString(),
    app_url: appUrl,
    filters: status.applied_filters ?? {},
    totals: {
      containers: status.total,
      needs_attention: attention.total,
      with_holds: withHolds,
    },
    breakdowns: {
      status: byCount(status.groups),
      terminal: byCount(terminal.groups),
      carrier: byCount(carrier.groups),
      hold_type: byCount(holdType.groups).filter((g) => g.key !== null),
      // Past-due LFDs stay in so the view can show them as overdue.
      lfd_by_day: byDay(lfd.groups).filter((g) => g.key! <= horizon),
      arrivals_by_day: byDay(arrivals.groups).filter(
        (g) => g.key! >= today && g.key! <= horizon,
      ),
    },
    containers: list.items ?? [],
    page: {
      page: 1,
      page_size: PAGE_SIZE,
      has_more: Boolean(list._metadata?.has_more),
    },
  };
  return { summary: summarizeDashboard(dashboard, today), ...dashboard };
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function byCount(groups: Group[]): Group[] {
  return [...groups].sort((a, b) => b.count - a.count);
}

function byDay(groups: Group[]): Group[] {
  return groups
    .filter((g) => g.key !== null)
    .sort((a, b) => a.key!.localeCompare(b.key!));
}

/**
 * The text the model reads. It states what the view shows, so the model and
 * the person looking at the dashboard talk about the same numbers.
 */
export function summarizeDashboard(
  dashboard: Omit<ContainerDashboard, 'summary'>,
  today: string,
): string {
  const { totals, breakdowns } = dashboard;
  const top = (groups: Group[], n = 5) =>
    groups
      .slice(0, n)
      .map((g) => `${g.label ?? g.key ?? 'None'} ${g.count}`)
      .join(', ') || 'none';
  const overdue = breakdowns.lfd_by_day
    .filter((g) => g.key! < today)
    .reduce((sum, g) => sum + g.count, 0);
  const upcomingLfd = breakdowns.lfd_by_day
    .filter((g) => g.key! >= today)
    .reduce((sum, g) => sum + g.count, 0);
  const arriving = breakdowns.arrivals_by_day.reduce(
    (sum, g) => sum + g.count,
    0,
  );
  const shown = dashboard.containers
    .slice(0, 10)
    .map((c: any) =>
      [
        c.number,
        c.status,
        c.pod_terminal,
        c.pickup_lfd ? `LFD ${String(c.pickup_lfd).slice(0, 10)}` : null,
        c.holds?.length ? `holds: ${c.holds.join('/')}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    );
  const filterText = Object.keys(dashboard.filters).length
    ? `Filters: ${JSON.stringify(dashboard.filters)}.`
    : 'No filters (all actively tracked containers).';
  return [
    `Showing the "${dashboard.title}" dashboard to the user. ${filterText}`,
    `${totals.containers} containers; ${totals.needs_attention} need attention; ${totals.with_holds} hold flags.`,
    `By status: ${top(breakdowns.status, 8)}.`,
    `By terminal: ${top(breakdowns.terminal)}.`,
    `By carrier: ${top(breakdowns.carrier)}.`,
    `Holds: ${top(breakdowns.hold_type)}.`,
    `Last free days: ${overdue} past due, ${upcomingLfd} in the next 3 weeks. Arrivals in the next 3 weeks: ${arriving}.`,
    shown.length
      ? `First rows of the table:\n- ${shown.join('\n- ')}`
      : 'No containers match.',
    'The user can click tiles and bars to filter, open a container, or ask about one; their selections arrive as context. Do not repeat these numbers back unless asked.',
  ].join('\n');
}
