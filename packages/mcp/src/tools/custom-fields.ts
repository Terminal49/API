/**
 * Shared custom field loading for get_container and get_shipment_details.
 *
 * Custom fields are account-defined (PO number, project manager, ...). The
 * API serves them from a sub-resource that only accepts a signed-in user, so
 * an API-key credential gets a 401/403; that is reported as a note instead of
 * failing the whole tool call.
 */

import {
  AuthenticationError,
  AuthorizationError,
  FeatureNotEnabledError,
} from '@terminal49/sdk';
import { z } from 'zod';

export const customFieldValueSchema = z.object({
  name: z.string().nullable(),
  slug: z.string(),
  value: z.unknown(),
  display_value: z.string().nullable(),
  data_type: z.string().nullable(),
});

export type CustomFieldValue = z.infer<typeof customFieldValueSchema>;

export interface CustomFieldsResult {
  custom_fields: CustomFieldValue[] | null;
  custom_fields_note?: string;
}

export const CUSTOM_FIELDS_AUTH_NOTE =
  'The custom fields request was not authorized. Check the connector sign-in and account permissions. Custom fields require a signed-in Terminal49 user (OAuth).';

export const CUSTOM_FIELDS_FEATURE_NOTE =
  'Custom fields are not enabled for this account.';

export function formatCustomFields(mapped: unknown): CustomFieldValue[] {
  if (!Array.isArray(mapped)) return [];
  return mapped
    .filter((field) => field && typeof field.slug === 'string')
    .map((field) => ({
      name: typeof field.name === 'string' ? field.name : null,
      slug: field.slug,
      value: field.value ?? null,
      display_value:
        typeof field.displayValue === 'string' ? field.displayValue : null,
      data_type: typeof field.dataType === 'string' ? field.dataType : null,
    }));
}

export async function loadCustomFields(
  load: () => Promise<unknown>,
): Promise<CustomFieldsResult> {
  try {
    return { custom_fields: formatCustomFields(await load()) };
  } catch (error) {
    if (error instanceof FeatureNotEnabledError) {
      return {
        custom_fields: null,
        custom_fields_note: CUSTOM_FIELDS_FEATURE_NOTE,
      };
    }
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError
    ) {
      return {
        custom_fields: null,
        custom_fields_note: CUSTOM_FIELDS_AUTH_NOTE,
      };
    }
    throw error;
  }
}
