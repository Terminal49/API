/**
 * t49 config <action>
 *
 * Subcommands: set, get, list, path
 *
 * Manages persistent configuration in ~/.config/terminal49/config.json
 */

import { Command } from 'commander';
import { createFormatter } from '../output/formatter.js';
import { createClient } from '../client-factory.js';
import { loadConfig, writeConfig, getConfigPath, resetConfig } from '../config.js';
import { withErrorHandling } from '../errors.js';

type ConfigOutput = Record<string, unknown>;

export function registerConfigCommand(program: Command): void {
  const cmd = program.command('config').description('View and manage CLI config');

  cmd
    .command('path')
    .description('Print path to config file')
    .action(() => {
      process.stdout.write(`${getConfigPath()}\n`);
    });

  cmd
    .command('get <key>')
    .description('Read config value')
    .action(
      withErrorHandling(
        'config.get',
        async (key: string, _options: unknown, command: Command) => {
          const config = await loadConfig();
          const value = config[key as keyof typeof config];
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
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: global.json,
            compact: global.compact,
          });
          const parsed = parseValue(value);
          const next = await writeConfig({ [key]: parsed } as Partial<ConfigOutput>);
          formatter.output('config.set', next);
        },
      ),
    );

  cmd
    .command('list')
    .description('List all config values')
    .action(
      withErrorHandling(
        'config.list',
        async (command: Command) => {
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: global.json,
            compact: global.compact,
          });
          const cfg = await loadConfig();
          formatter.output('config.list', cfg);
        },
      ),
    );

  cmd
    .command('clear')
    .description('Clear config values by deleting the file')
    .action(
      withErrorHandling(
        'config.clear',
        async (command: Command) => {
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: global.json,
            compact: global.compact,
          });
          await resetConfig();
          formatter.output('config.clear', { removed: true });
        },
      ),
    );

  cmd
    .command('auth-status')
    .description('Check whether the CLI has usable auth credentials')
    .action(
      withErrorHandling(
        'config.auth-status',
        async (command: Command) => {
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
        },
      ),
    );

  cmd
    .command('client-check')
    .description('Verify client can be instantiated')
    .action(
      withErrorHandling(
        'config.client-check',
        async (command: Command) => {
          const global = command.optsWithGlobals();
          const formatter = createFormatter({
            json: global.json,
            compact: global.compact,
          });
          await createClient({
            token: global.token,
            baseUrl: global.baseUrl,
            format: global.format as 'raw' | 'mapped' | 'both',
          });
          formatter.output('config.client-check', { ok: true });
        },
      ),
    );
}

function parseValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numberValue = Number(value);
  if (!Number.isNaN(numberValue) && value.trim() !== '') return numberValue;
  return value;
}
