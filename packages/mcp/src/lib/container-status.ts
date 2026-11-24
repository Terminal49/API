/**
 * Container status resolution and display labels.
 *
 * The Terminal49 API returns a `current_status` code on every container, such
 * as `grounded`. Users know the dashboard's labels, such as "At Terminal", so
 * every tool shows the label and never the code. This file is the only place
 * that maps codes to labels.
 *
 * When the API has no `current_status`, the status is worked out from the
 * milestones and reported with `status_source: 'derived'`. The derived status
 * is never "Delivered" unless the API has set `delivered_at`.
 */

/** The dashboard's label for each `current_status` code. */
export const CONTAINER_STATUS_LABELS = {
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
} as const satisfies Record<string, string>;

const LABEL_BY_CODE: ReadonlyMap<string, string> = new Map(
  Object.entries(CONTAINER_STATUS_LABELS),
);

/** Every dashboard status label. */
export const CONTAINER_STATUS_LABEL_LIST: readonly string[] = Object.values(
  CONTAINER_STATUS_LABELS,
);

/** One sentence that explains the label users find least obvious. */
export const OFF_DOCK_EXPLANATION =
  'Available at Shippers means the terminal moved the container to an off-dock yard outside the terminal, where it waits for pickup.';

/**
 * The dashboard label for a status code. An unknown code is humanized, like the
 * dashboard export: underscores become spaces and the first letter is upper case.
 */
export function statusLabel(code: string): string;
export function statusLabel(code: string | null | undefined): string | null;
export function statusLabel(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (trimmed.length === 0) return null;
  const known = LABEL_BY_CODE.get(trimmed);
  if (known) return known;
  const spaced = trimmed.replace(/_+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const CODE_BY_NAME: ReadonlyMap<string, string> = new Map(
  Object.entries(CONTAINER_STATUS_LABELS).flatMap(([code, label]) => [
    [code, code],
    [label.toLowerCase(), code],
  ]),
);

/**
 * The status code for a label or a code, ignoring case and surrounding spaces.
 * Returns undefined when the value names no known status.
 */
export function statusCode(value: string): string | undefined {
  return CODE_BY_NAME.get(value.trim().toLowerCase());
}

export interface ContainerStatusResult {
  /** The dashboard label, from the API `current_status` when it has one. */
  status: string;
  /** Where the status came from: the API field or the milestones. */
  status_source: 'current_status' | 'derived';
}

interface ContainerStatusAttrs {
  current_status?: string | null;
  delivered_at?: string | null;
  pod_arrived_at?: string | null;
  pod_discharged_at?: string | null;
  pod_rail_loaded_at?: string | null;
  final_destination_full_out_at?: string | null;
  available_for_pickup?: boolean | null;
}

/**
 * The status code that best matches the milestones. Used only when the API has
 * no `current_status`. Delivery is gated strictly on `delivered_at`.
 */
function deriveStatusCode(attrs: ContainerStatusAttrs): string {
  if (!attrs.pod_arrived_at || !attrs.pod_discharged_at) return 'on_ship';
  if (attrs.delivered_at) return 'delivered';
  if (attrs.pod_rail_loaded_at && !attrs.final_destination_full_out_at) {
    return 'on_rail';
  }
  if (attrs.available_for_pickup === true) return 'available';
  if (attrs.available_for_pickup === false) return 'not_available';
  return 'grounded';
}

export function resolveContainerStatus(
  attrs: ContainerStatusAttrs,
): ContainerStatusResult {
  const apiStatus = statusLabel(attrs.current_status);
  if (apiStatus) return { status: apiStatus, status_source: 'current_status' };
  return {
    status: statusLabel(deriveStatusCode(attrs)),
    status_source: 'derived',
  };
}
