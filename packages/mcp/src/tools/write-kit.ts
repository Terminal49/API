/**
 * Shared pieces for tools that change account data: the confirmed preview
 * that tier C writes need, and the soft results those writes return.
 *
 * A tier C tool's first call changes nothing. It reads the record and builds
 * a preview and a token: an HMAC over the tool, its arguments, the account,
 * the credential, an expiry and a fingerprint of the record state the preview
 * showed. The write runs only when a later call brings back a token that
 * still matches all of them.
 *
 * Who holds the token depends on the client. A request that declares form
 * elicitation (MCP 2026-07-28) gets an input_required result: the client
 * shows the user the preview and asks them to confirm, and echoes the token
 * as requestState. The model never sees a token it could pass back, so the
 * human decides. Any other request gets the preview and the token in the
 * result, and the model passes the token back after the user approves. That
 * token is not a security boundary: a model can make both calls itself. The
 * backend still decides what the credential may do.
 */
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  inputRequired,
  type InputRequiredResult,
} from '@modelcontextprotocol/server';
import { z } from 'zod';
import { httpStatus, type SoftResult } from './soft-results.js';
import { CONFIRMATION_TOKEN_PREFIX } from '../redaction.js';
import { addMcpBreadcrumb } from '../sentry.js';
import { captureMcpEvent } from '../posthog.js';
import {
  CONFIRM_REQUEST_KEY,
  MCP_CREDENTIAL_TYPES,
  type ConfirmationChannel,
  type McpCredentialType,
  type ToolContext,
} from './context.js';
import { logMcpEvent } from '../logging.js';
import { TOOL_REGISTRY, type ToolName } from './registry.js';

/** How long a confirmation token stays valid. */
export const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/** Shorter secrets are treated as missing, so tier C writes fail closed. */
export const MIN_CONFIRMATION_SECRET_LENGTH = 32;

/** The secret to sign with, or undefined when it is unset or too short. */
export function usableConfirmationSecret(
  value: string | undefined,
): string | undefined {
  const secret = value?.trim();
  return secret && secret.length >= MIN_CONFIRMATION_SECRET_LENGTH
    ? secret
    : undefined;
}

/** JSON with object keys sorted at every level and undefined values dropped. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value)) ?? 'null';
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, nested]) => [key, sortKeys(nested)]),
  );
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** A hash of the API credential, so a token works only for the one that asked. */
export function credentialHash(apiToken: string): string {
  return sha256(apiToken);
}

/** A hash of the record fields a write reads or changes. */
export function stateFingerprint(state: unknown): string {
  return sha256(canonicalJson(state));
}

/** Everything a confirmation token is bound to except the record state. */
export interface ConfirmationBinding {
  tool: string;
  /** The tool arguments without confirmation_token. */
  args: Record<string, unknown>;
  accountId: string;
  credentialHash: string;
  /**
   * Which channel carries the token, so a requestState the client echoes
   * never works as a confirmation_token, and the other way round.
   */
  channel: ConfirmationChannel['kind'];
}

function mac(secret: string, parts: unknown[]): string {
  return createHmac('sha256', secret)
    .update(canonicalJson(parts))
    .digest('base64url');
}

/** Stands for the record state inside a token without revealing it. */
function stateTag(secret: string, fingerprint: string): string {
  return mac(secret, [CONFIRMATION_TOKEN_PREFIX, 'state', fingerprint]);
}

/** Signs everything else the token carries or is bound to. */
function tokenMac(
  secret: string,
  binding: ConfirmationBinding,
  expiresAt: number,
  nonce: string,
  state: string,
): string {
  return mac(secret, [
    CONFIRMATION_TOKEN_PREFIX,
    binding.channel,
    binding.tool,
    binding.args,
    binding.accountId,
    binding.credentialHash,
    expiresAt,
    nonce,
    state,
  ]);
}

export interface IssuedConfirmation {
  confirmation_token: string;
  expires_at: string;
}

export function issueConfirmationToken(
  secret: string,
  binding: ConfirmationBinding,
  fingerprint: string,
  now: number = Date.now(),
): IssuedConfirmation {
  const expiresAt = now + CONFIRMATION_TTL_MS;
  // Makes every preview's token unique, so one approval confirms one write.
  const nonce = randomBytes(4).toString('hex');
  const state = stateTag(secret, fingerprint);
  return {
    confirmation_token: [
      CONFIRMATION_TOKEN_PREFIX,
      `${expiresAt.toString(36)}${nonce}`,
      state,
      tokenMac(secret, binding, expiresAt, nonce, state),
    ].join('.'),
    expires_at: new Date(expiresAt).toISOString(),
  };
}

/**
 * Why a token was refused. `malformed`, `mismatch` and `expired` mean the
 * caller must start over. `stale` means the token was right for this call but
 * the record changed after the preview.
 */
export type ConfirmationRejection =
  | 'malformed'
  | 'mismatch'
  | 'expired'
  | 'stale';

export type ConfirmationCheck =
  | { ok: true }
  | { ok: false; reason: ConfirmationRejection };

function sameMac(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const TOKEN_PATTERN = new RegExp(
  `^${CONFIRMATION_TOKEN_PREFIX}\\.([0-9a-z]{1,12})([0-9a-f]{8})\\.([A-Za-z0-9_-]{43})\\.([A-Za-z0-9_-]{43})$`,
);

export function checkConfirmationToken(
  secret: string,
  token: string,
  binding: ConfirmationBinding,
  fingerprint: string,
  now: number = Date.now(),
): ConfirmationCheck {
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return { ok: false, reason: 'malformed' };
  const [, encodedExpiry = '', nonce = '', state = '', signature = ''] = match;
  const expiresAt = Number.parseInt(encodedExpiry, 36);
  // The MAC covers the expiry, the nonce and the state tag, so an edit to any
  // of them is a mismatch, never a stale preview.
  if (!sameMac(signature, tokenMac(secret, binding, expiresAt, nonce, state))) {
    return { ok: false, reason: 'mismatch' };
  }
  if (now >= expiresAt) return { ok: false, reason: 'expired' };
  if (!sameMac(state, stateTag(secret, fingerprint))) {
    return { ok: false, reason: 'stale' };
  }
  return { ok: true };
}

// ==================== Soft results ====================

export type NotPermittedResult = SoftResult<'not_permitted'>;

/** Returned by a tier C tool when the server has no confirmation secret. */
export const CONFIRMATION_NOT_CONFIGURED: NotPermittedResult = {
  error: 'not_permitted',
  message:
    'This Terminal49 MCP server is not set up to confirm changes, so it cannot make this change. Nothing was changed.',
  alternative: 'Make this change in the Terminal49 dashboard.',
};

export interface InvalidConfirmationResult extends SoftResult<'invalid_confirmation'> {
  reason: Exclude<ConfirmationRejection, 'stale'> | 'used';
}

const INVALID_CONFIRMATION_MESSAGES = {
  malformed: 'The confirmation_token is not a token this server issued.',
  mismatch:
    'The confirmation_token was issued for a different call, account or credential.',
  expired: 'The confirmation_token has expired.',
  used: 'The confirmation_token was already used to make this change.',
} satisfies Record<InvalidConfirmationResult['reason'], string>;

const INVALID_REQUEST_STATE_MESSAGES = {
  malformed:
    'The confirmation state the client sent back is not one this server issued.',
  mismatch:
    'The confirmation state the client sent back was issued for a different call, account or credential.',
  expired: 'The confirmation the user gave has expired.',
  used: 'The confirmation the user gave was already used to make this change.',
} satisfies Record<InvalidConfirmationResult['reason'], string>;

export function invalidConfirmation(
  tool: string,
  reason: InvalidConfirmationResult['reason'],
  channel: ConfirmationChannel['kind'] = 'token',
): InvalidConfirmationResult {
  return channel === 'token'
    ? {
        error: 'invalid_confirmation',
        reason,
        message: `${INVALID_CONFIRMATION_MESSAGES[reason]} Nothing was changed.`,
        alternative: `Call ${tool} again with the same arguments and no confirmation_token to get a new preview, and show it to the user.`,
      }
    : {
        error: 'invalid_confirmation',
        reason,
        message: `${INVALID_REQUEST_STATE_MESSAGES[reason]} Nothing was changed.`,
        alternative: `Call ${tool} again with the same arguments. The client will ask the user to confirm the current state.`,
      };
}

export type TokenNotAcceptedResult = SoftResult<'token_not_accepted'>;

/** Returned when a request that can ask the user carries a confirmation_token. */
export function tokenNotAccepted(tool: string): TokenNotAcceptedResult {
  return {
    error: 'token_not_accepted',
    message:
      'This client asks the user to confirm changes itself, so a confirmation_token is not accepted here. Nothing was changed.',
    alternative: `Call ${tool} again with the same arguments and no confirmation_token. The client will show the user the preview and ask them to confirm.`,
  };
}

export interface DeclinedResult {
  status: 'declined';
  message: string;
}

/** Returned when the user did not confirm the preview the client showed. */
export function declined(action: 'decline' | 'cancel'): DeclinedResult {
  return {
    status: 'declined',
    message:
      action === 'decline'
        ? 'The user declined this change. Nothing was changed.'
        : 'The user dismissed the confirmation without answering. Nothing was changed.',
  };
}

export interface ConfirmationRequiredResult<
  Preview,
> extends IssuedConfirmation {
  status: 'confirmation_required';
  message: string;
  preview: Preview;
}

export function confirmationRequired<Preview>(
  tool: string,
  preview: Preview,
  issued: IssuedConfirmation,
): ConfirmationRequiredResult<Preview> {
  return {
    status: 'confirmation_required',
    message: `Nothing was changed. Show this preview to the user. If the user approves it, call ${tool} again with the same arguments and this confirmation_token before expires_at.`,
    preview,
    ...issued,
  };
}

export interface StalePreviewResult<Preview> extends IssuedConfirmation {
  status: 'stale_preview';
  message: string;
  preview: Preview;
}

export function stalePreview<Preview>(
  tool: string,
  preview: Preview,
  issued: IssuedConfirmation,
): StalePreviewResult<Preview> {
  return {
    status: 'stale_preview',
    message: `The record changed after the preview, so nothing was changed. Show this new preview to the user. If the user approves it, call ${tool} again with the new confirmation_token.`,
    preview,
    ...issued,
  };
}

const softResultFields = {
  status: z.string().optional(),
  error: z.string().optional(),
  reason: z.string().optional(),
  message: z.string().optional(),
  alternative: z.string().optional(),
  retry_after_s: z.number().optional(),
};

/**
 * The output schema of a tier A write tool: its own fields plus the
 * soft-result fields. Every field is optional because one schema covers every
 * outcome.
 */
export function writeResultSchema<Fields extends z.ZodRawShape>(
  fields: Fields,
) {
  return z.object({ ...softResultFields, ...fields });
}

/** The output schema of a tier C write tool, with its preview and token. */
export function confirmedWriteResultSchema<Fields extends z.ZodRawShape>(
  preview: z.ZodType,
  fields: Fields,
) {
  return z.object({
    ...softResultFields,
    preview: preview.optional(),
    confirmation_token: z.string().optional(),
    expires_at: z.string().optional(),
    ...fields,
  });
}

export interface WriteRateLimited extends SoftResult<'rate_limited'> {
  /** Seconds Terminal49 asked the caller to wait, when it said. */
  retry_after_s?: number;
}

const retryAfterSchema = z.object({ retryAfterMs: z.number().nonnegative() });

/** Returned when Terminal49 answers a write with 429. */
export function writeRateLimited(error: unknown): WriteRateLimited {
  const parsed = retryAfterSchema.safeParse(error);
  const retryAfterS = parsed.success
    ? Math.ceil(parsed.data.retryAfterMs / 1000)
    : undefined;
  return {
    error: 'rate_limited',
    message:
      'Terminal49 is limiting how often this change can be made. Nothing was changed.',
    alternative:
      retryAfterS === undefined
        ? 'Wait a minute and try again.'
        : `Wait ${retryAfterS} seconds and try again.`,
    ...(retryAfterS === undefined ? {} : { retry_after_s: retryAfterS }),
  };
}

/** The confirmation_token input every tier C tool takes. */
export const confirmationTokenInput = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .optional()
  .describe(
    'Only for a client that cannot ask the user itself: leave this out on the first call to get a preview and a token, and pass the token back only after the user approves that preview in this turn. A client that asks the user itself never needs it.',
  );

// ==================== Audit ====================

export const AUDIT_ENTITY_TYPES = [
  'container',
  'shipment',
  'tracking_request',
  'document',
  'party',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/**
 * `preview` is a tier C call without a token. `execute` is a tier C call
 * with a token, or any tier A call.
 */
export type WritePhase = 'preview' | 'execute';

export interface WriteAuditInput {
  tool: ToolName;
  tier: 'A' | 'C';
  phase: WritePhase;
  /** The result's status or soft-result code, or `error` for a thrown call. */
  outcome: string;
  entityType: AuditEntityType;
  /** Undefined when the call created no record, or failed before it did. */
  entityId: string | undefined;
  accountId: string | undefined;
  credentialType: McpCredentialType;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const writeAuditEventSchema = z.object({
  tool: z
    .enum([...TOOL_REGISTRY.map((tool) => tool.name), 'unknown'])
    .catch('unknown'),
  tier: z.enum(['A', 'C']).catch('C'),
  phase: z.enum(['preview', 'execute']).catch('execute'),
  outcome: z
    .string()
    .regex(/^[A-Za-z][A-Za-z_]{0,39}$/)
    .catch('unknown'),
  entity_type: z.enum([...AUDIT_ENTITY_TYPES, 'unknown']).catch('unknown'),
  entity_id: z.string().regex(UUID).nullable().catch(null),
  account_id: z.string().regex(UUID).nullable().catch(null),
  credential_type: z
    .enum([...MCP_CREDENTIAL_TYPES, 'unknown'])
    .catch('unknown'),
});

export type WriteAuditEvent = z.infer<typeof writeAuditEventSchema>;

/**
 * The audit event for one write call. It is built from named fields only and
 * each value must match its expected form, so values, reference numbers,
 * party names, URLs, tokens and payloads cannot reach a sink through it.
 */
export function buildWriteAuditEvent(input: WriteAuditInput): WriteAuditEvent {
  return writeAuditEventSchema.parse({
    tool: input.tool,
    tier: input.tier,
    phase: input.phase,
    outcome: input.outcome,
    entity_type: input.entityType,
    entity_id: input.entityId,
    account_id: input.accountId ?? null,
    credential_type: input.credentialType,
  });
}

export const WRITE_AUDIT_EVENT = 'mcp.write.audit';

/** Sends the audit event to the log, a Sentry breadcrumb and PostHog. */
export function emitWriteAudit(input: WriteAuditInput): void {
  const audit = buildWriteAuditEvent(input);
  // logMcpEvent redacts every *_id key, and this event needs the entity and
  // account ids, which the schema above has already checked are UUIDs.
  console.error(
    JSON.stringify({
      event: WRITE_AUDIT_EVENT,
      ...audit,
      timestamp: new Date().toISOString(),
    }),
  );
  addMcpBreadcrumb(WRITE_AUDIT_EVENT, audit);
  if (audit.account_id) {
    captureMcpEvent('mcp_write', audit.account_id, audit);
  }
}

/** The audit outcome for a result: its status, else its soft-result code. */
export function auditOutcome(result: unknown): string {
  const parsed = z
    .object({ status: z.string() })
    .or(z.object({ error: z.string() }))
    .safeParse(result);
  if (!parsed.success) return 'done';
  return 'status' in parsed.data ? parsed.data.status : parsed.data.error;
}

// ==================== Write flows ====================

export interface WriteTarget {
  tool: ToolName;
  entityType: AuditEntityType;
  entityId: string | undefined;
}

/** How long an audit waits for /me before naming no account. */
const AUDIT_ACCOUNT_DEADLINE_MS = 2_000;

/**
 * The account an audit event names. The lookup can call /me, and a failed or
 * slow lookup leaves the account out rather than holding up the write.
 */
async function auditAccountId(
  context: ToolContext,
): Promise<string | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, AUDIT_ACCOUNT_DEADLINE_MS, undefined);
  });
  try {
    return await Promise.race([
      context.accountId().catch(() => undefined),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function auditor(context: ToolContext, target: WriteTarget, tier: 'A' | 'C') {
  return async (
    phase: WritePhase,
    outcome: string,
    entityId = target.entityId,
  ) =>
    emitWriteAudit({
      ...target,
      entityId,
      tier,
      phase,
      outcome,
      accountId: await auditAccountId(context),
      credentialType: context.credentialType,
    });
}

/** The audit outcome and record of a tier A write, read from its result. */
export interface WriteAuditSummary {
  outcome: string;
  entityId?: string;
}

/**
 * Audits a write that threw. A 429 from any of its requests, reads included,
 * becomes the rate_limited soft result; anything else is rethrown.
 */
async function failedWrite(
  error: unknown,
  audit: (outcome: string) => Promise<void>,
): Promise<WriteRateLimited> {
  if (httpStatus(error) === 429) {
    await audit('rate_limited');
    return writeRateLimited(error);
  }
  await audit('error');
  throw error;
}

/**
 * Runs a tier A write and emits its audit event. `summarize` reads the
 * outcome and record from the result, for a write whose record id is known
 * only after it runs.
 */
export async function runWrite<Result>(
  context: ToolContext,
  target: WriteTarget,
  run: () => Promise<Result>,
  summarize: (result: Result) => WriteAuditSummary = (result) => ({
    outcome: auditOutcome(result),
  }),
): Promise<Result | WriteRateLimited> {
  const audit = auditor(context, target, 'A');
  try {
    const result = await run();
    const summary = summarize(result);
    await audit(
      'execute',
      summary.outcome,
      summary.entityId ?? target.entityId,
    );
    return result;
  } catch (error) {
    return failedWrite(error, (outcome) => audit('execute', outcome));
  }
}

/**
 * Audits a record a tier A write created on the way to its own change, as a
 * separate event, so the record stays traceable whatever the write's outcome.
 */
export async function auditCreatedRecord(
  context: ToolContext,
  target: WriteTarget,
): Promise<void> {
  await auditor(context, target, 'A')('execute', 'created');
}

/** What a tier C read found: a reason to stop, or the state to confirm. */
export type ConfirmedWriteRead<Preview, Stop> =
  | { stop: Stop }
  | {
      /** The exact fields the write reads or changes. */
      state: unknown;
      preview: Preview;
    };

export interface ConfirmedWrite<Preview, Stop, Done> extends WriteTarget {
  /** The tool arguments, with confirmation_token when the caller sent one. */
  args: Record<string, unknown> & { confirmation_token?: string };
  /** Reads the record. Called on every call, before any token is checked. */
  read(): Promise<ConfirmedWriteRead<Preview, Stop>>;
  /**
   * Changes the record. Called only with a token that matches, and given the
   * preview of the state the token was checked against. A 4xx it throws
   * goes to `refused`, not caught here, so the kit releases the token first.
   */
  write(preview: Preview): Promise<Done>;
  /**
   * The result for a 4xx the write threw, after the token is released. A
   * 4xx means Terminal49 changed nothing. Undefined lets the error fail the
   * call.
   */
  refused?(error: unknown, preview: Preview): Promise<Done | undefined>;
}

export type ConfirmedWriteResult<Preview, Stop, Done> =
  | Stop
  | Done
  | ConfirmationRequiredResult<Preview>
  | StalePreviewResult<Preview>
  | InvalidConfirmationResult
  | NotPermittedResult
  | WriteRateLimited
  | InputRequiredResult
  | DeclinedResult
  | TokenNotAcceptedResult;

const previewTextSchema = z
  .object({ reach: z.string().optional() })
  .passthrough();

/**
 * The preview as text for the confirmation dialog: what the change reaches,
 * then each preview field, so the user sees the record now and after.
 */
export function describeChange(
  target: WriteTarget,
  preview: unknown,
  note?: string,
): string {
  const { reach, ...fields } = previewTextSchema.parse(preview);
  const lines = [
    ...(note ? [note] : []),
    `${target.tool} on ${target.entityType} ${target.entityId ?? ''}`.trim(),
    ...(reach ? [reach] : []),
    ...Object.entries(fields).map(
      ([key, value]) => `${key}: ${canonicalJson(value)}`,
    ),
  ];
  return lines.join('\n');
}

/** Asks the client to show the preview and get the user's yes or no. */
function elicitConfirmation(
  target: WriteTarget,
  preview: unknown,
  issued: IssuedConfirmation,
  note?: string,
): InputRequiredResult {
  return inputRequired({
    inputRequests: {
      [CONFIRM_REQUEST_KEY]: inputRequired.elicit({
        message: describeChange(target, preview, note),
        requestedSchema: {
          type: 'object',
          properties: {
            confirm: {
              type: 'boolean',
              title: 'Confirm',
              description: 'Make this change',
            },
          },
          required: ['confirm'],
        },
      }),
    },
    requestState: issued.confirmation_token,
  });
}

/**
 * Tokens that confirmed a write, kept until they expire. A token is reserved
 * before its write runs, so two concurrent calls cannot both use it. A token is
 * bound to the record's state, and a tier A inverse such as
 * resume_shipment_tracking can restore that state, so without this one
 * approval could confirm the same write twice. It lives in process memory, so
 * on a multi-instance deployment another instance can still accept the token
 * once more before it expires.
 */
const spentTokens = new Map<string, number>();

/** Marks a token used. False when it already confirmed a write. */
function spendToken(token: string, now: number = Date.now()): boolean {
  for (const [spent, expiresAt] of spentTokens) {
    if (expiresAt <= now) spentTokens.delete(spent);
  }
  if (spentTokens.has(token)) return false;
  spentTokens.set(token, now + CONFIRMATION_TTL_MS);
  return true;
}

const RECORD_CHANGED_NOTE =
  'The record changed after you last saw it. Here is its current state.';

/**
 * Runs a tier C write. The first call never writes: it reads the record and
 * either asks the client to confirm the preview with the user (a request that
 * declares form elicitation) or returns the preview with a token for the
 * model to pass back. The write runs only when the confirmation that comes
 * back matches this call and the record has not changed since the preview.
 */
export async function runConfirmedWrite<Preview, Stop, Done>(
  context: ToolContext,
  plan: ConfirmedWrite<Preview, Stop, Done>,
): Promise<ConfirmedWriteResult<Preview, Stop, Done>> {
  const audit = auditor(context, plan, 'C');
  const { confirmation_token: token, ...args } = plan.args;
  const channel = context.confirmation;
  const confirming =
    channel.kind === 'token'
      ? token !== undefined
      : channel.requestState !== undefined;
  const phase: WritePhase = confirming ? 'execute' : 'preview';
  const secret = context.confirmationSecret;
  if (!secret) {
    logMcpEvent({
      event: 'mcp.config.error',
      error: 'ConfirmationSecretMissing',
      reason:
        'T49_MCP_CONFIRMATION_SECRET is unset or shorter than 32 characters, so tier C writes are refused.',
      tool: plan.tool,
      timestamp: new Date().toISOString(),
    });
    await audit(phase, CONFIRMATION_NOT_CONFIGURED.error);
    return { ...CONFIRMATION_NOT_CONFIGURED };
  }
  if (channel.kind === 'elicitation' && token !== undefined) {
    await audit('execute', 'token_not_accepted');
    return tokenNotAccepted(plan.tool);
  }
  // A no ends the call whatever the confirmation's state: it writes nothing,
  // so there is no preview to keep fresh and no token to spend.
  const answer = channel.kind === 'elicitation' ? channel.answer : undefined;
  if (answer && !(answer.action === 'accept' && answer.confirm)) {
    await audit(phase, 'declined');
    return declined(answer.action === 'cancel' ? 'cancel' : 'decline');
  }

  try {
    const read = await plan.read();
    if ('stop' in read) {
      await audit(phase, auditOutcome(read.stop));
      return read.stop;
    }
    const binding: ConfirmationBinding = {
      tool: plan.tool,
      args,
      accountId: await context.accountId(),
      credentialHash: await context.credentialKey(),
      channel: channel.kind,
    };
    const fingerprint = stateFingerprint(read.state);
    const issue = () => issueConfirmationToken(secret, binding, fingerprint);

    if (channel.kind === 'token') {
      if (!token) {
        await audit(phase, 'confirmation_required');
        return confirmationRequired(plan.tool, read.preview, issue());
      }
      const check = checkConfirmationToken(secret, token, binding, fingerprint);
      if (!check.ok) {
        if (check.reason === 'stale') {
          await audit(phase, 'stale_preview');
          return stalePreview(plan.tool, read.preview, issue());
        }
        await audit(phase, 'invalid_confirmation');
        return invalidConfirmation(plan.tool, check.reason);
      }
    } else {
      if (channel.requestState === undefined) {
        await audit(phase, 'elicitation_required');
        return elicitConfirmation(plan, read.preview, issue());
      }
      const check = checkConfirmationToken(
        secret,
        channel.requestState,
        binding,
        fingerprint,
      );
      if (!check.ok) {
        if (check.reason === 'stale') {
          await audit(phase, 'stale_preview');
          return elicitConfirmation(
            plan,
            read.preview,
            issue(),
            RECORD_CHANGED_NOTE,
          );
        }
        await audit(phase, 'invalid_confirmation');
        return invalidConfirmation(plan.tool, check.reason, 'elicitation');
      }
      if (answer === undefined) {
        await audit(phase, 'elicitation_required');
        return elicitConfirmation(plan, read.preview, issue());
      }
    }

    const confirmation =
      channel.kind === 'token' ? token : channel.requestState;
    if (confirmation && !spendToken(confirmation)) {
      await audit(phase, 'invalid_confirmation');
      return invalidConfirmation(plan.tool, 'used', channel.kind);
    }
    let done: Done;
    try {
      done = await plan.write(read.preview);
    } catch (error) {
      // A 4xx means Terminal49 refused the request and changed nothing, so
      // the approval still stands. A 5xx or a lost response may hide a write.
      const status = httpStatus(error);
      if (status === undefined || status < 400 || status >= 500) throw error;
      if (confirmation) spentTokens.delete(confirmation);
      const answer = await plan.refused?.(error, read.preview);
      if (answer === undefined) throw error;
      done = answer;
    }
    await audit(phase, auditOutcome(done));
    return done;
  } catch (error) {
    return failedWrite(error, (outcome) => audit(phase, outcome));
  }
}
