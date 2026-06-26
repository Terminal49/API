import { describe, expect, it, vi } from 'vitest';
import { matchesContainerUri, readContainerResource } from './container.js';

describe('container resource', () => {
  it('requests raw container payload and renders summary fields', async () => {
    const client = {
      getContainer: vi.fn().mockResolvedValue({
        data: {
          attributes: {
            number: 'MSCU1234567',
            available_for_pickup: true,
            location_at_pod_terminal: 'YARD-12',
            updated_at: '2026-02-18T00:00:00Z',
          },
        },
      }),
    } as any;

    const uri = 'terminal49://container/123e4567-e89b-12d3-a456-426614174000';
    const resource = await readContainerResource(uri, client);

    expect(client.getContainer).toHaveBeenCalledWith(
      '123e4567-e89b-12d3-a456-426614174000',
      ['shipment', 'pod_terminal'],
      { format: 'raw' },
    );
    expect(resource.text).toContain('Container MSCU1234567');
    expect(resource.text).toContain('Available for Pickup:** Yes');
  });

  it('suppresses LFD urgency when the sideloaded shipment has tracking stopped', async () => {
    const client = {
      getContainer: vi.fn().mockResolvedValue({
        data: {
          attributes: {
            number: 'MSCU1234567',
            available_for_pickup: true,
            // Fresh terminal data + near-future LFD would normally NOT suppress;
            // only the shipment-level tracking-stopped flag should.
            terminal_checked_at: new Date().toISOString(),
            pickup_lfd: new Date(
              Date.now() + 2 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
          relationships: {
            shipment: { data: { id: 'shipment-9', type: 'shipment' } },
          },
        },
        included: [
          {
            id: 'shipment-9',
            type: 'shipment',
            attributes: {
              line_tracking_stopped_at: '2026-01-01T00:00:00Z',
              line_tracking_stopped_reason: 'all_containers_terminated',
            },
          },
        ],
      }),
    } as any;

    const uri = 'terminal49://container/123e4567-e89b-12d3-a456-426614174000';
    const resource = await readContainerResource(uri, client);

    expect(resource.text).toContain('LFD Urgency:** Unavailable');
    expect(resource.text).toContain('tracking is stopped');
  });

  it('does not suppress LFD urgency when no sideloaded shipment is present', async () => {
    const client = {
      getContainer: vi.fn().mockResolvedValue({
        data: {
          attributes: {
            number: 'MSCU1234567',
            available_for_pickup: true,
            terminal_checked_at: new Date().toISOString(),
            pickup_lfd: new Date(
              Date.now() + 2 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
          relationships: {
            shipment: { data: { id: 'shipment-9', type: 'shipment' } },
          },
        },
        // Shipment relationship declared but not actually included.
        included: [],
      }),
    } as any;

    const uri = 'terminal49://container/123e4567-e89b-12d3-a456-426614174000';
    const resource = await readContainerResource(uri, client);

    expect(resource.text).not.toContain('LFD Urgency:** Unavailable');
  });

  it('renders the authoritative current_status in the headline', async () => {
    const client = {
      getContainer: vi.fn().mockResolvedValue({
        data: {
          attributes: {
            number: 'MSCU1234567',
            current_status: 'available',
          },
        },
      }),
    } as any;

    const uri = 'terminal49://container/123e4567-e89b-12d3-a456-426614174000';
    const resource = await readContainerResource(uri, client);

    expect(resource.text).toContain('**Status:** available');
  });

  it('renders reported demurrage fees with their total and currency', async () => {
    const client = {
      getContainer: vi.fn().mockResolvedValue({
        data: {
          attributes: {
            number: 'MSCU1234567',
            terminal_checked_at: new Date().toISOString(),
            fees_at_pod_terminal: [
              { type: 'demurrage', amount: 320, currency_code: 'USD' },
              { type: 'exam', amount: 75, currency_code: 'USD' },
            ],
          },
        },
      }),
    } as any;

    const uri = 'terminal49://container/123e4567-e89b-12d3-a456-426614174000';
    const resource = await readContainerResource(uri, client);

    expect(resource.text).toContain('**Fees:** 2 (total 395 USD)');
    // Never invent a per-day demurrage estimate from the raw fees.
    expect(resource.text).not.toMatch(/\/day/);
  });

  it('distinguishes "None" fees from "Not reported" fees', async () => {
    const reported = {
      getContainer: vi.fn().mockResolvedValue({
        data: {
          attributes: { number: 'A', fees_at_pod_terminal: [] },
        },
      }),
    } as any;
    const absent = {
      getContainer: vi.fn().mockResolvedValue({
        data: { attributes: { number: 'A' } },
      }),
    } as any;
    const uri = 'terminal49://container/123e4567-e89b-12d3-a456-426614174000';

    expect((await readContainerResource(uri, reported)).text).toContain(
      '**Fees:** None',
    );
    expect((await readContainerResource(uri, absent)).text).toContain(
      '**Fees:** Not reported',
    );
  });

  it('omits the LFD Urgency line and trailing blank lines when not suppressed', async () => {
    const client = {
      getContainer: vi.fn().mockResolvedValue({
        data: {
          attributes: {
            number: 'MSCU1234567',
            terminal_checked_at: new Date().toISOString(),
            pickup_lfd: new Date(
              Date.now() + 2 * 24 * 60 * 60 * 1000,
            ).toISOString(),
          },
        },
      }),
    } as any;

    const uri = 'terminal49://container/123e4567-e89b-12d3-a456-426614174000';
    const resource = await readContainerResource(uri, client);

    expect(resource.text).not.toContain('LFD Urgency:** Unavailable');
    // No rail carrier and no suppression -> output must not end in blank lines.
    expect(resource.text).not.toMatch(/\n\s*\n\s*$/);
    expect(resource.text.trimEnd()).toBe(resource.text);
  });

  it('renders a rail section when a rail carrier is present', async () => {
    const client = {
      getContainer: vi.fn().mockResolvedValue({
        data: {
          attributes: {
            number: 'MSCU1234567',
            pod_rail_carrier_scac: 'BNSF',
          },
        },
      }),
    } as any;

    const uri = 'terminal49://container/123e4567-e89b-12d3-a456-426614174000';
    const resource = await readContainerResource(uri, client);

    expect(resource.text).toContain('## Rail Information');
    expect(resource.text).toContain('**Rail Carrier:** BNSF');
  });

  it('validates URI format', async () => {
    expect(
      matchesContainerUri(
        'terminal49://container/123e4567-e89b-12d3-a456-426614174000',
      ),
    ).toBe(true);
    expect(matchesContainerUri('terminal49://container/not-a-uuid')).toBe(
      false,
    );

    await expect(
      readContainerResource('terminal49://container/not-a-uuid', {
        getContainer: vi.fn(),
      } as any),
    ).rejects.toThrow('Invalid container URI format');
  });
});
