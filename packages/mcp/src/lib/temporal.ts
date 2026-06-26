/**
 * Temporal formatting helpers.
 *
 * Terminal timestamps (arrival, discharge, LFD, full-out) are meaningful in the
 * terminal's local timezone, not UTC. Rendering and day-delta math must happen
 * in that zone, otherwise a timestamp a few hours either side of midnight UTC
 * gets attributed to the wrong calendar day ("ETA in N days" off-by-one).
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Matches a bare calendar date with no time component, e.g. "2099-01-10". */
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True for a value that is a calendar date with no time/zone, e.g. a date-only
 * `pickup_lfd` like "2099-01-10". `new Date("2099-01-10")` parses such a value
 * as UTC midnight, which then renders/deltas one day early in west-of-UTC
 * terminal zones. We special-case these so a date-only value is treated as that
 * literal calendar day in the terminal timezone, with no UTC midnight shift.
 */
function isDateOnly(ts: string): boolean {
  return DATE_ONLY_RE.test(ts);
}

function parseTimestamp(ts: string | null | undefined): Date | null {
  if (!ts) return null;
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/**
 * Render a timestamp as a human-readable string in the given IANA timezone.
 * Falls back to UTC when no timezone is supplied, to the raw string when the
 * value cannot be parsed, and to "N/A" when the value is null/undefined.
 */
export function formatInZone(
  ts: string | null | undefined,
  timezone: string | null | undefined,
): string {
  if (ts === null || ts === undefined || ts === '') return 'N/A';
  // A date-only value (e.g. "2099-01-10") is a calendar day, not an instant.
  // Render it verbatim rather than shifting it into a UTC-midnight time that
  // would print as the previous day in west-of-UTC terminal zones.
  if (isDateOnly(ts)) return ts;
  const date = parseTimestamp(ts);
  if (!date) return ts;

  try {
    return date.toLocaleString('en-US', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    // Invalid IANA zone -> degrade gracefully to UTC.
    return date.toLocaleString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }
}

/**
 * Return the calendar date (YYYY-MM-DD) of an instant as observed in the given
 * timezone. This is the building block for off-by-one-safe day deltas.
 */
export function localCalendarDate(
  ts: string | null | undefined,
  timezone: string | null | undefined,
): string | null {
  // A date-only value already *is* the local calendar date; do not push it
  // through UTC midnight (which would slip it back a day west of UTC).
  if (ts && isDateOnly(ts)) return ts;
  const date = parseTimestamp(ts);
  if (!date) return null;
  return calendarDateForDate(date, timezone);
}

function calendarDateForDate(
  date: Date,
  timezone: string | null | undefined,
): string {
  // en-CA yields ISO-like YYYY-MM-DD output, which we can compare/parse safely.
  try {
    return date.toLocaleDateString('en-CA', {
      timeZone: timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return date.toLocaleDateString('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}

/**
 * Whole-day difference between a target timestamp and `now`, measured between
 * the two calendar dates *in the terminal's timezone*. Positive = future,
 * negative = past, 0 = same local day. Returns null for missing/invalid input.
 */
export function dayDeltaInZone(
  ts: string | null | undefined,
  timezone: string | null | undefined,
  now: Date = new Date(),
): number | null {
  // A date-only target is already the local calendar day. Using it verbatim
  // (instead of UTC midnight) keeps the count correct in west-of-UTC zones.
  let targetDay: string | null;
  if (ts && isDateOnly(ts)) {
    targetDay = ts;
  } else {
    const target = parseTimestamp(ts);
    if (!target) return null;
    targetDay = calendarDateForDate(target, timezone);
  }

  const nowDay = calendarDateForDate(now, timezone);

  // Compare the local calendar dates as UTC midnights so DST shifts inside the
  // span never leak into the day count.
  const targetMidnight = Date.parse(`${targetDay}T00:00:00Z`);
  const nowMidnight = Date.parse(`${nowDay}T00:00:00Z`);

  return Math.round((targetMidnight - nowMidnight) / MS_PER_DAY);
}
