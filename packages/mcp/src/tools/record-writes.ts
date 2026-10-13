/**
 * set_party_role and set_custom_field tools
 *
 * The first record edits: attach a party to containers or shipments in a role
 * (for example the drayage carrier) and set or clear an account custom field.
 * Each call takes up to 50 records, reads the current value first so a repeat
 * call reports `unchanged` instead of failing, and keeps going past a record
 * that fails. Rails checks the user's permissions and records who made the
 * change and through which channel.
 */

import { z } from 'zod';
import { Terminal49Client } from '@terminal49/sdk';

const MAX_RECORDS = 50;
const CONCURRENCY = 5;

export const CONTAINER_PARTY_ROLES = ['pickup_dray_carrier'] as const;
export const SHIPMENT_PARTY_ROLES = [
  'shipper',
  'consignee',
  'notify_party',
  'customs_broker',
  'customer',
  'freight_forwarder',
  'pickup_dray_carrier',
] as const;

const recordIds = z.array(z.string().uuid()).min(1).max(MAX_RECORDS);

export const setPartyRoleInputSchema = z
  .strictObject({
    container_ids: recordIds
      .optional()
      .describe(
        'Terminal49 container IDs (UUIDs), 1 to 50. Pass container_ids or shipment_ids, not both.',
      ),
    shipment_ids: recordIds
      .optional()
      .describe(
        'Terminal49 shipment IDs (UUIDs), 1 to 50. Pass container_ids or shipment_ids, not both.',
      ),
    role: z
      .enum(SHIPMENT_PARTY_ROLES)
      .describe(
        'Role to set. Containers support only pickup_dray_carrier; shipments support every listed role.',
      ),
    party_id: z
      .string()
      .uuid()
      .describe('Party ID from list_parties. Never pass a company name.'),
    action: z
      .enum(['add', 'remove'])
      .describe('add attaches the party in the role; remove detaches it.'),
  })
  .refine((args) => !!args.container_ids !== !!args.shipment_ids, {
    message: 'Pass container_ids or shipment_ids, not both.',
  })
  .refine(
    (args) =>
      !args.container_ids ||
      (CONTAINER_PARTY_ROLES as readonly string[]).includes(args.role),
    { message: 'Containers support only the pickup_dray_carrier role.' },
  );
export type SetPartyRoleArgs = z.input<typeof setPartyRoleInputSchema>;

export const setCustomFieldInputSchema = z.strictObject({
  entity: z
    .enum(['container', 'shipment'])
    .describe('Whether ids are container or shipment IDs.'),
  ids: recordIds.describe('Terminal49 container or shipment IDs, 1 to 50.'),
  api_slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe(
      "The custom field's api_slug from the account's custom field definitions (shown on get_container or get_shipment_details with custom_fields). Never guess it from the display name.",
    ),
  value: z
    .union([z.string().max(1000), z.number(), z.boolean(), z.null()])
    .describe(
      'New value, in the format the field expects (for an option field, the option value; for a date, YYYY-MM-DD). null clears the field.',
    ),
});
export type SetCustomFieldArgs = z.input<typeof setCustomFieldInputSchema>;

export interface RecordWriteResult {
  updated: string[];
  unchanged: string[];
  failed: { id: string; error: string }[];
  summary: string;
}

export const recordWriteOutputSchema = z.object({
  updated: z.array(z.string()),
  unchanged: z.array(z.string()),
  failed: z.array(z.object({ id: z.string(), error: z.string() })),
  summary: z.string(),
});

type Outcome = 'updated' | 'unchanged';

// Messages from the API describe the record (validation, not found, access),
// so they are safe to show; anything else gets a generic message.
function describeError(error: unknown): string {
  const err = error as { name?: string; status?: number; message?: string };
  if (err.name === 'NotFoundError' || err.status === 404) {
    return 'Record not found in this account.';
  }
  if (err.name === 'AuthorizationError' || err.status === 403) {
    return 'Not allowed to change this record.';
  }
  if (
    (err.name === 'ValidationError' || err.status === 422) &&
    typeof err.message === 'string' &&
    err.message.trim()
  ) {
    return err.message.trim().slice(0, 200);
  }
  return 'The change could not be saved.';
}

async function applyEach(
  ids: string[],
  change: (id: string) => Promise<Outcome>,
  describe: (counts: {
    updated: number;
    unchanged: number;
    failed: number;
  }) => string,
): Promise<RecordWriteResult> {
  const result: RecordWriteResult = {
    updated: [],
    unchanged: [],
    failed: [],
    summary: '',
  };
  const queue = [...new Set(ids)];
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, queue.length) },
    async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          result[await change(id)].push(id);
        } catch (error) {
          result.failed.push({ id, error: describeError(error) });
        }
      }
    },
  );
  await Promise.all(workers);
  result.summary = describe({
    updated: result.updated.length,
    unchanged: result.unchanged.length,
    failed: result.failed.length,
  });
  return result;
}

const records = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

export async function executeSetPartyRole(
  args: SetPartyRoleArgs,
  client: Terminal49Client,
): Promise<RecordWriteResult> {
  const { container_ids, shipment_ids, role, party_id, action } =
    setPartyRoleInputSchema.parse(args);
  const manager = container_ids ? client.containers : client.shipments;
  const noun = container_ids ? 'container' : 'shipment';

  return applyEach(
    container_ids ?? shipment_ids ?? [],
    async (id) => {
      const current = (await manager.partyRoles(id, {
        format: 'mapped',
      })) as { id: string; role: string; partyId: string | null }[];
      const matching = current.filter(
        (assignment) =>
          assignment.role === role && assignment.partyId === party_id,
      );
      if (action === 'add') {
        if (matching.length > 0) return 'unchanged';
        await manager.addPartyRole(id, role, party_id);
        return 'updated';
      }
      if (matching.length === 0) return 'unchanged';
      for (const assignment of matching) {
        await manager.removePartyRole(id, assignment.id);
      }
      return 'updated';
    },
    ({ updated, unchanged, failed }) =>
      `${action === 'add' ? 'Assigned' : 'Removed'} ${role} on ${records(updated, noun)}; ` +
      `${unchanged} already ${action === 'add' ? 'had it' : 'without it'}; ${failed} failed.`,
  );
}

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function executeSetCustomField(
  args: SetCustomFieldArgs,
  client: Terminal49Client,
): Promise<RecordWriteResult> {
  const { entity, ids, api_slug, value } =
    setCustomFieldInputSchema.parse(args);
  const manager = entity === 'container' ? client.containers : client.shipments;

  return applyEach(
    ids,
    async (id) => {
      const current = (await manager.customFields(id, {
        format: 'mapped',
      })) as { slug?: string; value?: unknown }[];
      const existing = current.find((field) => field.slug === api_slug);
      if (value === null) {
        if (!existing || existing.value == null) return 'unchanged';
        await manager.clearCustomField(id, api_slug);
        return 'updated';
      }
      if (existing && sameValue(existing.value, value)) return 'unchanged';
      await manager.setCustomField(id, api_slug, value);
      return 'updated';
    },
    ({ updated, unchanged, failed }) =>
      `${value === null ? 'Cleared' : 'Set'} ${api_slug} on ${records(updated, entity)}; ` +
      `${unchanged} already ${value === null ? 'empty' : 'had that value'}; ${failed} failed.`,
  );
}
