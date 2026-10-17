import type { CurrentCredential, Terminal49Client } from '@terminal49/sdk';

/**
 * How the caller authenticated. `shared_token` is the gateway's env-token
 * mode, where every caller shares one T49_API_TOKEN.
 */
export type McpCredentialType = 'user' | 'api_key' | 'agent' | 'shared_token';

/** State shared by everything one tool call does. */
export interface ToolContext {
  credentialType: McpCredentialType;
  /** GET /me, fetched at most once per tool call. */
  me(): Promise<CurrentCredential>;
}

export function createToolContext(
  client: Pick<Terminal49Client, 'me'>,
  credentialType: McpCredentialType,
): ToolContext {
  let me: Promise<CurrentCredential> | undefined;
  return {
    credentialType,
    me() {
      // SAFETY: `format: 'mapped'` makes the SDK return mapCurrentCredential's result.
      me ??= client.me({ format: 'mapped' }) as Promise<CurrentCredential>;
      return me;
    },
  };
}
