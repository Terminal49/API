/**
 * Container resource resolver
 * Provides compact container summaries via t49:container/{id} URIs
 */

import { Terminal49Client } from '@terminal49/sdk';
import { resolveContainerStatus } from '../lib/container-status.js';
import { evaluateDemurrageUrgency } from '../lib/demurrage.js';
import { formatInZone } from '../lib/temporal.js';

const URI_PATTERN = /^(?:t49:|terminal49:\/\/)container\/([a-f0-9-]{36})$/i;

export const containerResource = {
  uri: 't49:container/{id}',
  name: 'Terminal49 Container',
  description:
    'Access container information by Terminal49 container ID. ' +
    'Returns a compact summary including status, milestones, holds, and LFD.',
  mimeType: 'text/markdown',
};

export function matchesContainerUri(uri: string): boolean {
  return URI_PATTERN.test(uri);
}

export async function readContainerResource(
  uri: string,
  client: Terminal49Client,
): Promise<{ uri: string; mimeType: string; text: string }> {
  const normalized = normalizeUri(uri);
  const match = normalized.match(URI_PATTERN);
  if (!match) {
    throw new Error('Invalid container URI format');
  }

  const containerId = match[1];
  const result = await client.getContainer(
    containerId,
    ['shipment', 'pod_terminal'],
    { format: 'raw' },
  );
  const rawResult = (result as any)?.raw ?? result;
  const container = rawResult?.data?.attributes || {};

  // line_tracking_stopped_* lives on the SHIPMENT (per the generated OpenAPI
  // types), not the container — resolve the sideloaded shipment from the
  // JSON:API included[] so we can read it. Absent shipment → not-stopped.
  const shipment = resolveSideloadedShipment(rawResult);

  const summary = generateSummary(containerId, container, shipment);

  return {
    uri: normalized,
    mimeType: 'text/markdown',
    text: summary,
  };
}

function normalizeUri(uri: string): string {
  if (uri.startsWith('terminal49://')) {
    return uri;
  }

  if (uri.startsWith('t49:')) {
    return uri.replace(/^t49:/, 'terminal49://');
  }

  return uri;
}

/**
 * Resolve the sideloaded shipment for this container from the JSON:API
 * `included[]` (relationships.shipment.data.id -> matching included resource).
 * Returns undefined when the shipment wasn't included in the response.
 */
function resolveSideloadedShipment(rawResult: any): any {
  const shipmentId = rawResult?.data?.relationships?.shipment?.data?.id;
  if (!shipmentId) return undefined;
  const included = rawResult?.included || [];
  return included.find(
    (item: any) => item.id === shipmentId && item.type === 'shipment',
  );
}

function generateSummary(id: string, container: any, shipment?: any): string {
  // Headline status comes from the API current_status (shared resolver), ending
  // the divergence between this resource and the get_container tool.
  const { status } = resolveContainerStatus(container);
  const podTimezone: string | null = container.pod_timezone ?? null;
  const railSection = container.pod_rail_carrier_scac
    ? generateRailSection(container, podTimezone)
    : '';
  const label = container.number || container.container_number || 'Unknown';
  const equipment = formatEquipment(container);

  // line_tracking_stopped_* lives on the SHIPMENT, not the container, so read it
  // from the sideloaded shipment's attributes (absent shipment → not-stopped).
  const shipmentAttrs = shipment?.attributes;
  const demurrage = evaluateDemurrageUrgency({
    fees_at_pod_terminal: container.fees_at_pod_terminal,
    pickup_lfd: container.pickup_lfd ?? null,
    terminal_checked_at: container.terminal_checked_at ?? null,
    tracking_stopped: Boolean(
      shipmentAttrs?.line_tracking_stopped_at ||
      shipmentAttrs?.line_tracking_stopped_reason,
    ),
  });

  const importDeadlines = container.import_deadlines || {};

  return `# Container ${label}

**ID:** \`${id}\`
**Status:** ${status}
**Equipment:** ${equipment}
${podTimezone ? `**Terminal Timezone:** ${podTimezone}` : ''}

## Location & Availability

- **Available for Pickup:** ${formatAvailability(container)}
- **Current Location:** ${container.location_at_pod_terminal || 'Unknown'}
- **POD Arrived:** ${formatInZone(container.pod_arrived_at, podTimezone)}
- **POD Discharged:** ${formatInZone(container.pod_discharged_at, podTimezone)}

## Demurrage & Fees

- **Last Free Day (LFD):** ${formatInZone(container.pickup_lfd, podTimezone)}
- **LFD (Terminal):** ${formatInZone(importDeadlines.pickup_lfd_terminal, podTimezone)}
- **LFD (Rail):** ${formatInZone(importDeadlines.pickup_lfd_rail, container.final_destination_timezone ?? podTimezone)}
- **LFD (Line):** ${formatInZone(importDeadlines.pickup_lfd_line, podTimezone)}
- **Pickup Appointment:** ${formatInZone(container.pickup_appointment_at, podTimezone)}
- **Fees:** ${formatFees(demurrage)}
- **Holds:** ${formatHolds(container)}
${demurrage.urgency_suppressed ? `- **LFD Urgency:** Unavailable (${demurrage.suppression_reason})` : ''}

${railSection}`;
}

function formatAvailability(container: any): string {
  if (container.available_for_pickup === true) return 'Yes';
  if (container.available_for_pickup === false) return 'No';
  return 'Unknown';
}

function formatFees(
  demurrage: ReturnType<typeof evaluateDemurrageUrgency>,
): string {
  if (demurrage.fees == null) return 'Not reported';
  if (demurrage.fees.length === 0) return 'None';
  if (demurrage.total_amount != null) {
    const currency = demurrage.currency_code
      ? ` ${demurrage.currency_code}`
      : '';
    return `${demurrage.fees.length} (total ${demurrage.total_amount}${currency})`;
  }
  return `${demurrage.fees.length}`;
}

function formatHolds(container: any): string {
  const holds = container.holds_at_pod_terminal;
  if (holds == null) return 'Not reported';
  if (!Array.isArray(holds) || holds.length === 0) return 'None';
  return `${holds.length}`;
}

function formatEquipment(container: any): string {
  // equipment_length is the numeric enum 10|20|40|45; guard the 0/empty sentinel.
  const rawLength = container.equipment_length;
  const equipmentLength =
    typeof rawLength === 'number' && rawLength > 0
      ? rawLength
      : typeof rawLength === 'string' &&
          rawLength.trim() !== '' &&
          Number(rawLength) > 0
        ? Number(rawLength)
        : null;
  const equipmentType = container.equipment_type || null;

  if (equipmentLength && equipmentType) {
    return `${equipmentLength}' ${equipmentType}`;
  }

  if (equipmentLength) {
    return `${equipmentLength}'`;
  }

  if (equipmentType) {
    return equipmentType;
  }

  return 'Unknown';
}

function generateRailSection(
  container: any,
  podTimezone: string | null,
): string {
  const railTimezone = container.final_destination_timezone ?? podTimezone;
  return `## Rail Information

- **Rail Carrier:** ${container.pod_rail_carrier_scac}
- **Rail Loaded:** ${formatInZone(container.pod_rail_loaded_at, podTimezone)}
- **Destination ETA:** ${formatInZone(container.ind_eta_at, railTimezone)}
- **Destination ATA:** ${formatInZone(container.ind_ata_at, railTimezone)}
`;
}
