/**
 * set_party_role and set_custom_field tools (tier C, batch)
 *
 * Attach a party to containers or shipments in a role (for example the
 * drayage carrier) and set or clear an account custom field, on up to 50
 * records per call. Every call reads each record first and plans one change
 * per record. A call whose changes only add writes at once. A call in which
 * any record would lose a party or a value shows the user one preview of
 * every change in the call and writes only after they approve it. The
 * approval is bound to the state of every record in the call, so a record
 * that changes between the preview and the approval asks again. A repeat
 * call reports `unchanged` instead of failing, and one failing record does
 * not stop the rest. Rails checks the user's permissions and records who
 * made the change and through which channel.
 */

import { z } from 'zod';
import type {
  ContainerAddPartyRoleParams,
  ShipmentAddPartyRoleParams,
  Terminal49Client,
} from '@terminal49/sdk';
import type { ToolContext } from './context.js';
import {
  formatPartyRoles,
  partyAttributesSchema,
  partyName,
  type PartyRole,
} from './party-roles.js';
import {
  httpStatus,
  isFeatureNotEnabled,
  isNotAuthorized,
  type SoftResult,
} from './soft-results.js';
import {
  canonicalJson,
  confirmationTokenInput,
  confirmedWriteResultSchema,
  type ConfirmedWriteRead,
  type ConfirmedWriteResult,
  runConfirmedWrite,
} from './write-kit.js';

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

/**
 * Public GET /parties lists a customer created before party roles under its
 * account id, which party roles do not accept, so a party_id from
 * list_parties can name no party. The record's own party_roles carry the id
 * party roles use.
 */
const PARTY_ID_HINT =
  "Use the party_id shown in the record's party_roles (get_container include ['party_roles'] or get_shipment_details include_party_roles), not an id from list_parties, which can list a customer under its account id.";

const recordIds = z.array(z.string().uuid()).min(1).max(MAX_RECORDS);

export const setPartyRoleInputSchema = z
  .strictObject({
    container_ids: recordIds
      .optional()
      .describe(
        'Terminal49 IDs of the containers to change. Pass container_ids or shipment_ids, not both.',
      ),
    shipment_ids: recordIds
      .optional()
      .describe(
        'Terminal49 IDs of the shipments to change. Pass container_ids or shipment_ids, not both.',
      ),
    role: z
      .enum(SHIPMENT_PARTY_ROLES)
      .describe(
        'Role to set. Containers support only pickup_dray_carrier; shipments support every listed role.',
      ),
    party_id: z
      .string()
      .uuid()
      .describe(
        "Party ID, as shown in a record's party_roles. Never pass a company name.",
      ),
    action: z
      .enum(['add', 'replace', 'remove'])
      .describe(
        'add attaches the party in the role, beside any others; it fails on a record where a different party already holds pickup_dray_carrier or customer, which hold one party each. ' +
          'replace makes the party the only one in the role, detaching any other (use it to change the drayage carrier); it does not replace a shipment customer: remove the current one, then add the new one. remove detaches the party.',
      ),
    confirmation_token: confirmationTokenInput,
  })
  .refine((args) => !!args.container_ids !== !!args.shipment_ids, {
    message: 'Pass container_ids or shipment_ids, not both.',
  })
  .refine((args) => !args.container_ids || isContainerPartyRole(args.role), {
    message: CONTAINER_ROLE_MESSAGE,
  });
export type SetPartyRoleArgs = z.input<typeof setPartyRoleInputSchema>;

const customFieldValueSchema = z.union([
  z.string().max(1000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(1000)).max(100),
  z.null(),
]);

export const setCustomFieldInputSchema = z.strictObject({
  entity: z
    .enum(['container', 'shipment'])
    .describe(
      'The kind of record the field is on. Every ID in ids must be this kind.',
    ),
  ids: recordIds.describe(
    'Terminal49 IDs of the containers or shipments to change.',
  ),
  api_slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe(
      "The custom field's api_slug from the account's custom field definitions. Never guess it from the display name.",
    ),
  value: customFieldValueSchema.describe(
    'New value, in the format the field expects (for an option field, the option value; for a multi-select field, an array of option values; for a date, YYYY-MM-DD). null clears the field.',
  ),
  confirmation_token: confirmationTokenInput,
});
export type SetCustomFieldArgs = z.input<typeof setCustomFieldInputSchema>;

// ==================== Results ====================

export interface RecordWriteResult {
  updated: string[];
  unchanged: string[];
  failed: { id: string; error: string }[];
  not_attempted: string[];
  summary: string;
}

const failureSchema = z.object({ id: z.string(), error: z.string() });

const recordWriteFields = {
  updated: z.array(z.string()).optional(),
  unchanged: z.array(z.string()).optional(),
  failed: z.array(failureSchema).optional(),
  not_attempted: z
    .array(z.string())
    .optional()
    .describe(
      'Records the call ran out of time to reach. Nothing was changed on them; call again with these IDs.',
    ),
  summary: z.string().optional(),
};

/** One record's change in a preview: what it holds now and after the write. */
export interface RecordChange<Value> {
  id: string;
  current: Value;
  proposed: Value;
}

/**
 * The preview of a batch call. `changes` lists only the records that would
 * change; the rest are counted or, for a failed read, named with the error.
 */
export interface BatchPreview<Value> {
  reach: string;
  changes: RecordChange<Value>[];
  unchanged: number;
  failed: { id: string; error: string }[];
  not_attempted: string[];
}

function batchPreviewSchema<Value extends z.ZodType>(value: Value) {
  return z.object({
    reach: z.string(),
    changes: z.array(
      z.object({ id: z.string(), current: value, proposed: value }),
    ),
    unchanged: z.number(),
    failed: z.array(failureSchema),
    not_attempted: z.array(z.string()),
  });
}

const partyRefSchema = z.object({
  party_id: z.string(),
  party_name: z.string().nullable(),
});
type PartyRef = z.infer<typeof partyRefSchema>;

export const setPartyRoleOutputSchema = confirmedWriteResultSchema(
  batchPreviewSchema(z.array(partyRefSchema)),
  recordWriteFields,
);

export const setCustomFieldOutputSchema = confirmedWriteResultSchema(
  batchPreviewSchema(z.unknown()),
  recordWriteFields,
);

export type PartyNotFound = SoftResult<'party_not_found'>;

export type SetPartyRoleResult = ConfirmedWriteResult<
  BatchPreview<PartyRef[]>,
  RecordWriteResult | PartyNotFound,
  RecordWriteResult
>;

export type SetCustomFieldResult = ConfirmedWriteResult<
  BatchPreview<unknown>,
  RecordWriteResult,
  RecordWriteResult
>;

// ==================== Errors ====================

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

// ==================== Batch runner ====================

interface Failure {
  id: string;
  error: string;
}

interface BatchOutcome<T> {
  /** One entry per record the work finished, in the order of `ids`. */
  done: { id: string; value: T }[];
  failed: Failure[];
  /** Records the deadline arrived before, with nothing sent for them. */
  not_attempted: string[];
}

/**
 * Runs `work` on each record, five at a time, until the deadline. A record
 * whose write was in flight at the deadline is failed with a warning; one
 * not started is reported as not attempted.
 */
async function forEachRecord<T>(
  ids: readonly string[],
  work: (id: string, save: Save) => Promise<T>,
  deadlineAt: number,
): Promise<BatchOutcome<T>> {
  // The SDK cannot cancel a request, so the call stops waiting at the deadline
  // instead; an SDK request may take 30s and retry, past the function limit.
  const deadline = new AbortController();
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) deadline.abort();
  const timer = setTimeout(() => deadline.abort(), Math.max(remainingMs, 0));
  const outOfTime = new Promise<'out_of_time'>((resolve) =>
    deadline.signal.addEventListener('abort', () => resolve('out_of_time')),
  );
  const done = new Map<string, T>();
  const failed = new Map<string, string>();
  const notAttempted = new Set<string>();
  const queue = [...ids];
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
          const outcome = await Promise.race([work(id, save), outOfTime]);
          if (outcome !== 'out_of_time') {
            done.set(id, outcome);
          } else if (wrote) {
            failed.set(id, TIMED_OUT_MID_WRITE);
          } else {
            notAttempted.add(id);
          }
        } catch (error) {
          failed.set(id, describeError(error));
        }
      }
    },
  );
  await Promise.all(workers);
  clearTimeout(timer);
  for (const id of queue) notAttempted.add(id);
  return {
    done: ids.flatMap((id) =>
      done.has(id) ? [{ id, value: done.get(id) as T }] : [],
    ),
    failed: ids.flatMap((id) =>
      failed.has(id) ? [{ id, error: failed.get(id) as string }] : [],
    ),
    not_attempted: ids.filter((id) => notAttempted.has(id)),
  };
}

const records = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

// ==================== Batch plan ====================

/** What one record needs, decided from its current state before any write. */
type Planned<Change, Value> =
  | { outcome: 'unchanged'; state: unknown }
  | {
      outcome: 'change';
      /** The fields the write reads or changes, for the approval binding. */
      state: unknown;
      /** True when the record loses a party or a value. */
      destructive: boolean;
      current: Value;
      proposed: Value;
      change: Change;
    };

interface Counts {
  /** Records that would change. */
  changing: number;
  /** Of those, records that lose a party or a value. */
  losing: number;
  unchanged: number;
  failed: number;
}

interface WriteCounts {
  updated: number;
  unchanged: number;
  failed: number;
}

interface BatchPlan<Change, Value, Stop> {
  tool: 'set_party_role' | 'set_custom_field';
  entityType: 'container' | 'shipment';
  ids: string[];
  args: Record<string, unknown> & { confirmation_token?: string };
  /**
   * Runs once per call before any record is read, inside the read budget. A
   * result ends the call before any record is touched; a throw fails the
   * call the way a record read would, so a 429 becomes rate_limited.
   */
  prepare?(): Promise<Stop | undefined>;
  /** Reads one record and decides what it needs. A throw fails the record. */
  planRecord(id: string): Promise<Planned<Change, Value>>;
  /** Applies one planned change. A throw fails the record. */
  writeRecord(id: string, change: Change, save: Save): Promise<void>;
  /** The preview sentence naming what the call reaches. */
  reach(counts: Counts): string;
  /** One value as the dialog shows it. */
  show(value: Value): string;
  /** The result sentence after the writes. */
  summary(counts: WriteCounts): string;
}

function result(
  fields: Omit<RecordWriteResult, 'summary'>,
  summary: (counts: WriteCounts) => string,
): RecordWriteResult {
  let text = summary({
    updated: fields.updated.length,
    unchanged: fields.unchanged.length,
    failed: fields.failed.length,
  });
  const skipped = fields.not_attempted.length;
  if (skipped > 0) {
    text += ` Ran out of time before ${skipped} more; call again with not_attempted.`;
  }
  return { ...fields, summary: text };
}

/** The work's result, or out_of_time once the deadline passes first. */
function byDeadline<T>(
  work: Promise<T>,
  deadlineAt: number,
): Promise<T | 'out_of_time'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<'out_of_time'>((resolve) => {
    timer = setTimeout(
      resolve,
      Math.max(deadlineAt - Date.now(), 0),
      'out_of_time',
    );
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Runs a batch write through the confirmed write flow. The read phase plans
 * every record; the write phase runs only the planned changes, after the
 * user's approval when any of them is destructive.
 */
async function runBatchWrite<Change, Value, Stop = never>(
  context: ToolContext,
  plan: BatchPlan<Change, Value, Stop>,
): Promise<
  ConfirmedWriteResult<
    BatchPreview<Value>,
    RecordWriteResult | Stop,
    RecordWriteResult
  >
> {
  const deadlineAt = context.writeDeadlineAt ?? Date.now() + CALL_BUDGET_MS;
  // Set by read() on every call, so write() applies the plans the approval
  // was checked against.
  let planned: { id: string; value: Planned<Change, Value> }[] = [];
  let unreadable: Failure[] = [];
  let notRead: string[] = [];
  const unchangedIds = () =>
    planned.filter((p) => p.value.outcome === 'unchanged').map((p) => p.id);

  return runConfirmedWrite(context, {
    tool: plan.tool,
    entityType: plan.entityType,
    entityId: plan.ids.length === 1 ? plan.ids[0] : undefined,
    args: plan.args,
    async read(): Promise<
      ConfirmedWriteRead<BatchPreview<Value>, RecordWriteResult | Stop>
    > {
      // Reads get half of what is left, so one slow record cannot hold every
      // write until the deadline; a record not read in time is reported as
      // not attempted.
      const readDeadlineAt = Date.now() + (deadlineAt - Date.now()) / 2;
      if (plan.prepare) {
        const prepared = await byDeadline(plan.prepare(), readDeadlineAt);
        if (prepared === 'out_of_time') {
          return {
            stop: result(
              {
                updated: [],
                unchanged: [],
                failed: [],
                not_attempted: plan.ids,
              },
              plan.summary,
            ),
          };
        }
        if (prepared !== undefined) return { stop: prepared };
      }
      const read = await forEachRecord(
        plan.ids,
        (id) => plan.planRecord(id),
        readDeadlineAt,
      );
      planned = read.done;
      unreadable = read.failed;
      notRead = read.not_attempted;
      const changes = planned.flatMap(({ id, value }) =>
        value.outcome === 'change' ? [{ id, ...value }] : [],
      );
      const counts: Counts = {
        changing: changes.length,
        losing: changes.filter((change) => change.destructive).length,
        unchanged: planned.length - changes.length,
        failed: unreadable.length,
      };
      if (changes.length === 0) {
        return {
          stop: result(
            {
              updated: [],
              unchanged: unchangedIds(),
              failed: unreadable,
              not_attempted: notRead,
            },
            plan.summary,
          ),
        };
      }
      const preview: BatchPreview<Value> = {
        reach: plan.reach(counts),
        changes: changes.map(({ id, current, proposed }) => ({
          id,
          current,
          proposed,
        })),
        unchanged: counts.unchanged,
        failed: unreadable,
        not_attempted: notRead,
      };
      if (counts.losing === 0) return { additive: preview };
      // Every record read, not only the changing ones: a record that was
      // unchanged at the preview and changed since may now need a change
      // the user never saw.
      const state = Object.fromEntries([
        ...planned.map(({ id, value }) => [id, value.state] as const),
        ...unreadable.map(({ id, error }) => [id, { error }] as const),
      ]);
      return { state, preview };
    },
    async write(): Promise<RecordWriteResult> {
      const changes = new Map(
        planned.flatMap(({ id, value }) =>
          value.outcome === 'change' ? [[id, value.change] as const] : [],
        ),
      );
      const written = await forEachRecord(
        [...changes.keys()],
        (id, save) => plan.writeRecord(id, changes.get(id) as Change, save),
        deadlineAt,
      );
      return result(
        {
          updated: written.done.map(({ id }) => id),
          unchanged: unchangedIds(),
          failed: [...unreadable, ...written.failed],
          not_attempted: [...notRead, ...written.not_attempted],
        },
        plan.summary,
      );
    },
    describe(preview) {
      return [
        `${plan.tool} on ${records(plan.ids.length, plan.entityType)}`,
        preview.reach,
        ...preview.changes.map(
          ({ id, current, proposed }) =>
            `${id}: ${plan.show(current)} -> ${plan.show(proposed)}`,
        ),
        ...preview.failed.map(
          ({ id, error }) => `${id}: cannot be changed (${error})`,
        ),
        ...(preview.not_attempted.length > 0
          ? [`Not read in time: ${preview.not_attempted.join(', ')}`]
          : []),
      ].join('\n');
    },
  });
}

// ==================== set_party_role ====================

type PartyChange = {
  attach: boolean;
  /** Party role assignment ids to detach. */
  detach: string[];
};

const rawPartySchema = z.object({
  data: z.object({ id: z.string(), attributes: partyAttributesSchema }),
});

/**
 * The party's display name, or undefined when it has none or this credential
 * cannot read parties. Null when Terminal49 has no party with this id.
 */
async function lookupPartyName(
  client: Terminal49Client,
  partyId: string,
): Promise<string | null | undefined> {
  let raw: unknown;
  try {
    raw = await client.parties.get(partyId, { format: 'raw' });
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    if (isNotAuthorized(error) || isFeatureNotEnabled(error)) return undefined;
    throw error;
  }
  return partyName(rawPartySchema.parse(raw).data.attributes) ?? undefined;
}

function partyNotFound(partyId: string): PartyNotFound {
  return {
    error: 'party_not_found',
    message: `Terminal49 has no party with id ${partyId}, so nothing was changed.`,
    alternative: PARTY_ID_HINT,
  };
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

const showParties = (parties: PartyRef[]) =>
  parties.length === 0
    ? '(none)'
    : parties.map((party) => party.party_name ?? party.party_id).join(', ');

export async function executeSetPartyRole(
  args: SetPartyRoleArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<SetPartyRoleResult> {
  const parsed = setPartyRoleInputSchema.parse(args);
  const { container_ids, shipment_ids, role, party_id, action } = parsed;
  const ids = [...new Set(container_ids ?? shipment_ids ?? [])];
  const manager = container_ids ? client.containers : client.shipments;
  const noun = container_ids ? 'container' : 'shipment';
  const addRole = (id: string) => {
    if (!container_ids) {
      return client.shipments.addPartyRole(id, { role, partyId: party_id });
    }
    if (!isContainerPartyRole(role)) throw new Error(CONTAINER_ROLE_MESSAGE);
    return client.containers.addPartyRole(id, { role, partyId: party_id });
  };

  let target: PartyRef = { party_id, party_name: null };
  let label = party_id;
  const ref = (assignment: PartyRole): PartyRef => ({
    party_id: assignment.party_id ?? '',
    party_name: assignment.party_name,
  });

  return runBatchWrite<PartyChange, PartyRef[], PartyNotFound>(context, {
    tool: 'set_party_role',
    entityType: noun,
    ids,
    args: parsed,
    async prepare() {
      const name = await lookupPartyName(client, party_id);
      if (name === null) return partyNotFound(party_id);
      target = { party_id, party_name: name ?? null };
      label = name ?? party_id;
      return undefined;
    },
    async planRecord(id) {
      const inRole = formatPartyRoles(
        await manager.partyRoles(id, { format: 'raw' }),
      ).filter((assignment) => assignment.role === role);
      const matching = inRole.filter((a) => a.party_id === party_id);
      const others = inRole.filter((a) => a.party_id !== party_id);
      const state = inRole.map((a) => ({
        assignment: a.id,
        party_id: a.party_id,
      }));
      const current = inRole.map(ref);

      if (action === 'remove') {
        if (matching.length === 0) {
          if (others.length === 0) return { outcome: 'unchanged', state };
          throw new RecordWriteError(
            `No ${role} with party_id ${party_id} on this record; it has ${showParties(others.map(ref))}. ${PARTY_ID_HINT}`,
          );
        }
        return {
          outcome: 'change',
          state,
          destructive: true,
          current,
          proposed: others.map(ref),
          change: { attach: false, detach: matching.map((a) => a.id) },
        };
      }
      if (action === 'add') {
        if (matching.length > 0) return { outcome: 'unchanged', state };
        if (others.length > 0 && SINGLE_PARTY_ROLES.includes(role)) {
          throw new RecordWriteError(
            role === 'customer'
              ? `Already has a different customer. ${CUSTOMER_SWAP_HINT}`
              : `Already has a different ${role}. Use action "replace" to swap it.`,
          );
        }
        return {
          outcome: 'change',
          state,
          destructive: false,
          current,
          proposed: [...current, target],
          change: { attach: true, detach: [] },
        };
      }
      if (others.length === 0 && matching.length > 0) {
        return { outcome: 'unchanged', state };
      }
      // The unique index rejects a second customer, so a swap would have to
      // remove the current one first and could leave the shipment without one.
      if (others.length > 0 && role === 'customer') {
        throw new RecordWriteError(
          `Replacing the customer is not supported. ${CUSTOMER_SWAP_HINT}`,
        );
      }
      return {
        outcome: 'change',
        state,
        destructive: others.length > 0,
        current,
        proposed: [target],
        change: {
          attach: matching.length === 0,
          detach: others.map((a) => a.id),
        },
      };
    },
    async writeRecord(id, change, save) {
      // Attach first so a failed add leaves the previous party in place.
      if (change.attach) {
        try {
          await save(() => addRole(id));
        } catch (error) {
          if (!isNotFound(error)) throw error;
          throw new RecordWriteError(
            `Terminal49 has no party with id ${party_id}. ${PARTY_ID_HINT}`,
          );
        }
      }
      for (const assignment of change.detach) {
        try {
          await save(() => manager.removePartyRole(id, assignment));
        } catch (error) {
          if (isNotFound(error)) continue; // Already gone.
          const detail = describeError(error);
          throw new RecordWriteError(
            action === 'remove'
              ? `Could not detach: ${detail}`
              : change.attach
                ? `Attached the new party but could not detach another party in ${role}: ${detail}`
                : `Kept the party but could not detach another party in ${role}: ${detail}`,
          );
        }
      }
    },
    reach({ changing, losing, unchanged, failed }) {
      const on = records(changing, noun);
      const head =
        action === 'add'
          ? `Attaches ${label} as ${role} on ${on}.`
          : action === 'remove'
            ? `Detaches ${label} from the ${role} role on ${on}.`
            : `Makes ${label} the only ${role} on ${on}; ${losing} of them lose the party now in that role.`;
      return [
        head,
        ...(unchanged > 0 ? [`${unchanged} unchanged.`] : []),
        ...(failed > 0 ? [`${failed} cannot be changed.`] : []),
      ].join(' ');
    },
    show: showParties,
    summary: ({ updated, unchanged, failed }) =>
      `${PARTY_ROLE_VERBS[action]} ${role} on ${records(updated, noun)}; ` +
      `${unchanged} already ${PARTY_ROLE_UNCHANGED[action]}; ${failed} failed.`,
  });
}

// ==================== set_custom_field ====================

type FieldChange = { set: unknown } | { clear: true };

// `format: 'mapped'` returns mapCustomFields' rows.
const mappedCustomFieldsSchema = z.array(
  z.object({ slug: z.string().optional(), value: z.unknown() }),
);

/** An empty field: never set, cleared, or holding no options. */
const isEmpty = (value: unknown) =>
  value == null || value === '' || (Array.isArray(value) && value.length === 0);

// Multi-select values are sets: the same options in another order are unchanged.
const comparable = (value: unknown) =>
  Array.isArray(value) ? value.map(String).sort() : (value ?? null);
const sameValue = (a: unknown, b: unknown) =>
  canonicalJson(comparable(a)) === canonicalJson(comparable(b));

const showValue = (value: unknown) =>
  isEmpty(value) ? '(empty)' : canonicalJson(value);

export async function executeSetCustomField(
  args: SetCustomFieldArgs,
  client: Terminal49Client,
  context: ToolContext,
): Promise<SetCustomFieldResult> {
  const parsed = setCustomFieldInputSchema.parse(args);
  const { entity, api_slug, value } = parsed;
  const ids = [...new Set(parsed.ids)];
  const manager = entity === 'container' ? client.containers : client.shipments;

  return runBatchWrite<FieldChange, unknown>(context, {
    tool: 'set_custom_field',
    entityType: entity,
    ids,
    args: parsed,
    async planRecord(id) {
      const fields = mappedCustomFieldsSchema.parse(
        await manager.customFields(id, { format: 'mapped' }),
      );
      const current =
        fields.find((field) => field.slug === api_slug)?.value ?? null;
      const state = { value: comparable(current) };
      if (value === null) {
        if (isEmpty(current)) return { outcome: 'unchanged', state };
        return {
          outcome: 'change',
          state,
          destructive: true,
          current,
          proposed: null,
          change: { clear: true },
        };
      }
      if (sameValue(current, value)) return { outcome: 'unchanged', state };
      return {
        outcome: 'change',
        state,
        destructive: !isEmpty(current),
        current,
        proposed: value,
        change: { set: value },
      };
    },
    async writeRecord(id, change, save) {
      if ('clear' in change) {
        await save(() => manager.deleteCustomField(id, api_slug));
      } else {
        await save(() => manager.setCustomField(id, api_slug, change.set));
      }
    },
    reach({ changing, losing, unchanged, failed }) {
      const on = records(changing, entity);
      const head =
        value === null
          ? `Clears ${api_slug} on ${on}.`
          : `Sets ${api_slug} to ${canonicalJson(value)} on ${on}; ${losing} of them lose a current value.`;
      return [
        head,
        ...(unchanged > 0 ? [`${unchanged} unchanged.`] : []),
        ...(failed > 0 ? [`${failed} cannot be changed.`] : []),
      ].join(' ');
    },
    show: showValue,
    summary: ({ updated, unchanged, failed }) =>
      `${value === null ? 'Cleared' : 'Set'} ${api_slug} on ${records(updated, entity)}; ` +
      `${unchanged} already ${value === null ? 'empty' : 'had that value'}; ${failed} failed.`,
  });
}
