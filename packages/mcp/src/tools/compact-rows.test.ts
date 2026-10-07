import { describe, expect, it } from 'vite-plus/test';
import { compactContainer } from './compact-rows.js';

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
