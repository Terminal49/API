/**
 * t49 config <action>
 *
 * Subcommands: set, get, list, path
 *
 * Manages persistent configuration in ~/.config/terminal49/config.json
 */

import { Command, InvalidArgumentError } from 'commander';
import { createClient } from '../client-factory.js';
import { getConfigPath, loadConfig, resetConfig, type CliConfig, writeConfig } from '../config.js';
import { withErrorHandling } from '../errors.js';
import { createFormatter } from '../output/formatter.js';

type ConfigOutput = Record<string, unknown>;
type ConfigKey = (typeof CONFIG_KEYS)[number];
type RevealOptions = {
  reveal?: boolean;
};

const CONFIG_KEYS = [
  'token',
  'baseUrl',
  'defaultFormat',
  'maxRetries',
  'accountId',
  'timeoutMs',
] as const;
const NUMERIC_CONFIG_KEYS = new Set<ConfigKey>(['maxRetries', 'timeoutMs']);
const FORMAT_VALUES = new Set(['raw', 'mapped', 'both']);

export function registerConfigCommand(program: Command): void {
  const cmd = program.command('config').description('View and manage CLI config');

  cmd
    .command('path')
    .description('Print path to config file')
    .action(
      withErrorHandling('config.path', async (_options: unknown, command: Command) => {
        const global = command.optsWithGlobals();
        const formatter = createFormatter({
          json: global.json,
          compact: global.compact,
        });
        formatter.output('config.path', { path: getConfigPath() });
      }),
    );

  cmd
    .command('get <key>')
    .description('Read config value')
    .option('--reveal', 'Reveal sensitive values such as token')
    .action(
      withErrorHandling(
        'config.get',
        async (key: string, options: RevealOptions, command: Command) => {
          const configKey = validateConfigKey(key);
          const config = await loadConfig();
          const value = redactConfigValue(configKey, config[configKey], options.reveal);
          const formatter = createFormatter({
            json: command.optsWithGlobals().json,
            compact: command.optsWithGlobals().compact,
          });
          formatter.output('config.get', { key, value } as ConfigOutput);
        },
      ),
    );

  cmd
    .command('set <key> <value>')
    .description('Set a config value')
    .action(
      withErrorHandling(
        'config.set',
        async (key: string, value: string, _options: unknown, command: Command) => {
          const configKey = validateConfigKey(key);
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: global.json,
            compact: global.compact,
          });
          const parsed = parseConfigValue(configKey, value);
          const next = await writeConfig({
            [configKey]: parsed,
          } as Partial<CliConfig>);
          formatter.output('config.set', redactConfig(next));
        },
      ),
    );

  cmd
    .command('list')
    .description('List all config values')
    .option('--reveal', 'Reveal sensitive values such as token')
    .action(
      withErrorHandling('config.list', async (options: RevealOptions, command: Command) => {
        const global = command.optsWithGlobals();
        const formatter = createFormatter({
          json: global.json,
          compact: global.compact,
        });
        const cfg = await loadConfig();
        formatter.output('config.list', redactConfig(cfg, options.reveal));
      }),
    );

  cmd
    .command('clear')
    .description('Clear config values by deleting the file')
    .action(
      withErrorHandling('config.clear', async (_options: unknown, command: Command) => {
        const global = command.optsWithGlobals();
        const formatter = createFormatter({
          json: global.json,
          compact: global.compact,
        });
        await resetConfig();
        formatter.output('config.clear', { removed: true });
      }),
    );

  cmd
    .command('auth-status')
    .description('Check whether the CLI has usable auth credentials')
    .action(
      withErrorHandling('config.auth-status', async (_options: unknown, command: Command) => {
        const global = command.optsWithGlobals();
        const formatter = createFormatter({
          json: global.json,
          compact: global.compact,
        });
        const cfg = await loadConfig();
        const status = {
          hasToken: Boolean(global.token || process.env.T49_API_TOKEN || cfg.token),
          tokenSource: global.token
            ? 'flag'
            : process.env.T49_API_TOKEN
              ? 'env'
              : cfg.token
                ? 'config'
                : 'missing',
        };
        formatter.output('config.auth-status', status);
      }),
    );

  cmd
    .command('client-check')
    .description('Verify client can be instantiated')
    .action(
      withErrorHandling('config.client-check', async (_options: unknown, command: Command) => {
        const global = command.optsWithGlobals();
        const formatter = createFormatter({
          json: global.json,
          compact: global.compact,
        });
        await createClient({
          token: global.token,
          baseUrl: global.baseUrl,
          format: global.format as 'raw' | 'mapped' | 'both',
          maxRetries: global.maxRetries,
          accountId: global.accountId,
          timeoutMs: global.timeoutMs ?? global.timeout,
        });
        formatter.output('config.client-check', { ok: true });
      }),
    );
}

function validateConfigKey(key: string): ConfigKey {
  if (CONFIG_KEYS.includes(key as ConfigKey)) return key as ConfigKey;
  throw new InvalidArgumentError(
    `Unknown config key "${key}". Valid keys: ${CONFIG_KEYS.join(', ')}`,
  );
}

function parseConfigValue(key: ConfigKey, value: string): string | number {
  if (NUMERIC_CONFIG_KEYS.has(key)) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
      throw new InvalidArgumentError(`${key} must be a non-negative integer`);
    }
    return parsed;
  }

  if (key === 'defaultFormat' && !FORMAT_VALUES.has(value)) {
    throw new InvalidArgumentError('defaultFormat must be one of raw, mapped, both');
  }

  return value;
}

function redactConfig(config: CliConfig, reveal = false): ConfigOutput {
  const output: ConfigOutput = {};
  for (const key of CONFIG_KEYS) {
    const value = config[key];
    if (value !== undefined) output[key] = redactConfigValue(key, value, reveal);
  }
  return output;
}

function redactConfigValue(key: ConfigKey, value: unknown, reveal = false): unknown {
  if (key !== 'token' || reveal || typeof value !== 'string') return value;
  if (value.length <= 4) return '***';
  const suffix = value.slice(-4);
  return value.startsWith('tok_') ? `tok_...${suffix}` : `***${suffix}`;
}
