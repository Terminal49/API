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

  it('renders a date-only value verbatim without a west-of-UTC day shift', () => {
    // "2099-01-10" parsed as UTC midnight would print as 01/09 in Los Angeles;
    // a date-only LFD must stay on its own calendar day.
    expect(formatInZone('2099-01-10', 'America/Los_Angeles')).toBe(
      '2099-01-10',
    );
  });
});

describe('localCalendarDate', () => {
  it('returns the terminal-local calendar date, not the UTC date', () => {
    // 02:00Z on the 11th is still the 10th in New York.
    expect(localCalendarDate('2026-02-11T02:00:00Z', 'America/New_York')).toBe(
      '2026-02-10',
    );
  });

  it('returns a date-only value unchanged regardless of timezone', () => {
    expect(localCalendarDate('2099-01-10', 'America/Los_Angeles')).toBe(
      '2099-01-10',
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

  it('treats a date-only LFD as its literal calendar day, not UTC midnight', () => {
    // A date-only LFD of 2099-01-10 is exactly 1 day after the 2099-01-09
    // local day in Los Angeles. Parsing it as UTC midnight would land it on
    // 2099-01-09 LA and yield 0 — the off-by-one this guards against.
    const delta = dayDeltaInZone(
      '2099-01-10',
      'America/Los_Angeles',
      // 2099-01-09 18:00Z -> 2099-01-09 10:00 LA.
      new Date('2099-01-09T18:00:00Z'),
    );
    expect(delta).toBe(1);
  });
});
