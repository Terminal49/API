import { describe, expect, it } from 'vitest';
import { dayDeltaInZone, formatInZone, localCalendarDate } from './temporal.js';

describe('formatInZone', () => {
  it('renders a timestamp in the supplied IANA timezone', () => {
    // 2026-02-11T02:00:00Z is 2026-02-10 21:00 in New York (EST, UTC-5).
    const text = formatInZone('2026-02-11T02:00:00Z', 'America/New_York');
    expect(text).toContain('2026');
    expect(text).toContain('02/10');
  });

  it('renders the same instant differently across zones', () => {
    const ny = formatInZone('2026-02-11T02:00:00Z', 'America/New_York');
    const la = formatInZone('2026-02-11T02:00:00Z', 'America/Los_Angeles');
    expect(ny).not.toBe(la);
  });

  it('returns N/A for null and falls back to the raw value for unparseable input', () => {
    expect(formatInZone(null, 'America/New_York')).toBe('N/A');
    expect(formatInZone('not-a-date', 'America/New_York')).toBe('not-a-date');
  });

  it('falls back to UTC rendering when timezone is missing', () => {
    const text = formatInZone('2026-02-11T02:00:00Z', null);
    expect(text).toContain('2026');
  });
});

describe('localCalendarDate', () => {
  it('returns the terminal-local calendar date, not the UTC date', () => {
    // 02:00Z on the 11th is still the 10th in New York.
    expect(localCalendarDate('2026-02-11T02:00:00Z', 'America/New_York')).toBe(
      '2026-02-10',
    );
  });
});

describe('dayDeltaInZone', () => {
  it('computes day deltas in terminal-local time without a UTC off-by-one', () => {
    // ETA: 2026-02-11T02:00:00Z -> 2026-02-10 (NY).
    // Now: 2026-02-10T20:00:00Z -> 2026-02-10 15:00 (NY).
    // Same NY calendar day -> 0 days, even though naive UTC ceil yields 1.
    const delta = dayDeltaInZone(
      '2026-02-11T02:00:00Z',
      'America/New_York',
      new Date('2026-02-10T20:00:00Z'),
    );
    expect(delta).toBe(0);
  });

  it('counts a full local day ahead as +1', () => {
    const delta = dayDeltaInZone(
      '2026-02-12T02:00:00Z', // 2026-02-11 NY
      'America/New_York',
      new Date('2026-02-10T20:00:00Z'), // 2026-02-10 NY
    );
    expect(delta).toBe(1);
  });

  it('counts a local day in the past as negative', () => {
    const delta = dayDeltaInZone(
      '2026-02-08T12:00:00Z', // 2026-02-08 NY
      'America/New_York',
      new Date('2026-02-10T20:00:00Z'), // 2026-02-10 NY
    );
    expect(delta).toBe(-2);
  });

  it('returns null for null or unparseable timestamps', () => {
    expect(dayDeltaInZone(null, 'America/New_York', new Date())).toBeNull();
    expect(dayDeltaInZone('nope', 'America/New_York', new Date())).toBeNull();
  });
});
