import { describe, expect, it } from 'vitest';
import { resolveContainerStatus } from './container-status.js';

describe('resolveContainerStatus', () => {
  it('uses the API current_status verbatim as the headline status', () => {
    const result = resolveContainerStatus({
      current_status: 'available',
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
      available_for_pickup: true,
    });

    expect(result.status).toBe('available');
    expect(result.status_source).toBe('current_status');
  });

  it('falls back to a derived lifecycle label only when current_status is absent', () => {
    const result = resolveContainerStatus({
      pod_arrived_at: null,
      pod_discharged_at: null,
    });

    // No API status to surface, so the headline is the derived label.
    expect(result.status).toBe('in_transit');
    expect(result.status_source).toBe('derived');
  });

  it('never reports a delivered lifecycle when delivered_at is null', () => {
    // pod_full_out_at is set but the API has NOT confirmed delivery.
    const result = resolveContainerStatus({
      current_status: 'picked_up',
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
      pod_full_out_at: '2026-01-06T00:00:00Z',
      delivered_at: null,
    });

    expect(result.status).toBe('picked_up');
    expect(result.derived_lifecycle).not.toBe('delivered');
  });

  it('reports a delivered lifecycle only when delivered_at is present', () => {
    const result = resolveContainerStatus({
      current_status: 'delivered',
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
      delivered_at: '2026-01-07T00:00:00Z',
    });

    expect(result.derived_lifecycle).toBe('delivered');
  });

  it('marks the derived lifecycle as non-authoritative steering metadata', () => {
    const result = resolveContainerStatus({
      current_status: 'on_rail',
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
      pod_rail_loaded_at: '2026-01-03T00:00:00Z',
    });

    expect(result.lifecycle_is_authoritative).toBe(false);
    expect(result.derived_lifecycle).toBe('on_rail');
  });

  it('derives discharged vs available_for_pickup from availability', () => {
    const discharged = resolveContainerStatus({
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
      available_for_pickup: false,
    });
    expect(discharged.derived_lifecycle).toBe('discharged');

    const available = resolveContainerStatus({
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
      available_for_pickup: true,
    });
    expect(available.derived_lifecycle).toBe('available_for_pickup');
  });

  it('handles a completely empty attribute object without throwing', () => {
    const result = resolveContainerStatus({});
    expect(result.status).toBe('in_transit');
    expect(result.status_source).toBe('derived');
  });
});
