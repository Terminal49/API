import type { Terminal49Client } from '@terminal49/sdk';
import { describe, expect, it, vi } from 'vite-plus/test';
import {
  executeSearchContainers,
  MAX_BATCH_QUERIES,
} from './search-container.js';

const asClient = (client: unknown) => client as Terminal49Client;

function shipmentHit(id: string, refs: string[]) {
  return {
    id,
    type: 'search_result',
    attributes: { entity_type: 'shipment', ref_numbers: refs, scac: 'MAEU' },
  };
}

function rawShipment(id: string, bol: string, refs: string[]) {
  return {
    raw: {
      data: {
        id,
        type: 'shipment',
        attributes: {
          bill_of_lading_number: bol,
          normalized_number: bol.replace(/^MAEU/, ''),
          shipping_line_scac: 'MAEU',
          ref_numbers: refs,
          port_of_discharge_name: 'Philadelphia',
          port_of_discharge_locode: 'USPHL',
          pod_eta_at: '2026-11-27T12:00:00Z',
          pod_timezone: 'America/New_York',
          pol_atd_at: '2026-10-20T00:00:00Z',
        },
        relationships: {
          pod_terminal: { data: { id: 't1', type: 'terminal' } },
          containers: { data: [{ id: 'c1', type: 'container' }] },
        },
      },
      included: [
        { id: 't1', type: 'terminal', attributes: { name: 'PhilaPort' } },
        { id: 'c1', type: 'container', attributes: { number: 'MSKU1234565' } },
      ],
    },
  };
}

describe('search_container batch', () => {
  it('returns one row per input with exact, partial and not_found, fetching each shipment once', async () => {
    const search = vi.fn(async (query: string) => {
      if (query === 'PO/26484-1')
        return { data: [shipmentHit('s1', ['PO/26484-1'])] };
      if (query === 'MAEU721767351')
        return { data: [shipmentHit('s1', ['PO/26484-1'])] };
      if (query === 'SO/7407-5')
        return { data: [shipmentHit('s2', ['SO/7407-58'])] };
      if (query === 'CAIU2885402')
        return {
          data: [
            {
              id: 'c9',
              type: 'search_result',
              attributes: {
                entity_type: 'container',
                number: 'CAIU2885402',
                scac: 'CMDU',
              },
            },
          ],
        };
      return { data: [] };
    });
    const get = vi.fn(async (id: string) =>
      id === 's1'
        ? rawShipment('s1', 'MAEU721767351', ['PO/26484-1'])
        : rawShipment('s2', 'MAEU999', ['SO/7407-58']),
    );
    const client = asClient({ search, shipments: { get } });

    const result = await executeSearchContainers(
      {
        queries: [
          'PO/26484-1',
          'maeu 721767351',
          'SO/7407-5',
          'CAIU2885402',
          'TLLU4257441',
          'PO/26484-1',
        ],
      },
      client,
    );

    expect(result.results.map((r) => [r.query, r.match])).toEqual([
      ['PO/26484-1', 'exact'],
      ['maeu 721767351', 'not_found'],
      ['SO/7407-5', 'partial'],
      ['CAIU2885402', 'exact'],
      ['TLLU4257441', 'not_found'],
    ]);
    expect(result.total_results).toBe(3);
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.results[0].shipments[0]).toEqual({
      id: 's1',
      bill_of_lading: 'MAEU721767351',
      ref_numbers: ['PO/26484-1'],
      shipping_line: 'MAEU',
      status: 'in_transit',
      container_numbers: ['MSKU1234565'],
      port_of_discharge: {
        name: 'Philadelphia',
        locode: 'USPHL',
        terminal: 'PhilaPort',
        eta: '2026-11-27T12:00:00Z',
        ata: null,
        timezone: 'America/New_York',
      },
    });
    expect(result.results[2].shipments[0].ref_numbers).toEqual(['SO/7407-58']);
  });

  it('matches a bill of lading ignoring case and whitespace, and by its normalized number', async () => {
    const search = vi.fn(async () => ({
      data: [shipmentHit('s1', ['PO/26484-1'])],
    }));
    const get = vi.fn(async () =>
      rawShipment('s1', 'MAEU721767351', ['PO/26484-1']),
    );
    const result = await executeSearchContainers(
      { queries: ['maeu 721767351', '721767351'] },
      asClient({ search, shipments: { get } }),
    );
    expect(result.results.map((r) => r.match)).toEqual(['exact', 'exact']);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns the other rows when one search fails, marking that row error', async () => {
    const search = vi.fn(async (query: string) => {
      if (query === 'BAD1' || query === 'BAD2')
        throw new Error('429 Too Many Requests');
      return { data: [shipmentHit('s1', ['PO/26484-1'])] };
    });
    const get = vi.fn(async () =>
      rawShipment('s1', 'MAEU721767351', ['PO/26484-1']),
    );
    const result = await executeSearchContainers(
      { queries: ['BAD1', 'PO/26484-1', 'BAD2'] },
      asClient({ search, shipments: { get } }),
    );
    expect(result.results.map((r) => [r.query, r.match])).toEqual([
      ['BAD1', 'error'],
      ['PO/26484-1', 'exact'],
      ['BAD2', 'error'],
    ]);
    expect(result.results[0].error).toBe(
      'Search failed: 429 Too Many Requests',
    );
    expect(result.results[1].shipments[0].port_of_discharge.eta).toBe(
      '2026-11-27T12:00:00Z',
    );
    expect(result.failed).toBe(2);
    expect(result.total_results).toBe(1);
  });

  it('keeps a row when its shipment details fail, naming the shipment', async () => {
    const search = vi.fn(async () => ({
      data: [shipmentHit('s1', ['PO/1']), shipmentHit('s2', ['PO/1'])],
    }));
    const get = vi.fn(async (id: string) => {
      if (id === 's2') throw new Error('404 Not Found');
      return rawShipment('s1', 'MAEU1', ['PO/1']);
    });
    const result = await executeSearchContainers(
      { queries: ['PO/1'] },
      asClient({ search, shipments: { get } }),
    );
    expect(result.results[0].match).toBe('exact');
    expect(result.results[0].shipments.map((s) => s.id)).toEqual(['s1']);
    expect(result.results[0].error).toBe(
      'Could not load details for shipment s2: 404 Not Found',
    );
    expect(result.failed).toBe(0);
  });

  it('includes the shipment, with its ETA, for an exact container match', async () => {
    const search = vi.fn(async () => ({
      data: [
        {
          id: 'c1',
          type: 'search_result',
          attributes: {
            entity_type: 'cargo',
            number: 'MSKU1234565',
            scac: 'MAEU',
            shipment_id: 's1',
          },
        },
      ],
    }));
    const get = vi.fn(async () =>
      rawShipment('s1', 'MAEU721767351', ['PO/26484-1']),
    );
    const result = await executeSearchContainers(
      { queries: ['MSKU1234565'] },
      asClient({ search, shipments: { get } }),
    );
    const row = result.results[0];
    expect(row.match).toBe('exact');
    expect(row.containers.map((c) => c.container_number)).toEqual([
      'MSKU1234565',
    ]);
    expect(row.shipments.map((s) => [s.id, s.port_of_discharge.eta])).toEqual([
      ['s1', '2026-11-27T12:00:00Z'],
    ]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it(`rejects more than ${MAX_BATCH_QUERIES} identifiers`, async () => {
    const queries = Array.from(
      { length: MAX_BATCH_QUERIES + 1 },
      (_, i) => `ID${i}`,
    );
    await expect(
      executeSearchContainers({ queries }, asClient({ search: vi.fn() })),
    ).rejects.toThrow(/at most/);
  });
});
