/**
 * get_shipment_details tool
 * Retrieves detailed shipment information by Terminal49 shipment ID.
 *
 * The Zod input schema lives in server.ts (single source of truth); this file
 * only owns the execution + curation logic.
 */

import { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import { logMcpEvent } from '../logging.js';
import {
  type CustomFieldsResult,
  customFieldValueSchema,
  loadCustomFields,
} from './custom-fields.js';
import {
  loadPartyRoles,
  partyRoleSchema,
  type PartyRolesResult,
} from './party-roles.js';

export interface GetShipmentArgs {
  id: string;
  include_containers?: boolean;
  include_custom_fields?: boolean;
  include_party_roles?: boolean;
}

// Values copied straight from API attributes are nullish: the API can omit
// them, and a missing optional field must not fail the whole tool call.
const apiString = z.string().nullish();

const portDetailsSchema = z
  .object({ id: z.string(), code: apiString, country_code: apiString })
  .nullable();

const terminalSchema = z
  .object({
    id: z.string(),
    name: apiString,
    nickname: apiString,
    firms_code: apiString,
  })
  .nullable();

/**
 * Output contract for get_shipment_details. Agents that script tool calls read
 * field names from this schema, so every key `formatShipmentResponse` emits is
 * listed.
 */
export const shipmentDetailsSchema = z.object({
  id: z.string(),
  bill_of_lading: apiString,
  normalized_number: apiString,
  status: z.enum([
    'delivered_to_destination',
    'arrived_at_pod',
    'in_transit',
    'awaiting_departure',
    'pending',
  ]),
  shipping_line: z.object({
    scac: apiString,
    name: apiString,
    short_name: apiString,
  }),
  customer_name: apiString,
  // The API allows null entries in ref_numbers.
  reference_numbers: z.array(z.string().nullable()),
  tags: z.array(z.string()),
  routing: z.object({
    port_of_lading: z.object({
      locode: apiString,
      name: apiString,
      port_details: portDetailsSchema,
      etd: apiString,
      atd: apiString,
      timezone: apiString,
    }),
    port_of_discharge: z.object({
      locode: apiString,
      name: apiString,
      port_details: portDetailsSchema,
      terminal: terminalSchema,
      eta: apiString,
      ata: apiString,
      original_eta: apiString,
      timezone: apiString,
    }),
    destination: z
      .object({
        locode: z.string(),
        name: apiString,
        terminal: terminalSchema,
        eta: apiString,
        ata: apiString,
        timezone: apiString,
      })
      .nullable(),
  }),
  vessel_at_pod: z.object({
    name: apiString,
    imo: apiString,
    voyage_number: apiString,
  }),
  containers: z
    .object({
      count: z.number(),
      containers: z.array(
        z.object({
          id: z.string(),
          number: apiString,
          equipment_type: apiString,
          equipment_length: z.number().nullish(),
          available_for_pickup: z.boolean().nullish(),
          pod_arrived_at: apiString,
          pod_discharged_at: apiString,
          pickup_lfd: apiString,
        }),
      ),
    })
    .optional(),
  custom_fields: z.array(customFieldValueSchema).nullable(),
  custom_fields_note: z.string().optional(),
  // Present only when include_party_roles is true.
  party_roles: z.array(partyRoleSchema).nullable().optional(),
  party_roles_note: z.string().optional(),
  tracking: z.object({
    line_tracking_last_attempted_at: apiString,
    line_tracking_last_succeeded_at: apiString,
    line_tracking_stopped_at: apiString,
    line_tracking_stopped_reason: apiString,
  }),
  updated_at: apiString,
  created_at: apiString,
  _metadata: z.object({
    shipment_status: z.string(),
    includes_loaded: z.array(z.string()),
  }),
});

type ShipmentDetails = z.input<typeof shipmentDetailsSchema>;

export async function executeGetShipmentDetails(
  args: GetShipmentArgs,
  client: Terminal49Client,
): Promise<ShipmentDetails> {
  if (!args.id || args.id.trim() === '') {
    throw new Error('Shipment ID is required');
  }

  const startTime = Date.now();
  logMcpEvent({
    event: 'tool.execute.start',
    tool: 'get_shipment_details',
    shipment_id: args.id,
    timestamp: new Date().toISOString(),
  });

  try {
    const includeContainers = args.include_containers !== false;
    const includeCustomFields = args.include_custom_fields === true;
    const [result, customFields, partyRoles] = await Promise.all([
      client.shipments.get(args.id, includeContainers, { format: 'raw' }),
      includeCustomFields
        ? loadCustomFields(() =>
            client.shipments.customFields(args.id, { format: 'mapped' }),
          )
        : Promise.resolve(null),
      args.include_party_roles === true
        ? loadPartyRoles(() =>
            client.shipments.partyRoles(args.id, { format: 'raw' }),
          )
        : Promise.resolve(null),
    ]);
    const raw = (result as any)?.raw ?? result;
    const duration = Date.now() - startTime;

    logMcpEvent({
      event: 'tool.execute.complete',
      tool: 'get_shipment_details',
      shipment_id: args.id,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    return formatShipmentResponse(
      raw,
      includeContainers,
      customFields,
      partyRoles,
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    logMcpEvent({
      event: 'tool.execute.error',
      tool: 'get_shipment_details',
      shipment_id: args.id,
      error: (error as Error).name,
      message: (error as Error).message,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    });

    throw error;
  }
}

function formatShipmentResponse(
  apiResponse: any,
  includeContainers: boolean,
  customFields: CustomFieldsResult | null,
  partyRoles: PartyRolesResult | null,
): ShipmentDetails {
  const shipment = apiResponse.data?.attributes || {};
  const relationships = apiResponse.data?.relationships || {};
  const included = apiResponse.included || [];

  // Determine shipment status
  const status = determineShipmentStatus(shipment);

  // Extract containers if included
  const containerData = includeContainers
    ? extractContainers(relationships, included)
    : undefined;

  // Extract port/terminal info
  const portOfLading = included.find(
    (item: any) =>
      item.id === relationships.port_of_lading?.data?.id &&
      item.type === 'port',
  );

  const portOfDischarge = included.find(
    (item: any) =>
      item.id === relationships.port_of_discharge?.data?.id &&
      item.type === 'port',
  );

  const podTerminal = included.find(
    (item: any) =>
      item.id === relationships.pod_terminal?.data?.id &&
      item.type === 'terminal',
  );

  const destinationTerminal = included.find(
    (item: any) =>
      item.id === relationships.destination_terminal?.data?.id &&
      item.type === 'terminal',
  );

  // Note: shipping_line is available directly from shipment attributes
  // We don't sideload it via includes due to API limitations
  return {
    id: apiResponse.data?.id,
    bill_of_lading: shipment.bill_of_lading_number,
    normalized_number: shipment.normalized_number,
    status: status,
    shipping_line: {
      scac: shipment.shipping_line_scac,
      name: shipment.shipping_line_name,
      short_name: shipment.shipping_line_short_name,
    },
    customer_name: shipment.customer_name,
    reference_numbers: shipment.ref_numbers || [],
    tags: shipment.tags || [],
    routing: {
      port_of_lading: {
        locode:
          shipment.port_of_lading_locode || portOfLading?.attributes?.locode,
        name: shipment.port_of_lading_name || portOfLading?.attributes?.name,
        port_details: portOfLading
          ? {
              id: portOfLading.id,
              code: portOfLading.attributes?.code,
              country_code: portOfLading.attributes?.country_code,
            }
          : null,
        etd: shipment.pol_etd_at,
        atd: shipment.pol_atd_at,
        timezone: shipment.pol_timezone,
      },
      port_of_discharge: {
        locode:
          shipment.port_of_discharge_locode ||
          portOfDischarge?.attributes?.locode,
        name:
          shipment.port_of_discharge_name || portOfDischarge?.attributes?.name,
        port_details: portOfDischarge
          ? {
              id: portOfDischarge.id,
              code: portOfDischarge.attributes?.code,
              country_code: portOfDischarge.attributes?.country_code,
            }
          : null,
        terminal: podTerminal
          ? {
              id: podTerminal.id,
              name: podTerminal.attributes?.name,
              nickname: podTerminal.attributes?.nickname,
              firms_code: podTerminal.attributes?.firms_code,
            }
          : null,
        eta: shipment.pod_eta_at,
        ata: shipment.pod_ata_at,
        original_eta: shipment.pod_original_eta_at,
        timezone: shipment.pod_timezone,
      },
      destination: shipment.destination_locode
        ? {
            locode: shipment.destination_locode,
            name: shipment.destination_name,
            terminal: destinationTerminal
              ? {
                  id: destinationTerminal.id,
                  name: destinationTerminal.attributes?.name,
                  nickname: destinationTerminal.attributes?.nickname,
                  firms_code: destinationTerminal.attributes?.firms_code,
                }
              : null,
            eta: shipment.destination_eta_at,
            ata: shipment.destination_ata_at,
            timezone: shipment.destination_timezone,
          }
        : null,
    },
    vessel_at_pod: {
      name: shipment.pod_vessel_name,
      imo: shipment.pod_vessel_imo,
      voyage_number: shipment.pod_voyage_number,
    },
    containers: containerData,
    custom_fields: customFields?.custom_fields ?? null,
    ...(customFields?.custom_fields_note
      ? { custom_fields_note: customFields.custom_fields_note }
      : {}),
    ...(partyRoles ? { party_roles: partyRoles.party_roles } : {}),
    ...(partyRoles?.party_roles_note
      ? { party_roles_note: partyRoles.party_roles_note }
      : {}),
    tracking: {
      line_tracking_last_attempted_at: shipment.line_tracking_last_attempted_at,
      line_tracking_last_succeeded_at: shipment.line_tracking_last_succeeded_at,
      line_tracking_stopped_at: shipment.line_tracking_stopped_at,
      line_tracking_stopped_reason: shipment.line_tracking_stopped_reason,
    },
    updated_at: shipment.updated_at,
    created_at: shipment.created_at,
    _metadata: {
      shipment_status: status,
      includes_loaded: [
        ...(includeContainers ? ['containers'] : []),
        'ports',
        'terminals',
        ...(Array.isArray(customFields?.custom_fields)
          ? ['custom_fields']
          : []),
        ...(Array.isArray(partyRoles?.party_roles) ? ['party_roles'] : []),
      ],
    },
  };
}

function extractContainers(
  relationships: any,
  included: any[],
): ShipmentDetails['containers'] {
  const containerRefs = relationships.containers?.data || [];

  if (containerRefs.length === 0) {
    return { count: 0, containers: [] };
  }

  const containers = containerRefs
    .map((ref: any) => {
      const container = included.find(
        (item: any) => item.id === ref.id && item.type === 'container',
      );
      if (!container) return null;

      const attrs = container.attributes || {};
      return {
        id: container.id,
        number: attrs.number,
        equipment_type: attrs.equipment_type,
        equipment_length: attrs.equipment_length,
        available_for_pickup: attrs.available_for_pickup,
        pod_arrived_at: attrs.pod_arrived_at,
        pod_discharged_at: attrs.pod_discharged_at,
        pickup_lfd: attrs.pickup_lfd,
      };
    })
    .filter((c: any) => c !== null);

  return {
    count: containers.length,
    containers: containers,
  };
}

function determineShipmentStatus(shipment: any): ShipmentDetails['status'] {
  if (shipment.destination_ata_at) return 'delivered_to_destination';
  if (shipment.pod_ata_at) return 'arrived_at_pod';
  if (shipment.pol_atd_at) return 'in_transit';
  if (shipment.pol_etd_at) return 'awaiting_departure';
  return 'pending';
}
