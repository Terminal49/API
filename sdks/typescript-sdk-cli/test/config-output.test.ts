import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram } from './helpers.js';

let configHome: string;

beforeEach(() => {
  configHome = mkdtempSync(join(tmpdir(), 't49-cli-config-'));
  mkdirSync(join(configHome, 'terminal49'));
  writeFileSync(
    join(configHome, 'terminal49', 'config.json'),
    JSON.stringify({ baseUrl: 'https://api.test/v2', maxRetries: 2 }),
  );
  process.env.XDG_CONFIG_HOME = configHome;
  process.env.T49_API_TOKEN = 'tok_abcdef123456';
});
afterEach(resetApiStub);

describe('config and commands output flags', () => {
  it('config auth-status --table prints a table to a pipe', async () => {
    const result = await runProgram(['--table', 'config', 'auth-status']);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        '┌─────────────┬──────┐',
        '│ hasToken    │ true │',
        '├─────────────┼──────┤',
        '│ tokenSource │ env  │',
        '└─────────────┴──────┘',
        '',
      ].join('\n'),
    );
  });

  it('config list --table prints each config value as a row', async () => {
    const result = await runProgram(['--table', 'config', 'list']);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [
        '┌────────────┬─────────────────────┐',
        '│ baseUrl    │ https://api.test/v2 │',
        '├────────────┼─────────────────────┤',
        '│ maxRetries │ 2                   │',
        '└────────────┴─────────────────────┘',
        '',
      ].join('\n'),
    );
  });

  it.each([
    [
      ['config', 'get', 'maxRetries'],
      [
        '┌───────┬────────────┐',
        '│ key   │ maxRetries │',
        '├───────┼────────────┤',
        '│ value │ 2          │',
        '└───────┴────────────┘',
      ],
    ],
    [
      ['config', 'set', 'maxRetries', '3'],
      [
        '┌────────────┬─────────────────────┐',
        '│ baseUrl    │ https://api.test/v2 │',
        '├────────────┼─────────────────────┤',
        '│ maxRetries │ 3                   │',
        '└────────────┴─────────────────────┘',
      ],
    ],
    [
      ['config', 'client-check'],
      ['┌────┬──────┐', '│ ok │ true │', '└────┴──────┘'],
    ],
    [
      ['config', 'clear'],
      ['┌─────────┬──────┐', '│ removed │ true │', '└─────────┴──────┘'],
    ],
  ])('%j --table prints key and value rows', async (args, table) => {
    const result = await runProgram(['--table', ...args]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe([...table, ''].join('\n'));
  });

  it('config path --table prints the config file path as a row', async () => {
    const path = join(configHome, 'terminal49', 'config.json');
    const bar = '─'.repeat(path.length + 2);

    const result = await runProgram(['--table', 'config', 'path']);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      [`┌──────┬${bar}┐`, `│ path │ ${path} │`, `└──────┴${bar}┘`, ''].join(
        '\n',
      ),
    );
  });

  it('config set --fields projects the JSON output', async () => {
    const result = await runProgram([
      '--json',
      '--fields',
      'maxRetries',
      'config',
      'set',
      'maxRetries',
      '3',
    ]);

    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: 'config.set',
      data: { maxRetries: 3 },
    });
  });

  it('config list --fields projects the JSON output', async () => {
    const result = await runProgram([
      '--json',
      '--fields',
      'maxRetries',
      'config',
      'list',
    ]);

    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      command: 'config.list',
      data: { maxRetries: 2 },
    });
  });

  it('commands --table lists each command group with its subcommands', async () => {
    const result = await runProgram(['--table', 'commands']);

    expect(result.status).toBe(0);
    const lines = result.stdout.split('\n');
    expect(lines[1]).toMatch(/^│ Command +│ Description +│ Subcommands +│$/);
    expect(lines).toContainEqual(
      expect.stringMatching(
        /^│ parties +│ List and get parties +│ list, get +│$/,
      ),
    );
  });

  it('commands --table --fields name prints one row per command group', async () => {
    const result = await runProgram([
      '--table',
      '--fields',
      'name',
      'commands',
    ]);

    expect(result.status).toBe(0);
    const cells = result.stdout
      .split('\n')
      .flatMap((line) => line.match(/^│ (\S+) +│$/)?.[1] ?? []);
    expect(cells.slice(0, 4)).toEqual([
      'name',
      'containers',
      'shipments',
      'tracking-requests',
    ]);
    expect(cells).toContain('parties');
  });
});
