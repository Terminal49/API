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
}

/** State shared by everything one tool call does. */
export interface ToolContext extends ToolSession {
  /** GET /me, fetched at most once per tool call. */
  me(): Promise<CurrentCredential>;
}

export function createToolContext(
  client: Pick<Terminal49Client, 'me'>,
  session: ToolSession,
): ToolContext {
  let me: Promise<CurrentCredential> | undefined;
  return {
    ...session,
    me() {
      // SAFETY: `format: 'mapped'` makes the SDK return mapCurrentCredential's result.
      me ??= client.me({ format: 'mapped' }) as Promise<CurrentCredential>;
      return me;
    },
  };
}
