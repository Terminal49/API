import { createHash } from 'node:crypto';
import type { CurrentCredential, Terminal49Client } from '@terminal49/sdk';
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
}

/** State shared by everything one tool call does. */
export interface ToolContext extends ToolSession {
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
): ToolContext {
  let me: Promise<CurrentCredential> | undefined;
  const context: ToolContext = {
    ...session,
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
