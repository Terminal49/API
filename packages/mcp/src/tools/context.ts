import { createHash } from 'node:crypto';
import { CLIENT_CAPABILITIES_META_KEY } from '@modelcontextprotocol/server';
import type { CurrentCredential, Terminal49Client } from '@terminal49/sdk';
import { z } from 'zod';
import type { Toolset } from './registry.js';

/**
 * How the caller authenticated. `shared_token` is the gateway's env-token
 * mode, where every caller shares one T49_API_TOKEN.
 */
export const MCP_CREDENTIAL_TYPES = [
  'user',
  'api_key',
  'agent',
  'shared_token',
] as const;

export type McpCredentialType = (typeof MCP_CREDENTIAL_TYPES)[number];

/** What one MCP session serves, fixed when its server is created. */
export interface ToolSession {
  credentialType: McpCredentialType;
  /** The toolsets after the operator allowlist and any request header. */
  toolsets: readonly Toolset[];
  /** Whether any registered tool can change account data. */
  writeToolsAvailable: boolean;
  /** sha256 of the API token the session calls Terminal49 with. */
  credentialHash: string;
  /** Signs confirmation tokens. Undefined when the server has no usable secret. */
  confirmationSecret?: string;
  /** The account the gateway resolved for the credential, when it resolved one. */
  gatewayAccountId?: string;
  /**
   * Epoch ms by which a batch write stops waiting on records. The HTTP
   * gateway sets it from the request start so sign-in time counts against
   * the function limit; without it each call budgets from its own start.
   */
  writeDeadlineAt?: number;
}

/** What the user answered when the client asked them to confirm a preview. */
export type ElicitationAnswer =
  | { action: 'accept'; confirm: boolean }
  | { action: 'decline' }
  | { action: 'cancel' };

/**
 * How a tier C call gets the user's approval of its preview. A request that
 * declares form elicitation (the 2026-07-28 `_meta` envelope) lets the client
 * ask the user itself, so the model never handles a confirmation token. Any
 * other request gets the preview and a token to pass back.
 */
export type ConfirmationChannel =
  | { kind: 'token' }
  | {
      kind: 'elicitation';
      /** The requestState the client echoed from the previous round. */
      requestState: string | undefined;
      /** The client's answer to the confirm request, on a retried call. */
      answer: ElicitationAnswer | undefined;
    };

/** The key of the one input request a tier C tool embeds. */
export const CONFIRM_REQUEST_KEY = 'confirm';

/** A bare `elicitation: {}` declares form mode, as the SDK reads it. */
const formElicitationSchema = z.object({
  elicitation: z
    .object({ form: z.unknown().optional(), url: z.unknown().optional() })
    .refine((modes) => modes.form !== undefined || modes.url === undefined),
});

const answerSchema = z.union([
  z.object({
    action: z.literal('accept'),
    content: z.object({ confirm: z.boolean().catch(false) }).catch({
      confirm: false,
    }),
  }),
  z.object({ action: z.literal('decline') }),
  z.object({ action: z.literal('cancel') }),
]);

/** The parts of the MCP request context a confirmation channel is read from. */
export interface ConfirmationRequest {
  envelope?: Record<string, unknown>;
  inputResponses?: Record<string, unknown>;
  requestState: <T = unknown>() => T | undefined;
}

/**
 * Reads the confirmation channel of one request from its MCP context. A
 * request with no context, or no 2026-07-28 envelope, uses the token channel.
 */
export function confirmationChannel(
  request: Partial<ConfirmationRequest> | undefined,
): ConfirmationChannel {
  const capabilities = request?.envelope?.[CLIENT_CAPABILITIES_META_KEY];
  if (!request || !formElicitationSchema.safeParse(capabilities).success) {
    return { kind: 'token' };
  }
  const state = request.requestState?.();
  const answer = answerSchema.safeParse(
    request.inputResponses?.[CONFIRM_REQUEST_KEY],
  );
  return {
    kind: 'elicitation',
    requestState: typeof state === 'string' ? state : undefined,
    answer: answer.success
      ? answer.data.action === 'accept'
        ? { action: 'accept', confirm: answer.data.content.confirm }
        : { action: answer.data.action }
      : undefined,
  };
}

/** State shared by everything one tool call does. */
export interface ToolContext extends ToolSession {
  /** How this call gets the user's approval of a tier C preview. */
  confirmation: ConfirmationChannel;
  /** GET /me, fetched at most once per tool call. */
  me(): Promise<CurrentCredential>;
  /** The account this call acts on: the gateway's, else the one /me names. */
  accountId(): Promise<string>;
  /**
   * The credential confirmation tokens are bound to. A user or agent session
   * uses the credential /me names, because the gateway can call Terminal49
   * with a new bearer token on every request. Other sessions use the API
   * token hash.
   */
  credentialKey(): Promise<string>;
}

export function createToolContext(
  client: Pick<Terminal49Client, 'me'>,
  session: ToolSession,
  confirmation: ConfirmationChannel = { kind: 'token' },
): ToolContext {
  let me: Promise<CurrentCredential> | undefined;
  const context: ToolContext = {
    ...session,
    confirmation,
    me() {
      // SAFETY: `format: 'mapped'` makes the SDK return mapCurrentCredential's result.
      me ??= client.me({ format: 'mapped' }) as Promise<CurrentCredential>;
      return me;
    },
    async accountId() {
      return session.gatewayAccountId ?? (await context.me()).account.id;
    },
    async credentialKey() {
      if (
        session.credentialType === 'api_key' ||
        session.credentialType === 'shared_token'
      ) {
        return session.credentialHash;
      }
      const { kind, id } = await context.me();
      return createHash('sha256').update(`${kind}:${id}`).digest('hex');
    },
  };
  return context;
}
