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

  it('validates URI format', async () => {
    expect(matchesContainerUri('terminal49://container/123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(matchesContainerUri('terminal49://container/not-a-uuid')).toBe(false);

    await expect(
      readContainerResource('terminal49://container/not-a-uuid', { getContainer: vi.fn() } as any),
    ).rejects.toThrow('Invalid container URI format');
  });
});
