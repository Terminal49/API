/**
 * get_tracking_request tool
 * Reads one tracking request: its status, why it failed, and the shipment it
 * created. Agents call it right after track_container to see how the request
 * is doing.
 */

import type { Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import {
  nullableBoolean,
  nullableNumber,
  nullableString,
  relationshipRef,
  stringList,
} from './api-fields.js';
import { loadCustomFields } from './custom-fields.js';

export const getTrackingRequestInputSchema = z.object({
  id: z
    .string()
    .uuid()
    .describe(
      'The Terminal49 tracking request ID (UUID format), for example from list_tracking_requests. Identifier only; never pass conversation text.',
    ),
  include_custom_fields: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      'Include account-defined custom fields set on this request. Needs a signed-in user, not an API key. Default: false',
    ),
});

export type GetTrackingRequestArgs = z.input<
  typeof getTrackingRequestInputSchema
>;

const customFieldSchema = z.object({
  name: z.string().nullable(),
  slug: z.string(),
  value: z.unknown(),
  display_value: z.string().nullable(),
  data_type: z.string().nullable(),
});

export const getTrackingRequestOutputSchema = z.object({
  id: z.string(),
  request_number: z.string().nullable(),
  request_type: z.string().nullable(),
  status: z.string().nullable(),
  failed_reason: z.string().nullable(),
  scac: z.string().nullable(),
  ref_numbers: z.array(z.string()),
  tags: z.array(z.string()),
  is_retrying: z.boolean().nullable(),
  retry_count: z.number().nullable(),
  shipment_id: z.string().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  custom_fields: z.array(customFieldSchema).nullable().optional(),
  custom_fields_note: z.string().optional(),
});

export type GetTrackingRequestResult = z.infer<
  typeof getTrackingRequestOutputSchema
>;

const rawTrackingRequestSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      request_number: nullableString,
      request_type: nullableString,
      status: nullableString,
      failed_reason: nullableString,
      scac: nullableString,
      ref_numbers: stringList,
      tags: stringList,
      // The API sends shipment_tags. The OpenAPI spec names it tags.
      shipment_tags: z.array(z.string()).optional().catch(undefined),
      is_retrying: nullableBoolean,
      retry_count: nullableNumber,
      created_at: nullableString,
      updated_at: nullableString,
    }),
    relationships: z
      .object({ tracked_object: relationshipRef })
      .catch({ tracked_object: null }),
  }),
});

export async function executeGetTrackingRequest(
  args: GetTrackingRequestArgs,
  client: Terminal49Client,
): Promise<GetTrackingRequestResult> {
  const { id, include_custom_fields } =
    getTrackingRequestInputSchema.parse(args);
  const [raw, customFields] = await Promise.all([
    client.trackingRequests.get(id, { format: 'raw' }),
    include_custom_fields
      ? loadCustomFields(() =>
          client.trackingRequests.customFields(id, { format: 'mapped' }),
        )
      : Promise.resolve(null),
  ]);

  const { data } = rawTrackingRequestSchema.parse(raw);
  const tracked = data.relationships.tracked_object?.data;
  const { shipment_tags, ...attributes } = data.attributes;
  const result: GetTrackingRequestResult = {
    id: data.id,
    ...attributes,
    tags: shipment_tags ?? attributes.tags,
    shipment_id: tracked?.type === 'shipment' ? tracked.id : null,
  };
  if (customFields) {
    result.custom_fields = customFields.custom_fields;
    if (customFields.custom_fields_note) {
      result.custom_fields_note = customFields.custom_fields_note;
    }
  }
  return result;
}
