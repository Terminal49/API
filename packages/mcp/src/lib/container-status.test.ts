import { describe, expect, it } from 'vite-plus/test';
import {
  CONTAINER_STATUS_LABELS,
  resolveContainerStatus,
  statusCode,
  statusLabel,
} from './container-status.js';

describe('statusLabel', () => {
  it('maps every code to the dashboard label', () => {
    expect(CONTAINER_STATUS_LABELS).toEqual({
      new: 'No Status',
      loaded: 'Loaded',
      available: 'Available',
      not_available: 'Not available',
      on_ship: 'On Ship',
      on_rail: 'On Rail',
      grounded: 'At Terminal',
      picked_up: 'Picked up',
      dropped: 'Dropped',
      delivered: 'Delivered',
      off_dock: 'Available at Shippers',
      empty_returned: 'Empty Returned',
      awaiting_inland_transfer: 'Awaiting Inland Transfer',
    });
    expect(statusLabel('grounded')).toBe('At Terminal');
    expect(statusLabel('off_dock')).toBe('Available at Shippers');
  });

  it('humanizes an unknown code like the dashboard export', () => {
    expect(statusLabel('held_at_customs')).toBe('Held at customs');
    expect(statusLabel('transferred')).toBe('Transferred');
  });

  it('returns null for a missing or blank code', () => {
    expect(statusLabel(null)).toBeNull();
    expect(statusLabel(undefined)).toBeNull();
    expect(statusLabel('  ')).toBeNull();
  });
});

describe('statusCode', () => {
  it('reads a label or a code, ignoring case', () => {
    expect(statusCode('At Terminal')).toBe('grounded');
    expect(statusCode('at terminal')).toBe('grounded');
    expect(statusCode(' NOT AVAILABLE ')).toBe('not_available');
    expect(statusCode('grounded')).toBe('grounded');
    expect(statusCode('Picked_Up')).toBe('picked_up');
  });

  it('returns undefined for an unknown status', () => {
    expect(statusCode('Ready')).toBeUndefined();
    expect(statusCode('')).toBeUndefined();
  });
});

describe('resolveContainerStatus', () => {
  it('shows the label of the API current_status', () => {
    const result = resolveContainerStatus({
      current_status: 'grounded',
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
      available_for_pickup: true,
    });

    expect(result).toEqual({
      status: 'At Terminal',
      status_source: 'current_status',
    });
  });

  it('derives a dashboard label only when current_status is absent', () => {
    expect(resolveContainerStatus({})).toEqual({
      status: 'On Ship',
      status_source: 'derived',
    });
    expect(
      resolveContainerStatus({ pod_arrived_at: '2026-01-01T00:00:00Z' }).status,
    ).toBe('On Ship');
  });

  it('derives Available or Not available from availability after discharge', () => {
    const discharged = {
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
    };
    expect(
      resolveContainerStatus({ ...discharged, available_for_pickup: true })
        .status,
    ).toBe('Available');
    expect(
      resolveContainerStatus({ ...discharged, available_for_pickup: false })
        .status,
    ).toBe('Not available');
    expect(resolveContainerStatus(discharged).status).toBe('At Terminal');
    expect(
      resolveContainerStatus({
        ...discharged,
        pod_rail_loaded_at: '2026-01-03T00:00:00Z',
      }).status,
    ).toBe('On Rail');
  });

  it('derives Delivered only when delivered_at is present', () => {
    const discharged = {
      pod_arrived_at: '2026-01-01T00:00:00Z',
      pod_discharged_at: '2026-01-02T00:00:00Z',
    };
    expect(
      resolveContainerStatus({ ...discharged, delivered_at: null }).status,
    ).not.toBe('Delivered');
    expect(
      resolveContainerStatus({
        ...discharged,
        delivered_at: '2026-01-07T00:00:00Z',
      }).status,
    ).toBe('Delivered');
  });
});
