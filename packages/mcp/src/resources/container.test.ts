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
