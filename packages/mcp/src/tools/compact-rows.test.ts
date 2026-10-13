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
  it('keep the worklist fields and drop empty scalars', () => {
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
      fees: [],
      shipment: {
        bill_of_lading: 'BL1',
        shipping_line_scac: 'MAEU',
        pod_eta_at: '2026-10-11T00:00:00Z',
      },
    });
  });
});

describe('compact container rows: known versus unreported', () => {
  it('keep reported-empty holds and fees, omit unreported ones, and carry availability_known', () => {
    const reportedEmpty = compactContainer({
      ...container('MSCU1111111', 'APM'),
      availabilityKnown: true,
      demurrage: { holds: [], fees: [] },
    });
    const unreported = compactContainer({
      ...container('MSCU2222222', 'APM'),
      availabilityKnown: false,
      demurrage: { holds: null, fees: null },
    });
    expect(reportedEmpty).toMatchObject({
      availability_known: true,
      holds: [],
      fees: [],
    });
    expect(unreported).toMatchObject({ availability_known: false });
    expect(unreported).not.toHaveProperty('holds');
    expect(unreported).not.toHaveProperty('fees');
  });
});
