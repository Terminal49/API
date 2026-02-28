/**
 * Creates a Terminal49Client instance from CLI flags, environment
 * variables, and config file — in that priority order.
 *
 * Token resolution:
 *   1. --token flag
 *   2. T49_API_TOKEN env var
 *   3. ~/.config/terminal49/config.json
 *   4. Throw AUTH_MISSING error
 */

import {
  AuthenticationError,
  Terminal49Client,
  type ResponseFormat,
} from '@terminal49/sdk';
import { loadConfig } from './config';

export interface CliGlobalOptions {
  token?: string;
  baseUrl?: string;
  format?: 'raw' | 'mapped' | 'both';
  maxRetries?: number;
  authScheme?: 'Token' | 'Bearer';
}

export async function createClient(
  opts: CliGlobalOptions = {},
): Promise<Terminal49Client> {
  const cfg = await loadConfig();
  const token = opts.token?.trim() || process.env.T49_API_TOKEN || cfg.token;
  if (!token || token.trim() === '') {
    throw new AuthenticationError('Missing authentication token. Set --token, T49_API_TOKEN, or config token.');
  }
  const resolveAuthScheme = (
    value: string | undefined,
  ): 'Token' | 'Bearer' | undefined => {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    return normalized === 'bearer' ? 'Bearer' : 'Token';
  };
  const authScheme = resolveAuthScheme(opts.authScheme)
    || resolveAuthScheme(process.env.T49_AUTH_SCHEME)
    || resolveAuthScheme(cfg.authScheme)
    || (token.match(/^(Token|Bearer)\s+/i)?.[0]?.trim().toLowerCase() === 'bearer'
      ? 'Bearer'
      : undefined);

  return new Terminal49Client({
    apiToken: token,
    apiBaseUrl: opts.baseUrl?.trim() || cfg.baseUrl,
    maxRetries: opts.maxRetries ?? cfg.maxRetries,
    defaultFormat: (opts.format as ResponseFormat) ?? cfg.defaultFormat ?? 'raw',
    authScheme,
  });
}
