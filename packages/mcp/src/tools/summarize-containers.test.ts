import { describe, expect, it, vi } from 'vitest';
import { compactContainer } from './compact-rows.js';
import { executeSummarizeContainers } from './summarize-containers.js';

const container = (
  number: string,
  terminal: string,
  holds: string[] = [],
  lfd?: string,
) => ({
  id: number,
  number,
  currentStatus: 'available',
  terminals: { podTerminal: { name: terminal } },
  demurrage: {
    pickupLfd: lfd ?? null,
    holds: holds.map((name) => ({ name, status: 'hold' })),
    fees: [],
  },
  location: { availableForPickup: true, podDischargedAt: null },
  shipment: {
    billOfLading: 'BL1',
    shippingLineScac: 'MAEU',
    podEtaAt: '2026-10-11T00:00:00Z',
  },
});

describe('compact container rows', () => {
  it('keep the worklist fields and drop empty ones', () => {
    const row = compactContainer({
      ...container('MSCU1234567', 'APM Terminals', ['customs']),
      demurrage: {
        pickupLfd: '2026-10-08T00:00:00Z',
        holds: [
          { name: 'customs', status: 'hold' },
          { name: 'freight', status: 'released' },
        ],
        fees: [],
      },
    });
    expect(row).toEqual({
      id: 'MSCU1234567',
      number: 'MSCU1234567',
      status: 'available',
      available_for_pickup: true,
      pod_terminal: 'APM Terminals',
      pickup_lfd: '2026-10-08T00:00:00Z',
      holds: ['customs'],
      shipment: {
        bill_of_lading: 'BL1',
        shipping_line_scac: 'MAEU',
        pod_eta_at: '2026-10-11T00:00:00Z',
      },
    });
  });
});

describe('summarize_containers', () => {
  it('counts every page of the filtered set by the chosen dimension', async () => {
    const pages: Record<number, any> = {
      1: {
        items: Array.from({ length: 50 }, (_, i) =>
          container(`A${i}`, i < 30 ? 'APM Terminals' : 'Yusen'),
        ),
        meta: { total: 60 },
      },
      2: {
        items: Array.from({ length: 10 }, (_, i) =>
          container(`B${i}`, 'Yusen', ['customs', 'freight']),
        ),
        meta: { total: 60 },
      },
    };
    const list = vi.fn(
      async (_filters: any, options: any) => pages[options.page],
    );
    const result = await executeSummarizeContainers(
      { requires_attention: true, group_by: 'pod_terminal' },
      { containers: { list } } as any,
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        requires_attention: true,
        actively_tracked: true,
      }),
      expect.objectContaining({ page: 2, pageSize: 50 }),
    );
    expect(result).toMatchObject({
      total: 60,
      counted: 60,
      truncated: false,
      groups: [
        { key: 'APM Terminals', count: 30 },
        { key: 'Yusen', count: 30 },
      ],
    });
  });

  it('counts each active hold and reports truncation', async () => {
    const list = vi.fn(async () => ({
      items: [
        container('C1', 'APM', ['customs', 'freight']),
        container('C2', 'APM'),
        container('C3', 'APM', ['customs']),
      ],
      meta: { total: 200 },
    }));
    const result = await executeSummarizeContainers(
      { group_by: 'hold_type', max_rows: 3 },
      { containers: { list } } as any,
    );
    expect(result.truncated).toBe(true);
    expect(result.counted).toBe(3);
    expect(result.groups).toEqual([
      { key: 'customs', count: 2 },
      { key: 'freight', count: 1 },
      { key: 'no hold', count: 1 },
    ]);
  });
});
