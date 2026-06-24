import { describe, expect, it } from 'vitest';
import { evaluateDemurrageUrgency } from './demurrage.js';

const NOW = new Date('2026-02-10T00:00:00Z');

describe('evaluateDemurrageUrgency', () => {
  it('surfaces real fees with currency and never fabricates a per-day estimate', () => {
    const result = evaluateDemurrageUrgency(
      {
        fees_at_pod_terminal: [
          { type: 'demurrage', amount: 320, currency_code: 'USD' },
          { type: 'exam', amount: 75, currency_code: 'USD' },
        ],
        terminal_checked_at: '2026-02-09T00:00:00Z',
      },
      NOW,
    );

    expect(result.fees).toEqual([
      { type: 'demurrage', amount: 320, currency_code: 'USD' },
      { type: 'exam', amount: 75, currency_code: 'USD' },
    ]);
    expect(result.total_amount).toBe(395);
    expect(result.currency_code).toBe('USD');
    // No invented "~$75-150/day" guidance anywhere in the output.
    expect(JSON.stringify(result)).not.toMatch(/\/day/);
    expect(JSON.stringify(result)).not.toMatch(/75-150/);
  });

  it('flags overdue urgency when LFD is in the past and data is fresh', () => {
    const result = evaluateDemurrageUrgency(
      {
        pickup_lfd: '2026-02-05T00:00:00Z',
        terminal_checked_at: '2026-02-09T00:00:00Z',
      },
      NOW,
    );

    expect(result.urgency).toBe('overdue');
    expect(result.days_until_lfd).toBe(-5);
    expect(result.urgency_suppressed).toBe(false);
  });

  it('flags imminent urgency when LFD is within 3 days and data is fresh', () => {
    const result = evaluateDemurrageUrgency(
      {
        pickup_lfd: '2026-02-12T00:00:00Z',
        terminal_checked_at: '2026-02-09T00:00:00Z',
      },
      NOW,
    );

    expect(result.urgency).toBe('imminent');
    expect(result.days_until_lfd).toBe(2);
  });

  it('suppresses urgency when terminal data is stale', () => {
    const result = evaluateDemurrageUrgency(
      {
        pickup_lfd: '2026-02-05T00:00:00Z',
        // Last checked 20 days before now -> stale (default threshold 7d).
        terminal_checked_at: '2026-01-21T00:00:00Z',
      },
      NOW,
    );

    expect(result.urgency).toBe('unknown');
    expect(result.urgency_suppressed).toBe(true);
    expect(result.suppression_reason).toContain('stale');
  });

  it('suppresses urgency when tracking is stopped/closed', () => {
    const result = evaluateDemurrageUrgency(
      {
        pickup_lfd: '2026-02-05T00:00:00Z',
        terminal_checked_at: '2026-02-09T00:00:00Z',
        tracking_stopped: true,
      },
      NOW,
    );

    expect(result.urgency).toBe('unknown');
    expect(result.urgency_suppressed).toBe(true);
    expect(result.suppression_reason).toContain('tracking');
  });

  it('suppresses urgency when terminal was never checked', () => {
    const result = evaluateDemurrageUrgency(
      {
        pickup_lfd: '2026-02-05T00:00:00Z',
        terminal_checked_at: null,
      },
      NOW,
    );

    expect(result.urgency).toBe('unknown');
    expect(result.urgency_suppressed).toBe(true);
  });

  it('reports no urgency (none) when LFD is comfortably in the future', () => {
    const result = evaluateDemurrageUrgency(
      {
        pickup_lfd: '2026-03-01T00:00:00Z',
        terminal_checked_at: '2026-02-09T00:00:00Z',
      },
      NOW,
    );

    expect(result.urgency).toBe('none');
    expect(result.urgency_suppressed).toBe(false);
  });

  it('preserves null fees as null rather than coercing to an empty array', () => {
    const result = evaluateDemurrageUrgency(
      {
        fees_at_pod_terminal: null,
        terminal_checked_at: '2026-02-09T00:00:00Z',
      },
      NOW,
    );

    expect(result.fees).toBeNull();
    expect(result.total_amount).toBeNull();
  });
});
