/**
 * Shared pieces for tools that change account data: the confirmation token
 * that tier C writes need, and the soft results those writes return.
 *
 * A tier C tool called without a token changes nothing. It reads the record
 * and returns a preview with a token. The token is an HMAC over the tool, its
 * arguments, the account, the credential, an expiry and a fingerprint of the
 * record state the preview showed. The write runs only when a later call
 * brings back a token that still matches all of them.
 *
 * The token proves that a preview of the current state was produced. It is not
 * a security boundary: a model can make both calls itself. The backend still
 * decides what the credential may do.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { SoftResult } from './soft-results.js';
import { CONFIRMATION_TOKEN_PREFIX } from '../redaction.js';
import { addMcpBreadcrumb } from '../sentry.js';
import { captureMcpEvent } from '../posthog.js';
import { MCP_CREDENTIAL_TYPES, type McpCredentialType } from './context.js';
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
  state: string,
): string {
  return mac(secret, [
    CONFIRMATION_TOKEN_PREFIX,
    binding.tool,
    binding.args,
    binding.accountId,
    binding.credentialHash,
    expiresAt,
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
  const state = stateTag(secret, fingerprint);
  return {
    confirmation_token: [
      CONFIRMATION_TOKEN_PREFIX,
      expiresAt.toString(36),
      state,
      tokenMac(secret, binding, expiresAt, state),
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
  `^${CONFIRMATION_TOKEN_PREFIX}\\.([0-9a-z]{1,12})\\.([A-Za-z0-9_-]{43})\\.([A-Za-z0-9_-]{43})$`,
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
  const [, encodedExpiry = '', state = '', signature = ''] = match;
  const expiresAt = Number.parseInt(encodedExpiry, 36);
  // The MAC covers the expiry and the state tag, so an edit to either is a
  // mismatch, never a stale preview.
  if (!sameMac(signature, tokenMac(secret, binding, expiresAt, state))) {
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
  reason: Exclude<ConfirmationRejection, 'stale'>;
}

const INVALID_CONFIRMATION_MESSAGES = {
  malformed: 'The confirmation_token is not a token this server issued.',
  mismatch:
    'The confirmation_token was issued for a different call, account or credential.',
  expired: 'The confirmation_token has expired.',
} satisfies Record<InvalidConfirmationResult['reason'], string>;

export function invalidConfirmation(
  tool: string,
  reason: InvalidConfirmationResult['reason'],
): InvalidConfirmationResult {
  return {
    error: 'invalid_confirmation',
    reason,
    message: `${INVALID_CONFIRMATION_MESSAGES[reason]} Nothing was changed.`,
    alternative: `Call ${tool} again with the same arguments and no confirmation_token to get a new preview, and show it to the user.`,
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

/** The confirmation_token input every tier C tool takes. */
export const confirmationTokenInput = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .optional()
  .describe(
    'Leave this out on the first call to get a preview and a token. Pass the token back only after the user approves that preview in this turn.',
  );

// ==================== Audit ====================

export const AUDIT_ENTITY_TYPES = [
  'container',
  'shipment',
  'tracking_request',
  'document',
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
  entityId: string;
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
