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
  events?:
    | {
        count: number;
        latest_event?: {
          event: string;
          timestamp: string;
          location?: string;
        };
        rail_events_count?: number;
      }
    | string;
  created_at: string;
  _metadata: {
    container_state: string;
    status_is_authoritative: boolean;
    derived_lifecycle: string;
    includes_loaded: string[];
    can_answer: string[];
    needs_more_data_for: string[];
    relevant_for_current_state: string[];
    presentation_guidance: string;
    suggestions?: {
      message?: string;
      recommended_follow_up?: string | null;
    };
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
  console.error(
    JSON.stringify({
      event: 'tool.execute.start',
      tool: 'get_container',
      container_id: args.id,
      timestamp: new Date().toISOString(),
    }),
  );

  try {
    const includes = resolveIncludes(args.include);
    const result = await client.containers.get(args.id, includes, {
      format: 'raw',
    });
    const raw = (result as any)?.raw ?? result;

    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        event: 'tool.execute.complete',
        tool: 'get_container',
        container_id: args.id,
        includes,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      }),
    );

    return formatContainerResponse(raw, includes);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      JSON.stringify({
        event: 'tool.execute.error',
        tool: 'get_container',
        container_id: args.id,
        error: (error as Error).name,
        message: (error as Error).message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      }),
    );
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
    : `Call get_container with include=['transport_events'] to fetch ${transportEvents.length || '~50-100'} event records`;

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

  const metadata = generateMetadata(
    container,
    statusResult,
    demurrage,
    podTimezone,
    includes,
  );

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

/**
 * Generate metadata hints to steer LLM decision-making. The derived lifecycle
 * is exposed here as non-authoritative steering metadata only — the headline
 * `status` above is the source of truth.
 */
function generateMetadata(
  container: any,
  statusResult: ContainerStatusResult,
  demurrage: DemurrageEvaluation,
  podTimezone: string | null,
  includes: string[],
): ContainerStatus['_metadata'] {
  const lifecycle = statusResult.derived_lifecycle;
  const canAnswer: string[] = [
    'container status',
    'equipment details',
    'basic timeline',
  ];
  const needsMoreDataFor: string[] = [];

  if (includes.includes('shipment')) {
    canAnswer.push(
      'routing information',
      'shipping line details',
      'reference numbers',
    );
  }

  if (includes.includes('pod_terminal')) {
    canAnswer.push(
      'availability status',
      'demurrage/LFD',
      'holds and fees',
      'terminal location',
    );
  }

  if (includes.includes('transport_events')) {
    canAnswer.push(
      'full journey timeline',
      'milestone analysis',
      'rail tracking details',
      'event history',
    );
  } else {
    needsMoreDataFor.push(
      "journey timeline → include: ['transport_events']",
      "milestone analysis → include: ['transport_events']",
      "rail movement details → include: ['transport_events']",
    );
  }

  const suggestions = generateSuggestions(
    container,
    lifecycle,
    demurrage,
    includes,
  );
  const relevantFields = getRelevantFieldsForState(lifecycle, container);
  const presentationGuidance = getPresentationGuidance(
    lifecycle,
    container,
    demurrage,
  );

  return {
    container_state: lifecycle,
    status_is_authoritative: statusResult.status_source === 'current_status',
    derived_lifecycle: lifecycle,
    includes_loaded: includes,
    can_answer: canAnswer,
    needs_more_data_for: needsMoreDataFor,
    relevant_for_current_state: relevantFields,
    presentation_guidance: presentationGuidance,
    suggestions,
  };
}

function generateSuggestions(
  container: any,
  state: string,
  demurrage: DemurrageEvaluation,
  includes: string[],
): { message?: string; recommended_follow_up?: string | null } {
  let message: string | undefined;
  let recommendedFollowUp: string | null = null;

  switch (state) {
    case 'in_transit':
      message =
        'Container is still in transit. User may ask about vessel ETA or shipping route.';
      break;

    case 'arrived':
      message =
        'Container has arrived but not yet discharged. User may ask about discharge timing.';
      break;

    case 'at_terminal':
    case 'available_for_pickup':
      if (
        Array.isArray(container.holds_at_pod_terminal) &&
        container.holds_at_pod_terminal.length > 0
      ) {
        const holdTypes = container.holds_at_pod_terminal
          .map((h: any) => h.name)
          .join(', ');
        message = `Container has holds: ${holdTypes}. User may ask about hold details or clearance timeline.`;
      } else if (
        container.holds_at_pod_terminal == null &&
        includes.includes('pod_terminal')
      ) {
        message =
          'Hold/fee/LFD data is not available for this container/terminal via the API response. ' +
          'User may need to check terminal portal or customs/broker docs.';
      } else if (demurrage.urgency_suppressed) {
        message = `LFD urgency is unavailable: ${demurrage.suppression_reason}. Do not assert demurrage urgency from this data alone.`;
      } else if (demurrage.days_until_lfd !== null) {
        const days = demurrage.days_until_lfd;
        if (demurrage.urgency === 'overdue') {
          message = `Container is ${Math.abs(days)} days past LFD. User may ask about demurrage charges.`;
        } else if (demurrage.urgency === 'imminent') {
          message = `LFD is in ${days} days. Urgent pickup needed to avoid demurrage.`;
        } else {
          message = `Container available for pickup. LFD is in ${days} days.`;
        }
      }
      break;

    case 'on_rail':
      message =
        'Container is on rail transport. User may ask about rail carrier, destination ETA, or inland movement.';
      if (!includes.includes('transport_events')) {
        recommendedFollowUp = 'transport_events';
      }
      break;

    case 'delivered':
      message =
        'Container has been delivered. User may ask about delivery details or empty return.';
      if (!includes.includes('transport_events')) {
        recommendedFollowUp = 'transport_events';
      }
      break;
  }

  return { message, recommended_follow_up: recommendedFollowUp };
}

function getRelevantFieldsForState(state: string, container: any): string[] {
  switch (state) {
    case 'in_transit':
      return [
        'shipment.pod_eta_at - When arriving at destination',
        'shipment.pod_vessel_name - Current vessel',
        'shipment.port_of_discharge_name - Destination port',
        'shipment.pol_atd_at - When departed origin',
      ];

    case 'arrived':
      return [
        'location.pod_arrived_at - When vessel docked',
        'location.pod_discharged_at - Discharge status (null = still on vessel)',
        'pod_terminal.name - Which terminal',
      ];

    case 'at_terminal':
    case 'available_for_pickup': {
      const fields = [
        'location.available_for_pickup - Ready to pick up?',
        'demurrage.last_free_days - Per-channel LFDs (terminal/rail/line)',
        'demurrage.holds_at_pod_terminal - Blocks pickup if present',
        'location.current_location - Where in terminal yard',
      ];
      if (container.fees_at_pod_terminal?.length > 0) {
        fields.push(
          'demurrage.fees_at_pod_terminal - Storage/handling charges',
        );
      }
      if (container.pickup_appointment_at) {
        fields.push('demurrage.pickup_appointment_at - Scheduled pickup time');
      }
      return fields;
    }

    case 'on_rail':
      return [
        'rail.pod_rail_carrier - Rail carrier SCAC code',
        'rail.destination_eta - When arriving inland destination',
        'rail.pod_rail_departed_at - When left port',
        'shipment.destination_name - Inland city',
        'events - Rail milestones (if transport_events included)',
      ];

    case 'delivered':
      return [
        'location.pod_full_out_at - When picked up from terminal',
        'Complete journey timeline - Helpful for delivered containers',
        'empty_terminated_at - Empty return status (if applicable)',
      ];

    default:
      return ['status', 'location', 'equipment'];
  }
}

function getPresentationGuidance(
  state: string,
  container: any,
  demurrage: DemurrageEvaluation,
): string {
  switch (state) {
    case 'in_transit':
      return 'Focus on ETA and vessel information. User wants to know WHEN it will arrive and WHERE it is now.';

    case 'arrived':
      return 'Explain vessel arrived but container not yet discharged. User wants to know WHEN discharge will happen.';

    case 'at_terminal':
    case 'available_for_pickup': {
      if (container.holds_at_pod_terminal?.length > 0) {
        const holdTypes = container.holds_at_pod_terminal
          .map((h: any) => h.name)
          .join(', ');
        return `URGENT: Lead with holds (${holdTypes}) - they BLOCK pickup. Explain what each hold means and how to clear. Then mention LFD and location.`;
      }

      if (demurrage.urgency_suppressed) {
        return `Availability/LFD data is not reliable here (${demurrage.suppression_reason}). State availability cautiously and do NOT assert demurrage urgency. Suggest verifying with the terminal directly.`;
      }

      if (
        demurrage.urgency === 'overdue' &&
        demurrage.days_until_lfd !== null
      ) {
        const fees = describeFees(demurrage);
        return `Container is ${Math.abs(demurrage.days_until_lfd)} days past LFD.${fees} Emphasize that pickup is overdue; report only the fees the API returned (do not estimate a daily rate).`;
      }

      if (
        demurrage.urgency === 'imminent' &&
        demurrage.days_until_lfd !== null
      ) {
        return `Only ${demurrage.days_until_lfd} days until LFD. Pickup needed soon to avoid demurrage charges.`;
      }

      if (demurrage.days_until_lfd !== null) {
        return `Lead with availability status. Mention LFD date and days remaining (${demurrage.days_until_lfd}). Include location if user picking up.`;
      }

      return 'State availability clearly. Mention location in terminal. Note any fees the API returned.';
    }

    case 'on_rail':
      return 'Explain rail journey: Departed [port] on [date] via [carrier], heading to [city]. ETA: [date]. Emphasize destination and timing.';

    case 'delivered':
      return 'Confirm delivery completed with date/time. Optionally summarize full journey from origin to delivery.';

    default:
      return 'Present information clearly based on container lifecycle stage. Prioritize actionable details.';
  }
}

function describeFees(demurrage: DemurrageEvaluation): string {
  if (demurrage.total_amount == null) return '';
  const currency = demurrage.currency_code ? ` ${demurrage.currency_code}` : '';
  return ` Reported fees total ${demurrage.total_amount}${currency}.`;
}
