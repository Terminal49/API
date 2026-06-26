/**
 * Demurrage / last-free-day urgency evaluation.
 *
 * Earlier code emitted a fabricated "~$75-150/day demurrage accruing / URGENT"
 * message regardless of the real data. This module instead:
 *   - surfaces the actual `fees_at_pod_terminal` (amount + currency) verbatim,
 *     inventing no per-day rate;
 *   - classifies LFD urgency from the real `pickup_lfd`; and
 *   - suppresses urgency when the underlying terminal data is stale, was never
 *     checked, or tracking has been stopped/closed — because in those cases we
 *     cannot trust availability/LFD enough to push the user to act.
 */

export interface TerminalFee {
  type?: string;
  amount?: number;
  currency_code?: string;
}

export type DemurrageUrgency = 'overdue' | 'imminent' | 'none' | 'unknown';

export interface DemurrageEvaluation {
  /** Real terminal fees, preserved as-is (null means "not reported", not "$0"). */
  fees: TerminalFee[] | null;
  /** Sum of fee amounts when fees carry amounts; null when absent/unknown. */
  total_amount: number | null;
  /** Currency of the fees when consistent/known, otherwise null. */
  currency_code: string | null;
  /** Whole days until LFD, computed by the caller's clock; null when no LFD. */
  days_until_lfd: number | null;
  urgency: DemurrageUrgency;
  /** True when a real LFD signal was withheld due to stale/closed data. */
  urgency_suppressed: boolean;
  suppression_reason: string | null;
}

interface DemurrageAttrs {
  fees_at_pod_terminal?: TerminalFee[] | null;
  pickup_lfd?: string | null;
  terminal_checked_at?: string | null;
  tracking_stopped?: boolean | null;
  /**
   * Whole days until LFD measured in the terminal's local calendar (see
   * `dayDeltaInZone`). When provided, both `days_until_lfd` and the `urgency`
   * classification are derived from this single value so the displayed count
   * and the urgency band can never disagree at a threshold boundary. When
   * omitted we fall back to a raw UTC millisecond delta from `pickup_lfd`.
   */
  days_until_lfd?: number | null;
}

/** Terminal data older than this is treated as too stale to drive urgency. */
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function summarizeFees(fees: TerminalFee[] | null | undefined): {
  fees: TerminalFee[] | null;
  total: number | null;
  currency: string | null;
} {
  if (!Array.isArray(fees)) {
    return { fees: fees == null ? null : [], total: null, currency: null };
  }
  if (fees.length === 0) {
    return { fees: [], total: 0, currency: null };
  }

  let total = 0;
  let hasAmount = false;
  const currencies = new Set<string>();
  for (const fee of fees) {
    if (typeof fee.amount === 'number' && Number.isFinite(fee.amount)) {
      total += fee.amount;
      hasAmount = true;
    }
    if (fee.currency_code) currencies.add(fee.currency_code);
  }

  return {
    fees,
    total: hasAmount ? total : null,
    currency: currencies.size === 1 ? [...currencies][0] : null,
  };
}

function isStale(
  terminalCheckedAt: string | null | undefined,
  now: Date,
): {
  stale: boolean;
  reason: string | null;
} {
  if (!terminalCheckedAt) {
    return {
      stale: true,
      reason: 'terminal availability has never been checked',
    };
  }
  const checked = new Date(terminalCheckedAt);
  if (Number.isNaN(checked.getTime())) {
    return { stale: true, reason: 'terminal_checked_at is unparseable' };
  }
  if (now.getTime() - checked.getTime() > STALE_THRESHOLD_MS) {
    return {
      stale: true,
      reason: 'terminal data is stale (last checked over 7 days ago)',
    };
  }
  return { stale: false, reason: null };
}

export function evaluateDemurrageUrgency(
  attrs: DemurrageAttrs,
  now: Date = new Date(),
): DemurrageEvaluation {
  const { fees, total, currency } = summarizeFees(attrs.fees_at_pod_terminal);

  // Prefer the caller-supplied terminal-local day count; only fall back to a
  // raw UTC delta when it is absent, so the urgency band below is classified
  // from the same number we ultimately display as `days_until_lfd`.
  let daysUntilLfd: number | null;
  if (attrs.days_until_lfd !== undefined) {
    daysUntilLfd = attrs.days_until_lfd;
  } else {
    const lfd = attrs.pickup_lfd ? new Date(attrs.pickup_lfd) : null;
    const lfdValid = lfd !== null && !Number.isNaN(lfd.getTime());
    daysUntilLfd = lfdValid
      ? Math.round((lfd!.getTime() - now.getTime()) / MS_PER_DAY)
      : null;
  }

  // Reasons to distrust the LFD/availability signal entirely.
  if (attrs.tracking_stopped) {
    return {
      fees,
      total_amount: total,
      currency_code: currency,
      days_until_lfd: daysUntilLfd,
      urgency: 'unknown',
      urgency_suppressed: true,
      suppression_reason: 'tracking is stopped/closed for this container',
    };
  }

  const staleness = isStale(attrs.terminal_checked_at, now);
  if (staleness.stale) {
    return {
      fees,
      total_amount: total,
      currency_code: currency,
      days_until_lfd: daysUntilLfd,
      urgency: 'unknown',
      urgency_suppressed: true,
      suppression_reason: staleness.reason,
    };
  }

  let urgency: DemurrageUrgency = 'unknown';
  if (daysUntilLfd !== null) {
    if (daysUntilLfd < 0) urgency = 'overdue';
    else if (daysUntilLfd <= 3) urgency = 'imminent';
    else urgency = 'none';
  }

  return {
    fees,
    total_amount: total,
    currency_code: currency,
    days_until_lfd: daysUntilLfd,
    urgency,
    urgency_suppressed: false,
    suppression_reason: null,
  };
}
