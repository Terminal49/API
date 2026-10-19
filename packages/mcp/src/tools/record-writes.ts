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
import type {
  ContainerAddPartyRoleParams,
  ShipmentAddPartyRoleParams,
  Terminal49Client,
} from '@terminal49/sdk';

const MAX_RECORDS = 50;
const CONCURRENCY = 5;
// The hosted /mcp function stops at 30s (vercel.json maxDuration). Stop working
// on records well before that so the caller still gets the result back. The
// gateway starts this budget when the request arrives, so auth time counts too.
export const CALL_BUDGET_MS = 20_000;

export const CONTAINER_PARTY_ROLES = [
  'pickup_dray_carrier',
] as const satisfies readonly ContainerAddPartyRoleParams['role'][];
export const SHIPMENT_PARTY_ROLES = [
  'shipper',
  'consignee',
  'notify_party',
  'customs_broker',
  'customer',
  'freight_forwarder',
  'pickup_dray_carrier',
] as const satisfies readonly ShipmentAddPartyRoleParams['role'][];

type ContainerPartyRole = (typeof CONTAINER_PARTY_ROLES)[number];
const isContainerPartyRole = (role: string): role is ContainerPartyRole =>
  // SAFETY: widening the tuple to string[] only lets includes() accept any string.
  (CONTAINER_PARTY_ROLES as readonly string[]).includes(role);
const CONTAINER_ROLE_MESSAGE =
  'Containers support only the pickup_dray_carrier role.';

// Roles a record holds one party in. Rails accepts a second container
// pickup_dray_carrier beside the first, but container displays read only the
// first one found; adding one to a shipment deletes the previous one; a second
// shipment customer is rejected by a unique index. So `add` refuses when a
// different party already holds one of these, and `replace` swaps it.
const CUSTOMER_SWAP_HINT = 'Remove the current customer, then add the new one.';
const SINGLE_PARTY_ROLES: readonly string[] = [
  'pickup_dray_carrier',
  'customer',
];

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
      .enum(['add', 'replace', 'remove'])
      .describe(
        'add attaches the party in the role, beside any others; it fails on a record where a different party already holds pickup_dray_carrier or customer, which hold one party each. ' +
          'replace makes the party the only one in the role, detaching any other (use it to change the drayage carrier); it does not replace a shipment customer: remove the current one, then add the new one. remove detaches the party.',
      ),
  })
  .refine((args) => !!args.container_ids !== !!args.shipment_ids, {
    message: 'Pass container_ids or shipment_ids, not both.',
  })
  .refine((args) => !args.container_ids || isContainerPartyRole(args.role), {
    message: CONTAINER_ROLE_MESSAGE,
  });
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
    .union([
      z.string().max(1000),
      z.number(),
      z.boolean(),
      z.array(z.string().max(1000)).max(100),
      z.null(),
    ])
    .describe(
      'New value, in the format the field expects (for an option field, the option value; for a multi-select field, an array of option values; for a date, YYYY-MM-DD). null clears the field.',
    ),
});
export type SetCustomFieldArgs = z.input<typeof setCustomFieldInputSchema>;

export interface RecordWriteResult {
  updated: string[];
  unchanged: string[];
  failed: { id: string; error: string }[];
  not_attempted: string[];
  summary: string;
}

export const recordWriteOutputSchema = z.object({
  updated: z.array(z.string()),
  unchanged: z.array(z.string()),
  failed: z.array(z.object({ id: z.string(), error: z.string() })),
  not_attempted: z
    .array(z.string())
    .describe(
      'Records the call ran out of time to reach. Nothing was changed on them; call again with these IDs.',
    ),
  summary: z.string(),
});

type Outcome = 'updated' | 'unchanged';

// A record the tool itself declined or only partly changed; the message is
// written here, so it is safe to show as is.
class RecordWriteError extends Error {}

// Terminal49 SDK errors carry an optional name, status and message.
type SdkErrorFields = { name?: string; status?: number; message?: string };

const isNotFound = (error: unknown) => {
  // SAFETY: every field is optional and read with ===, so a throw that is not
  // an SDK error simply fails both checks.
  const err = error as SdkErrorFields;
  return err.name === 'NotFoundError' || err.status === 404;
};

// Messages from the API describe the record (validation, not found, access),
// so they are safe to show; anything else gets a generic message.
function describeError(error: unknown): string {
  if (error instanceof RecordWriteError) return error.message;
  // SAFETY: as in isNotFound; message is used only after a typeof check.
  const err = error as SdkErrorFields;
  if (isNotFound(err)) {
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

// Every write a record change makes goes through `save`, so none starts after
// the call has stopped waiting for that record.
type Save = <T>(write: () => Promise<T>) => Promise<T>;

const MAY_HAVE_APPLIED =
  'The change may or may not have been applied; check this record before calling again.';
const TIMED_OUT_MID_WRITE = `Ran out of time while saving. ${MAY_HAVE_APPLIED}`;
const NO_CLEAR_ANSWER = `Saving got no clear answer from Terminal49. ${MAY_HAVE_APPLIED}`;

// A 4xx answer means the API refused the write. Any other failure after the
// write was sent (a dropped connection, a timeout, a 5xx) can follow a write
// that was applied.
const wasRefused = (error: unknown) => {
  // SAFETY: as in isNotFound; status is used only after a typeof check.
  const { status } = error as SdkErrorFields;
  return typeof status === 'number' && status >= 400 && status < 500;
};

async function applyEach(
  ids: string[],
  change: (id: string, save: Save) => Promise<Outcome>,
  describe: (counts: {
    updated: number;
    unchanged: number;
    failed: number;
  }) => string,
  deadlineAt: number,
): Promise<RecordWriteResult> {
  // The SDK cannot cancel a request, so the call stops waiting at the deadline
  // instead; an SDK request may take 30s and retry, past the function limit.
  const deadline = new AbortController();
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) deadline.abort();
  const timer = setTimeout(() => deadline.abort(), Math.max(remainingMs, 0));
  const outOfTime = new Promise<'out_of_time'>((resolve) =>
    deadline.signal.addEventListener('abort', () => resolve('out_of_time')),
  );
  const result: RecordWriteResult = {
    updated: [],
    unchanged: [],
    failed: [],
    not_attempted: [],
    summary: '',
  };
  const queue = [...new Set(ids)];
  const workers = Array.from(
    { length: Math.min(CONCURRENCY, queue.length) },
    async () => {
      while (!deadline.signal.aborted) {
        const id = queue.shift();
        if (id === undefined) break;
        let wrote = false;
        const save: Save = (write) => {
          if (deadline.signal.aborted) {
            return Promise.reject(new RecordWriteError(TIMED_OUT_MID_WRITE));
          }
          wrote = true;
          return write().catch((error: unknown) => {
            throw wasRefused(error)
              ? error
              : new RecordWriteError(NO_CLEAR_ANSWER);
          });
        };
        try {
          const outcome = await Promise.race([change(id, save), outOfTime]);
          if (outcome !== 'out_of_time') {
            result[outcome].push(id);
          } else if (wrote) {
            result.failed.push({ id, error: TIMED_OUT_MID_WRITE });
          } else {
            result.not_attempted.push(id);
          }
        } catch (error) {
          result.failed.push({ id, error: describeError(error) });
        }
      }
    },
  );
  await Promise.all(workers);
  clearTimeout(timer);
  result.not_attempted.push(...queue);
  result.summary = describe({
    updated: result.updated.length,
    unchanged: result.unchanged.length,
    failed: result.failed.length,
  });
  const skipped = result.not_attempted.length;
  if (skipped > 0) {
    result.summary += ` Ran out of time before ${skipped} more; call again with not_attempted.`;
  }
  return result;
}

const records = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

// GET .../party_roles returns a JSON:API list; the role's party is a relationship.
const partyRoleListSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      attributes: z.object({ role: z.string() }),
      relationships: z.object({
        party: z.object({ data: z.object({ id: z.string() }).nullable() }),
      }),
    }),
  ),
});

export async function executeSetPartyRole(
  args: SetPartyRoleArgs,
  client: Terminal49Client,
  deadlineAt = Date.now() + CALL_BUDGET_MS,
): Promise<RecordWriteResult> {
  const { container_ids, shipment_ids, role, party_id, action } =
    setPartyRoleInputSchema.parse(args);
  const manager = container_ids ? client.containers : client.shipments;
  const noun = container_ids ? 'container' : 'shipment';
  const addRole = (id: string) => {
    if (!container_ids) {
      return client.shipments.addPartyRole(id, { role, partyId: party_id });
    }
    if (!isContainerPartyRole(role)) throw new Error(CONTAINER_ROLE_MESSAGE);
    return client.containers.addPartyRole(id, { role, partyId: party_id });
  };

  return applyEach(
    container_ids ?? shipment_ids ?? [],
    async (id, save) => {
      const { data } = partyRoleListSchema.parse(
        await manager.partyRoles(id, { format: 'raw' }),
      );
      const inRole = data.filter(
        (assignment) => assignment.attributes.role === role,
      );
      const isParty = (assignment: (typeof inRole)[number]) =>
        assignment.relationships.party.data?.id === party_id;
      const matching = inRole.filter(isParty);
      const others = inRole.filter((assignment) => !isParty(assignment));

      if (action === 'remove') {
        if (matching.length === 0) return 'unchanged';
        for (const assignment of matching) {
          await save(() => manager.removePartyRole(id, assignment.id));
        }
        return 'updated';
      }
      if (action === 'add') {
        if (matching.length > 0) return 'unchanged';
        if (others.length > 0 && SINGLE_PARTY_ROLES.includes(role)) {
          throw new RecordWriteError(
            role === 'customer'
              ? `Already has a different customer. ${CUSTOMER_SWAP_HINT}`
              : `Already has a different ${role}. Use action "replace" to swap it.`,
          );
        }
        await save(() => addRole(id));
        return 'updated';
      }

      if (others.length === 0) {
        if (matching.length > 0) return 'unchanged';
        await save(() => addRole(id));
        return 'updated';
      }
      // The unique index rejects a second customer, so a swap would have to
      // remove the current one first and could leave the shipment without one.
      if (role === 'customer') {
        throw new RecordWriteError(
          `Replacing the customer is not supported. ${CUSTOMER_SWAP_HINT}`,
        );
      }
      // Attach first so a failed add leaves the previous party in place.
      const attached = matching.length === 0;
      if (attached) await save(() => addRole(id));
      for (const assignment of others) {
        try {
          await save(() => manager.removePartyRole(id, assignment.id));
        } catch (error) {
          if (isNotFound(error)) continue; // Rails already replaced it.
          const detail = `could not detach another party in ${role}: ${describeError(error)}`;
          throw new RecordWriteError(
            attached
              ? `Attached the new party but ${detail}`
              : `Kept the party but ${detail}`,
          );
        }
      }
      return 'updated';
    },
    ({ updated, unchanged, failed }) =>
      `${PARTY_ROLE_VERBS[action]} ${role} on ${records(updated, noun)}; ` +
      `${unchanged} already ${PARTY_ROLE_UNCHANGED[action]}; ${failed} failed.`,
    deadlineAt,
  );
}

const PARTY_ROLE_VERBS = {
  add: 'Assigned',
  replace: 'Set',
  remove: 'Removed',
} as const;
const PARTY_ROLE_UNCHANGED = {
  add: 'had it',
  replace: 'had only that party',
  remove: 'without it',
} as const;

// Multi-select values are sets: the same options in another order are unchanged.
const comparable = (value: unknown) =>
  JSON.stringify(
    Array.isArray(value) ? value.map(String).sort() : (value ?? null),
  );
const sameValue = (a: unknown, b: unknown) => comparable(a) === comparable(b);

export async function executeSetCustomField(
  args: SetCustomFieldArgs,
  client: Terminal49Client,
  deadlineAt = Date.now() + CALL_BUDGET_MS,
): Promise<RecordWriteResult> {
  const { entity, ids, api_slug, value } =
    setCustomFieldInputSchema.parse(args);
  const manager = entity === 'container' ? client.containers : client.shipments;

  return applyEach(
    ids,
    async (id, save) => {
      // SAFETY: `format: 'mapped'` makes the SDK return the result of mapCustomFields.
      const current = (await manager.customFields(id, {
        format: 'mapped',
      })) as { slug?: string; value?: unknown }[];
      const existing = current.find((field) => field.slug === api_slug);
      if (value === null) {
        if (!existing || existing.value == null) return 'unchanged';
        await save(() => manager.deleteCustomField(id, api_slug));
        return 'updated';
      }
      if (existing && sameValue(existing.value, value)) return 'unchanged';
      await save(() => manager.setCustomField(id, api_slug, value));
      return 'updated';
    },
    ({ updated, unchanged, failed }) =>
      `${value === null ? 'Cleared' : 'Set'} ${api_slug} on ${records(updated, entity)}; ` +
      `${unchanged} already ${value === null ? 'empty' : 'had that value'}; ${failed} failed.`,
    deadlineAt,
  );
}
