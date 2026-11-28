import type { Terminal49Client } from '@terminal49/sdk';
import { describe, expect, it, vi } from 'vite-plus/test';
import { executeContainerDashboard } from './container-dashboard.js';

const NOW = new Date('2026-11-27T15:00:00Z');

function fakeClient() {
  const groups: Record<
    string,
    { key: string | null; label: string | null; count: number }[]
  > = {
    current_status: [
      { key: 'on_ship', label: 'on_ship', count: 7 },
      { key: 'available', label: 'available', count: 3 },
      { key: 'grounded', label: 'grounded', count: 2 },
    ],
    pod_terminal: [
      { key: null, label: null, count: 20 },
      { key: 't-1', label: 'APM Terminals', count: 4 },
      { key: 't-2', label: 'Fenix Marine', count: 8 },
    ],
    shipping_line: [{ key: 'sl-1', label: 'MAEU', count: 12 }],
    hold_type: [
      { key: null, label: null, count: 9 },
      { key: 'CUSTOMS', label: 'CUSTOMS', count: 2 },
      { key: 'FREIGHT', label: 'FREIGHT', count: 1 },
    ],
    pickup_lfd_date: [
      { key: '2026-11-30', label: '2026-11-30', count: 2 },
      { key: '2026-11-25', label: '2026-11-25', count: 1 },
      { key: '2027-02-01', label: '2027-02-01', count: 5 },
      { key: null, label: null, count: 4 },
    ],
    pod_arrival_date: [
      { key: '2026-11-20', label: '2026-11-20', count: 3 },
      { key: '2026-12-02', label: '2026-12-02', count: 4 },
    ],
  };
  const summary = vi.fn(async (groupBy: string, filters: any) => {
    const list = groups[groupBy]!;
    const total = filters.requires_attention ? 3 : 12;
    return { total, groups: list, truncated: false };
  });
  const list = vi.fn(async () => ({
    items: [
      {
        id: 'c-1',
        number: 'MSCU1234567',
        currentStatus: 'available',
        terminals: { podTerminal: { name: 'APM Terminals' } },
        demurrage: {
          pickupLfd: '2026-11-30',
          holds: [{ name: 'CUSTOMS', status: 'hold' }],
        },
      },
    ],
    links: { next: '/v2/containers?page[number]=2' },
  }));
  return {
    client: { containers: { summary, list } } as unknown as Terminal49Client,
    summary,
    list,
  };
}

describe('show_container_dashboard', () => {
  it('gathers every breakdown and the first page in one call', async () => {
    const { client, summary, list } = fakeClient();
    const result = await executeContainerDashboard(
      { shipping_line_scac: 'MAEU' },
      client,
      'https://app.example.test',
      NOW,
    );

    expect(summary).toHaveBeenCalledTimes(7);
    expect(list).toHaveBeenCalledTimes(1);
    // Every query carries the caller's filter.
    for (const call of summary.mock.calls) {
      expect(call[1]).toMatchObject({ shipping_line_scac: 'MAEU' });
    }
    expect(result.totals).toEqual({
      containers: 12,
      needs_attention: 3,
      with_holds: 3,
    });
    expect(result.breakdowns.status.map((g) => g.label)).toEqual([
      'On Ship',
      'Available',
      'At Terminal',
    ]);
    expect(result.breakdowns.terminal.map((g) => g.label)).toEqual([
      'Fenix Marine',
      'APM Terminals',
      null,
    ]);
    expect(result.breakdowns.hold_type.map((g) => g.key)).toEqual([
      'CUSTOMS',
      'FREIGHT',
    ]);
    // Past-due LFDs stay; days past the three-week horizon and nulls do not.
    expect(result.breakdowns.lfd_by_day.map((g) => g.key)).toEqual([
      '2026-11-25',
      '2026-11-30',
    ]);
    // Arrivals are actual (past) arrivals over the last three weeks.
    expect(result.breakdowns.arrivals_by_day.map((g) => g.key)).toEqual([
      '2026-11-20',
    ]);
    expect(result.containers[0]).toMatchObject({
      number: 'MSCU1234567',
      status: 'Available',
      holds: ['CUSTOMS'],
    });
    expect(result.page).toEqual({ page: 1, page_size: 25, has_more: true });
    expect(result.app_url).toBe('https://app.example.test');
  });

  it('tells the model what the user sees', async () => {
    const { client } = fakeClient();
    const { summary } = await executeContainerDashboard(
      { title: 'Maersk' },
      client,
      'https://app.example.test',
      NOW,
    );
    expect(summary).toContain('"Maersk" dashboard');
    expect(summary).toContain('12 containers; 3 need attention. Hold flags: 3');
    expect(summary).toContain(
      'Last free day already passed: 1 containers. Last free day in the next 3 weeks: 2.',
    );
    expect(summary).toContain(
      'MSCU1234567 · Available · APM Terminals · LFD 2026-11-30 · holds: CUSTOMS',
    );
  });

  it('sorts the attention view by priority and keeps a caller filter over the tile filter', async () => {
    const { client, summary, list } = fakeClient();
    await executeContainerDashboard(
      { requires_attention: false },
      client,
      'https://app.example.test',
      NOW,
    );
    // The attention count does not override requires_attention: false.
    expect(
      summary.mock.calls.every((c) => c[1].requires_attention === false),
    ).toBe(true);

    list.mockClear();
    await executeContainerDashboard(
      { requires_attention: true },
      client,
      'x',
      NOW,
    );
    expect((list.mock.calls[0] as any)[0]).toMatchObject({
      sort: 'attention_priority',
    });
  });
});
