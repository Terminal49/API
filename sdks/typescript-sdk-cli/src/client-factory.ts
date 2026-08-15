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
  type ResponseFormat,
  Terminal49Client,
} from '@terminal49/sdk';
import { type CliConfig, loadConfig } from './config.js';

export interface CliGlobalOptions {
  token?: string;
  baseUrl?: string;
  format?: 'raw' | 'mapped' | 'both';
  maxRetries?: number;
  accountId?: string;
  timeoutMs?: number;
}

let configPromise: Promise<CliConfig> | undefined;

function configOnce(): Promise<CliConfig> {
  configPromise ??= loadConfig();
  return configPromise;
}

export async function createClient(
  opts: CliGlobalOptions = {},
): Promise<Terminal49Client> {
  const cfg = await configOnce();
  const format = opts.format ?? cfg.defaultFormat ?? 'mapped';
  const token = opts.token ?? process.env.T49_API_TOKEN ?? cfg.token;
  const baseUrl = opts.baseUrl ?? process.env.T49_API_BASE_URL ?? cfg.baseUrl;
  const maxRetries = opts.maxRetries ?? cfg.maxRetries;
  const accountId =
    opts.accountId ?? process.env.T49_ACCOUNT_ID ?? cfg.accountId;
  const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;

  if (!token || token.trim() === '') {
    throw new AuthenticationError(
      'Missing authentication token. Set --token, T49_API_TOKEN, or config token.',
    );
  }

  return new Terminal49Client({
    apiToken: token,
    apiBaseUrl: baseUrl,
    maxRetries,
    accountId,
    timeoutMs,
    defaultFormat: format as ResponseFormat,
  });
}
