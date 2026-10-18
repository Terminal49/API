/**
 * get_container tool
 * Retrieves detailed container information by Terminal49 ID.
 *
 * The Zod input schema lives in server.ts (single source of truth); this file
 * only owns the execution + curation logic.
 */

import { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
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
import {
  type CustomFieldsResult,
  type CustomFieldValue,
  customFieldValueSchema,
  loadCustomFields,
} from './custom-fields.js';

export type ContainerInclude =
  | 'shipment'
  | 'pod_terminal'
  | 'transport_events'
  | 'custom_fields';

type ApiContainerInclude = Exclude<ContainerInclude, 'custom_fields'>;

/** The default sideloads. `include` augments — never replaces — these. */
const DEFAULT_INCLUDES: ContainerInclude[] = ['shipment', 'pod_terminal'];

export interface GetContainerArgs {
  id: string;
  include?: ContainerInclude[];
}

// Values copied straight from API attributes are nullish: the API can omit
// them, and a missing optional field must not fail the whole tool call.
const apiString = z.string().nullish();

// Fee and hold items are passed through from the terminal as reported.
const terminalFeeSchema = z.looseObject({
  type: apiString,
  amount: z.union([z.number(), z.string()]).nullish(),
  currency_code: apiString,
});

/**
 * Output contract for get_container. Agents that script tool calls read field
 * names from this schema, so every key `formatContainerResponse` emits is listed.
 */
export const containerStatusSchema = z.object({
  id: z.string(),
  container_number: z.string(),
  status: z.string(),
  status_source: z.enum(['current_status', 'derived']),
  equipment: z.object({
    type: z.string().nullable(),
    length: z.number().nullable(),
    height: z.string().nullable(),
    weight_lbs: z.number().nullable(),
  }),
  location: z.object({
    current_location: z.string().nullable(),
    available_for_pickup: z.boolean().nullable(),
    availability_known: z.boolean().nullable(),
    pod_arrived_at: z.string().nullable(),
    pod_arrived_at_local: z.string(),
    pod_discharged_at: z.string().nullable(),
    pod_discharged_at_local: z.string(),
    pod_timezone: z.string().nullable(),
  }),
  demurrage: z.object({
    pickup_lfd: z.string().nullable(),
    pickup_lfd_local: z.string(),
    last_free_days: z.object({
      terminal: z.string().nullable(),
      rail: z.string().nullable(),
      line: z.string().nullable(),
    }),
    pickup_appointment_at: z.string().nullable(),
    fees_at_pod_terminal: z.array(terminalFeeSchema).nullable(),
    fees_total_amount: z.number().nullable(),
    fees_currency_code: z.string().nullable(),
    holds_at_pod_terminal: z.array(z.unknown()).nullable(),
    urgency: z.enum(['overdue', 'imminent', 'none', 'unknown']),
    urgency_suppressed: z.boolean(),
    urgency_reason: z.string().nullable(),
    days_until_lfd: z.number().nullable(),
  }),
  rail: z.object({
    pod_rail_carrier: z.string().nullable(),
    pod_rail_loaded_at: z.string().nullable(),
    destination_eta: z.string().nullable(),
    destination_ata: z.string().nullable(),
  }),
  shipment: z
    .object({
      id: z.string(),
      // The API allows null entries in ref_numbers.
      ref_numbers: z.array(z.string().nullable()),
      line: apiString,
      shipping_line_name: apiString,
      port_of_lading_name: apiString,
      port_of_discharge_name: apiString,
      destination_name: apiString,
      line_tracking_stopped_at: z.string().nullable(),
    })
    .nullable(),
  pod_terminal: z
    .object({
      id: z.string(),
      name: apiString,
      firms_code: apiString,
    })
    .nullable(),
  custom_fields: z.array(customFieldValueSchema).nullable(),
  custom_fields_note: z.string().optional(),
  events: z
    .object({
      count: z.number(),
      latest_event: z
        .object({
          event: apiString,
          timestamp: apiString,
          value: z.unknown(),
          data_source: z.string().nullable(),
          invalidated_at: z.string().nullable(),
          location: apiString,
        })
        .optional(),
      rail_events_count: z.number().optional(),
    })
    .optional(),
  created_at: apiString,
  _metadata: z.object({
    container_state: z.string(),
    status_is_authoritative: z.boolean(),
    derived_lifecycle: z.string(),
    includes_loaded: z.array(z.string()),
  }),
});

export type ContainerStatus = z.input<typeof containerStatusSchema>;

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
    const apiIncludes = includes.filter(
      (inc): inc is ApiContainerInclude => inc !== 'custom_fields',
    );
    const [result, customFields] = await Promise.all([
      client.containers.get(args.id, apiIncludes, { format: 'raw' }),
      includes.includes('custom_fields')
        ? loadCustomFields(() =>
            client.containers.customFields(args.id, { format: 'mapped' }),
          )
        : Promise.resolve(null),
    ]);
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

    return formatContainerResponse(raw, includes, customFields);
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
  customFields: CustomFieldsResult | null,
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

  const metadata = generateMetadata(
    statusResult,
    includes.filter(
      (include) =>
        include !== 'custom_fields' ||
        Array.isArray(customFields?.custom_fields),
    ),
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
          line_tracking_stopped_at:
            shipment.attributes?.line_tracking_stopped_at ?? null,
        }
      : null,
    pod_terminal: podTerminal
      ? {
          id: podTerminal.id,
          name: podTerminal.attributes?.name,
          firms_code: podTerminal.attributes?.firms_code,
        }
      : null,
    custom_fields: customFields?.custom_fields ?? null,
    ...(customFields?.custom_fields_note
      ? { custom_fields_note: customFields.custom_fields_note }
      : {}),
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

function formatEventsData(
  events: any[],
): NonNullable<ContainerStatus['events']> {
  // Summaries describe active events; the timeline retains withdrawn history.
  events = events.filter((event: any) => !event.attributes?.invalidated_at);
  if (events.length === 0) {
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
          value: latestEvent.value ?? null,
          data_source: latestEvent.data_source ?? null,
          invalidated_at: latestEvent.invalidated_at ?? null,
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
