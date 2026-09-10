/**
 * get_container tool
 * Retrieves detailed container information by Terminal49 ID.
 *
 * The Zod input schema lives in server.ts (single source of truth); this file
 * only owns the execution + curation logic.
 */

import { Terminal49Client } from '@terminal49/sdk';
import {
  type ContainerStatusResult,
  resolveContainerStatus,
} from '../lib/container-status.js';
import {
  type DemurrageEvaluation,
  evaluateDemurrageUrgency,
} from '../lib/demurrage.js';
import { logMcpEvent } from '../logging.js';
import { dayDeltaInZone, formatInZone } from '../lib/temporal.js';

export type ContainerInclude = 'shipment' | 'pod_terminal' | 'transport_events';

/** The default sideloads. `include` augments — never replaces — these. */
const DEFAULT_INCLUDES: ContainerInclude[] = ['shipment', 'pod_terminal'];

export interface GetContainerArgs {
  id: string;
  include?: ContainerInclude[];
}

export interface ContainerStatus {
  id: string;
  container_number: string;
  /** Authoritative headline status from the API `current_status`. */
  status: string;
  status_source: ContainerStatusResult['status_source'];
  equipment: {
    type: string | null;
    length: number | null;
    height: string | null;
    weight_lbs: number | null;
  };
  location: {
    current_location: string | null;
    available_for_pickup: boolean | null;
    availability_known: boolean | null;
    pod_arrived_at: string | null;
    pod_arrived_at_local: string;
    pod_discharged_at: string | null;
    pod_discharged_at_local: string;
    pod_timezone: string | null;
  };
  demurrage: {
    pickup_lfd: string | null;
    pickup_lfd_local: string;
    /** Per-channel LFDs from import_deadlines (terminal/rail/line). */
    last_free_days: {
      terminal: string | null;
      rail: string | null;
      line: string | null;
    };
    pickup_appointment_at: string | null;
    fees_at_pod_terminal: DemurrageEvaluation['fees'];
    fees_total_amount: number | null;
    fees_currency_code: string | null;
    holds_at_pod_terminal: unknown[] | null;
    urgency: DemurrageEvaluation['urgency'];
    urgency_suppressed: boolean;
    urgency_reason: string | null;
    days_until_lfd: number | null;
  };
  rail: {
    pod_rail_carrier: string | null;
    pod_rail_loaded_at: string | null;
    destination_eta: string | null;
    destination_ata: string | null;
  };
  shipment: {
    id: string;
    ref_numbers: string[];
    line: string;
    shipping_line_name?: string;
    port_of_lading_name?: string;
    port_of_discharge_name?: string;
    destination_name?: string;
  } | null;
  pod_terminal: {
    id: string;
    name: string;
    firms_code: string;
  } | null;
  events?: {
    count: number;
    latest_event?: {
      event: string;
      timestamp: string;
      location?: string;
    };
    rail_events_count?: number;
  };
  created_at: string;
  _metadata: {
    container_state: string;
    status_is_authoritative: boolean;
    derived_lifecycle: string;
    includes_loaded: string[];
  };
}

/** Merge requested includes onto the defaults, de-duplicated, order-stable. */
export function resolveIncludes(
  requested: ContainerInclude[] | undefined,
): ContainerInclude[] {
  const merged: ContainerInclude[] = [...DEFAULT_INCLUDES];
  for (const inc of requested ?? []) {
    if (!merged.includes(inc)) merged.push(inc);
  }
  return merged;
}

export async function executeGetContainer(
  args: GetContainerArgs,
  client: Terminal49Client,
): Promise<ContainerStatus> {
  if (!args.id || args.id.trim() === '') {
    throw new Error('Container ID is required');
  }

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'get_container',
    container_id: args.id,
    timestamp: new Date().toISOString(),
  });

  try {
    const includes = resolveIncludes(args.include);
    const result = await client.containers.get(args.id, includes, {
      format: 'raw',
    });
    const raw = (result as any)?.raw ?? result;

    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'get_container',
      container_id: args.id,
      includes,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    return formatContainerResponse(raw, includes);
  } catch (error) {
    const duration = Date.now() - startTime;
    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'get_container',
      container_id: args.id,
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

function formatContainerResponse(
  apiResponse: any,
  includes: string[],
): ContainerStatus {
  const container = apiResponse.data?.attributes || {};
  const relationships = apiResponse.data?.relationships || {};
  const included = apiResponse.included || [];

  const statusResult = resolveContainerStatus(container);

  // Extract shipment info
  const shipmentId = relationships.shipment?.data?.id;
  const shipment = included.find(
    (item: any) => item.id === shipmentId && item.type === 'shipment',
  );

  // Extract terminal info
  const terminalId = relationships.pod_terminal?.data?.id;
  const podTerminal = included.find(
    (item: any) => item.id === terminalId && item.type === 'terminal',
  );

  // Extract transport events
  const transportEvents = included.filter(
    (item: any) => item.type === 'transport_event',
  );

  const eventsData = includes.includes('transport_events')
    ? formatEventsData(transportEvents)
    : undefined;

  const podTimezone: string | null = container.pod_timezone ?? null;
  // Compute the LFD countdown in terminal-local days so "N days until LFD" never
  // lands on the wrong calendar day near a UTC midnight boundary, then feed that
  // same count into the urgency classifier — otherwise `urgency` (raw UTC delta)
  // and the displayed `days_until_lfd` (terminal-local) could disagree at a
  // threshold (e.g. 3 vs 4 days).
  const localDaysUntilLfd = dayDeltaInZone(container.pickup_lfd, podTimezone);
  const demurrage: DemurrageEvaluation = evaluateDemurrageUrgency({
    fees_at_pod_terminal: container.fees_at_pod_terminal,
    pickup_lfd: container.pickup_lfd ?? null,
    terminal_checked_at: container.terminal_checked_at ?? null,
    // line_tracking_stopped_* lives on the SHIPMENT, not the container, so we
    // read it from the sideloaded shipment. When the shipment isn't included we
    // fall back to "not stopped" rather than crash.
    tracking_stopped: isTrackingStopped(shipment),
    days_until_lfd: localDaysUntilLfd,
  });

  const importDeadlines = container.import_deadlines || {};

  const metadata = generateMetadata(statusResult, includes);

  return {
    id: apiResponse.data?.id,
    container_number: container.number,
    status: statusResult.status,
    status_source: statusResult.status_source,
    equipment: {
      type: container.equipment_type ?? null,
      // equipment_length is a numeric enum (10|20|40|45). Guard the 0/empty
      // sentinel so we never emit a meaningless "".
      length: normalizeEquipmentLength(container.equipment_length),
      height: container.equipment_height ?? null,
      weight_lbs:
        typeof container.weight_in_lbs === 'number'
          ? container.weight_in_lbs
          : null,
    },
    location: {
      current_location: container.location_at_pod_terminal ?? null,
      available_for_pickup: container.available_for_pickup ?? null,
      availability_known: container.availability_known ?? null,
      pod_arrived_at: container.pod_arrived_at ?? null,
      pod_arrived_at_local: formatInZone(container.pod_arrived_at, podTimezone),
      pod_discharged_at: container.pod_discharged_at ?? null,
      pod_discharged_at_local: formatInZone(
        container.pod_discharged_at,
        podTimezone,
      ),
      pod_timezone: podTimezone,
    },
    demurrage: {
      pickup_lfd: container.pickup_lfd ?? null,
      pickup_lfd_local: formatInZone(container.pickup_lfd, podTimezone),
      last_free_days: {
        terminal: importDeadlines.pickup_lfd_terminal ?? null,
        rail: importDeadlines.pickup_lfd_rail ?? null,
        line: importDeadlines.pickup_lfd_line ?? null,
      },
      pickup_appointment_at: container.pickup_appointment_at ?? null,
      // Preserve nulls so clients don't mistake "unavailable" for "empty".
      fees_at_pod_terminal: demurrage.fees,
      fees_total_amount: demurrage.total_amount,
      fees_currency_code: demurrage.currency_code,
      holds_at_pod_terminal: container.holds_at_pod_terminal ?? null,
      urgency: demurrage.urgency,
      urgency_suppressed: demurrage.urgency_suppressed,
      urgency_reason: demurrage.suppression_reason,
      days_until_lfd: demurrage.days_until_lfd,
    },
    rail: {
      pod_rail_carrier: container.pod_rail_carrier_scac ?? null,
      pod_rail_loaded_at: container.pod_rail_loaded_at ?? null,
      destination_eta: container.ind_eta_at ?? null,
      destination_ata: container.ind_ata_at ?? null,
    },
    shipment: shipment
      ? {
          id: shipment.id,
          ref_numbers: shipment.attributes?.ref_numbers || [],
          line: shipment.attributes?.shipping_line_scac,
          shipping_line_name: shipment.attributes?.shipping_line_name,
          port_of_lading_name: shipment.attributes?.port_of_lading_name,
          port_of_discharge_name: shipment.attributes?.port_of_discharge_name,
          destination_name: shipment.attributes?.destination_name,
        }
      : null,
    pod_terminal: podTerminal
      ? {
          id: podTerminal.id,
          name: podTerminal.attributes?.name,
          firms_code: podTerminal.attributes?.firms_code,
        }
      : null,
    events: eventsData,
    created_at: container.created_at,
    _metadata: metadata,
  };
}

/** equipment_length is the numeric enum 10|20|40|45; everything else is null. */
function normalizeEquipmentLength(value: unknown): number | null {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * Whether line tracking has stopped/closed for the container's shipment, which
 * makes terminal availability/LFD signals untrustworthy for urgency.
 *
 * `line_tracking_stopped_at` / `line_tracking_stopped_reason` live on the
 * SHIPMENT schema (per the generated OpenAPI types), not on the container, so
 * we read them from the sideloaded shipment resource (JSON:API `included[]`).
 * When the shipment wasn't included in this call, `shipment` is undefined and
 * we treat tracking as not-stopped rather than crashing.
 */
function isTrackingStopped(shipment: any): boolean {
  const attrs = shipment?.attributes;
  if (!attrs) return false;
  return Boolean(
    attrs.line_tracking_stopped_at || attrs.line_tracking_stopped_reason,
  );
}

function formatEventsData(events: any[]): any {
  if (!events || events.length === 0) {
    return { count: 0 };
  }

  const railEvents = events.filter(
    (e: any) =>
      e.attributes?.event?.startsWith('rail.') ||
      e.attributes?.event?.includes('rail'),
  );

  const sortedEvents = [...events].sort(
    (a: any, b: any) =>
      new Date(b.attributes?.timestamp || 0).getTime() -
      new Date(a.attributes?.timestamp || 0).getTime(),
  );

  const latestEvent = sortedEvents[0]?.attributes;

  return {
    count: events.length,
    rail_events_count: railEvents.length,
    latest_event: latestEvent
      ? {
          event: latestEvent.event,
          timestamp: latestEvent.timestamp,
          location: latestEvent.location_name || latestEvent.port_name,
        }
      : undefined,
  };
}

function generateMetadata(
  statusResult: ContainerStatusResult,
  includes: string[],
): ContainerStatus['_metadata'] {
  const lifecycle = statusResult.derived_lifecycle;

  return {
    container_state: lifecycle,
    status_is_authoritative: statusResult.status_source === 'current_status',
    derived_lifecycle: lifecycle,
    includes_loaded: includes,
  };
}
