/**
 * Container resource resolver
 * Provides compact container summaries via t49:container/{id} URIs
 */

import { Terminal49Client } from '../client.js';

const URI_PATTERN = /^t49:container\/([a-f0-9-]{36})$/i;

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
  client: Terminal49Client
): Promise<{ uri: string; mimeType: string; text: string }> {
  const match = uri.match(URI_PATTERN);
  if (!match) {
    throw new Error('Invalid container URI format');
  }

  const containerId = match[1];
  const result = await client.getContainer(containerId);
  const container = result.data?.attributes || {};

  const summary = generateSummary(containerId, container);

  return {
    uri,
    mimeType: 'text/markdown',
    text: summary,
  };
}

function generateSummary(id: string, container: any): string {
  const status = determineStatus(container);
  const railSection = container.pod_rail_carrier_scac ? generateRailSection(container) : '';

  return `# Container ${container.number}

**ID:** \`${id}\`
**Status:** ${status}
**Equipment:** ${container.equipment_length}' ${container.equipment_type}

## Location & Availability

- **Available for Pickup:** ${container.available_for_pickup ? 'Yes' : 'No'}
- **Current Location:** ${container.location_at_pod_terminal || 'Unknown'}
- **POD Arrived:** ${formatTimestamp(container.pod_arrived_at)}
- **POD Discharged:** ${formatTimestamp(container.pod_discharged_at)}

## Demurrage & Fees

- **Last Free Day (LFD):** ${formatDate(container.pickup_lfd)}
- **Pickup Appointment:** ${formatTimestamp(container.pickup_appointment_at)}
- **Fees:** ${container.fees_at_pod_terminal?.length || 'None'}
- **Holds:** ${container.holds_at_pod_terminal?.length || 'None'}

${railSection}

---
*Last Updated: ${formatTimestamp(container.updated_at)}*
`;
}

function generateRailSection(container: any): string {
  return `
## Rail Information

- **Rail Carrier:** ${container.pod_rail_carrier_scac}
- **Rail Loaded:** ${formatTimestamp(container.pod_rail_loaded_at)}
- **Destination ETA:** ${formatTimestamp(container.ind_eta_at)}
- **Destination ATA:** ${formatTimestamp(container.ind_ata_at)}
`;
}

function determineStatus(container: any): string {
  if (container.available_for_pickup) {
    return 'Available for Pickup';
  } else if (container.pod_discharged_at) {
    return 'Discharged at POD';
  } else if (container.pod_arrived_at) {
    return 'Arrived at POD';
  }
  return 'In Transit';
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return 'N/A';

  try {
    const date = new Date(ts);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return ts;
  }
}

function formatDate(date: string | null): string {
  if (!date) return 'N/A';

  try {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return date;
  }
}
