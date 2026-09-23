import { type Terminal49Client } from '@terminal49/sdk';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { executeGetContainer } from './get-container.js';

async function getDeadline(
  unified?: { current_value: string | null; current_selection: string | null },
  timezone: string | null = 'America/Los_Angeles',
) {
  // SAFETY: executeGetContainer only uses containers.get; the mock supplies its raw response.
  const client = {
    containers: {
      get: vi.fn().mockResolvedValue({
        raw: {
          data: {
            id: 'container-1',
            attributes: {
              number: 'HLCU1234568',
              current_status: 'available',
              pickup_lfd: '2026-09-30T00:00:00Z',
              pod_timezone: timezone,
              terminal_checked_at: new Date().toISOString(),
              import_deadlines: {
                pod: unified ? { unified } : undefined,
                pickup_lfd_rail: '2026-09-28T00:00:00Z',
              },
            },
          },
        },
      }),
    },
  } as unknown as Terminal49Client;
  return (await executeGetContainer({ id: 'container-1' }, client)).demurrage;
}

afterEach(() => vi.useRealTimers());

describe('get_container POD deadline', () => {
  it('uses the API-selected value and source, with one local date for display and urgency', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
    const result = await getDeadline({
      current_value: '2026-09-21T00:00:00Z',
      current_selection: 'facility_manual',
    });
    expect(result.pickup_lfd).toBe('2026-09-21T00:00:00Z');
    expect(result.pickup_lfd_source).toBe('facility_manual');
    expect(result.pickup_lfd_local_date).toBe('2026-09-20');
    expect(result.pickup_lfd_local).toContain('09/20/2026');
    expect(result.days_until_lfd).toBe(-3);
    expect(result.urgency).toBe('overdue');
    expect(result.last_free_days.rail).toBe('2026-09-28T00:00:00Z');
  });

  it.each([undefined, { current_value: null, current_selection: null }])(
    'keeps missing or withheld deadlines unknown despite a legacy value',
    async (unified) => {
      const result = await getDeadline(unified);
      expect(result.pickup_lfd).toBeNull();
      expect(result.pickup_lfd_source).toBeNull();
      expect(result.pickup_lfd_local_date).toBeNull();
      expect(result.days_until_lfd).toBeNull();
      expect(result.urgency).toBe('unknown');
    },
  );

  it('preserves date-only deadlines and labels calculated sources', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T01:00:00Z'));
    const result = await getDeadline({
      current_value: '2026-09-23',
      current_selection: 'line_calculated',
    });
    expect(result.pickup_lfd_local_date).toBe('2026-09-23');
    expect(result.pickup_lfd_source).toBe('line_calculated');
    expect(result.days_until_lfd).toBe(1);
  });

  it('uses local calendar days across DST', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-02T08:30:00Z'));
    const result = await getDeadline({
      current_value: '2026-11-01T07:30:00Z',
      current_selection: 'line',
    });
    expect(result.pickup_lfd_local_date).toBe('2026-11-01');
    expect(result.days_until_lfd).toBe(-1);
  });

  it('uses UTC when the API cannot supply a timezone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
    const result = await getDeadline(
      { current_value: '2026-09-21T00:00:00Z', current_selection: 'line' },
      null,
    );
    expect(result.pickup_lfd_local_date).toBe('2026-09-21');
    expect(result.days_until_lfd).toBe(-2);
  });
});
