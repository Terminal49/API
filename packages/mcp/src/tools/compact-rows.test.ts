import { describe, expect, it } from 'vite-plus/test';
import { Terminal49Client } from '@terminal49/sdk';
import { executeListContainers } from './list-containers.js';
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
      holds: [{ name: 'customs' }],
      fees: [],
      shipment: {
        bill_of_lading: 'BL1',
        shipping_line_scac: 'MAEU',
        pod_eta_at: '2026-10-11T00:00:00Z',
      },
    });
  });
});

describe('compact row operational context', () => {
  it('preserves freshness, local time, shipment identity and hold explanations', () => {
    const row = compactContainer({
      terminalCheckedAt: '2026-10-07T18:00:00Z',
      podTimezone: 'America/Los_Angeles',
      shipment: { id: 'shipment-1' },
      demurrage: {
        holds: [
          {
            name: 'other',
            status: 'hold',
            description: 'Appointment required',
          },
        ],
        fees: [{ type: 'demurrage', amount: 0, currency_code: 'USD' }],
      },
    });
    expect(row).toMatchObject({
      terminal_checked_at: '2026-10-07T18:00:00Z',
      pod_timezone: 'America/Los_Angeles',
      shipment: { id: 'shipment-1' },
      holds: [{ name: 'other', description: 'Appointment required' }],
      fees: [{ type: 'demurrage', amount: 0, currency: 'USD' }],
    });
    expect(row).not.toHaveProperty('last_status_refresh_at');
  });

  it.each([undefined, null])(
    'does not report unavailable hold or fee data (%j) as empty',
    (missing) => {
      const row = compactContainer({
        demurrage: { holds: missing, fees: missing },
      });
      expect(row).not.toHaveProperty('holds');
      expect(row).not.toHaveProperty('fees');
    },
  );

  it('preserves confirmed empty arrays, including when all reported holds are released', () => {
    expect(compactContainer({ demurrage: { holds: [], fees: [] } })).toEqual({
      holds: [],
      fees: [],
    });
    expect(
      compactContainer({
        demurrage: {
          holds: [{ name: 'customs', status: 'released' }],
          fees: [],
        },
      }),
    ).toEqual({ holds: [], fees: [] });
  });
});

it('keeps operational facts through the real SDK mapping and leaves full view intact', async () => {
  const doc = {
    data: [
      {
        id: 'container-1',
        type: 'container',
        attributes: {
          number: 'MSCU1234567',
          terminal_checked_at: '2026-10-07T18:00:00Z',
          pod_timezone: 'America/Los_Angeles',
          holds_at_pod_terminal: [
            {
              name: 'other',
              status: 'hold',
              description: 'Appointment required',
            },
          ],
          fees_at_pod_terminal: [],
          equipment_type: 'dry',
        },
        relationships: {
          shipment: { data: { type: 'shipment', id: 'shipment-1' } },
        },
      },
    ],
    included: [
      {
        type: 'shipment',
        id: 'shipment-1',
        attributes: { bill_of_lading_number: 'BL1' },
      },
    ],
    meta: { total: 1 },
    links: { next: null },
  };
  const client = new Terminal49Client({
    apiToken: 'TEST_KEY',
    fetchImpl: async () =>
      new Response(JSON.stringify(doc), {
        headers: { 'content-type': 'application/vnd.api+json' },
      }),
  });
  const compact = await executeListContainers({}, client);
  expect(compact.items[0]).toMatchObject({
    terminal_checked_at: '2026-10-07T18:00:00Z',
    pod_timezone: 'America/Los_Angeles',
    shipment: { id: 'shipment-1' },
    holds: [{ name: 'other', description: 'Appointment required' }],
    fees: [],
  });
  const full = await executeListContainers({ view: 'full' }, client);
  expect(full.items[0].equipment.type).toBe('dry');
  expect(compact.items[0]).not.toHaveProperty('equipment');
});
