/**
 * Container status resolution.
 *
 * The Terminal49 API ships an authoritative `current_status` enum on every
 * container. That value is the single source of truth for the headline status
 * and MUST be surfaced verbatim — earlier code invented its own vocabulary,
 * producing a three-way divergence (API status vs. derived lifecycle vs. search
 * status). Here the API status is the headline; the derived lifecycle is kept
 * only as clearly-labeled, non-authoritative steering metadata to help select
 * follow-up tooling.
 *
 * The one hard rule on the derived lifecycle: never label a container
 * "delivered" unless the API has actually set `delivered_at`.
 */

export type DerivedLifecycle =
  | 'in_transit'
  | 'arrived'
  | 'discharged'
  | 'available_for_pickup'
  | 'at_terminal'
  | 'on_rail'
  | 'delivered';

export interface ContainerStatusResult {
  /** Headline status shown to the user. Prefers the API `current_status`. */
  status: string;
  /** Where the headline came from: the API field or our derived fallback. */
  status_source: 'current_status' | 'derived';
  /** Heuristic lifecycle stage — steering metadata only, NOT authoritative. */
  derived_lifecycle: DerivedLifecycle;
  /** Always false: the derived lifecycle must never be treated as truth. */
  lifecycle_is_authoritative: false;
}

interface ContainerStatusAttrs {
  current_status?: string | null;
  delivered_at?: string | null;
  pod_arrived_at?: string | null;
  pod_discharged_at?: string | null;
  pod_rail_loaded_at?: string | null;
  pod_full_out_at?: string | null;
  final_destination_full_out_at?: string | null;
  available_for_pickup?: boolean | null;
}

/**
 * Compute a derived lifecycle stage from raw milestone timestamps. Used only as
 * steering metadata. Delivery is gated strictly on `delivered_at` being set.
 */
function deriveLifecycle(attrs: ContainerStatusAttrs): DerivedLifecycle {
  if (!attrs.pod_arrived_at) return 'in_transit';
  if (!attrs.pod_discharged_at) return 'arrived';

  // Only the API's explicit delivery confirmation may yield "delivered".
  if (attrs.delivered_at) return 'delivered';

  if (attrs.pod_rail_loaded_at && !attrs.final_destination_full_out_at) {
    return 'on_rail';
  }

  if (attrs.available_for_pickup === true) return 'available_for_pickup';
  if (attrs.available_for_pickup === false) return 'discharged';
  return 'at_terminal';
}

export function resolveContainerStatus(
  attrs: ContainerStatusAttrs,
): ContainerStatusResult {
  const derived = deriveLifecycle(attrs);
  const apiStatus =
    typeof attrs.current_status === 'string' && attrs.current_status.length > 0
      ? attrs.current_status
      : null;

  return {
    status: apiStatus ?? derived,
    status_source: apiStatus ? 'current_status' : 'derived',
    derived_lifecycle: derived,
    lifecycle_is_authoritative: false,
  };
}
