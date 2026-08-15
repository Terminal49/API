import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthenticationError, NetworkError } from '@terminal49/sdk';
import { Command, InvalidArgumentError } from 'commander';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { listFilters } from '../src/commands/tracking-requests.js';
import { getExitCode } from '../src/errors.js';
import { createProgram } from '../src/index.js';

const originalEnv = {
  T49_API_TOKEN: process.env.T49_API_TOKEN,
  T49_API_BASE_URL: process.env.T49_API_BASE_URL,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
};

class ProcessExit extends Error {
  constructor(readonly code: number | string | null | undefined) {
    super(`process.exit(${String(code)})`);
  }
}

afterEach(() => {
  restoreEnv('T49_API_TOKEN', originalEnv.T49_API_TOKEN);
  restoreEnv('T49_API_BASE_URL', originalEnv.T49_API_BASE_URL);
  restoreEnv('XDG_CONFIG_HOME', originalEnv.XDG_CONFIG_HOME);
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

async function runProgram(
  args: string[],
): Promise<{ status: number; stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalWrite = process.stdout.write;
  const originalErrorWrite = process.stderr.write;
  const originalExit = process.exit;
  process.stdout.write = ((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  process.exit = ((code?: number | string | null) => {
    throw new ProcessExit(code);
  }) as typeof process.exit;

  try {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(args, { from: 'user' });
    return { status: 0, stdout: stdout.join(''), stderr: stderr.join('') };
  } catch (error) {
    if (error instanceof ProcessExit) {
      const status = typeof error.code === 'number' ? error.code : 1;
      return { status, stdout: stdout.join(''), stderr: stderr.join('') };
    }
    throw error;
  } finally {
    process.stdout.write = originalWrite;
    process.stderr.write = originalErrorWrite;
    process.exit = originalExit;
  }
}

function findCommand(program: Command, path: string[]): Command {
  let current = program;
  for (const name of path) {
    const next = current.commands.find((command) => command.name() === name);
    if (!next) throw new Error(`Missing command: ${path.join(' ')}`);
    current = next;
  }
  return current;
}

function optionLongNames(command: Command): string[] {
  return command.options.map((option) => option.long);
}

describe('CLI regressions', () => {
  it('tracking-requests list maps --status to filter[status]', () => {
    expect(listFilters({ status: 'succeeded' })).toMatchObject({
      'filter[status]': 'succeeded',
    });
  });

  it('maps key error classes to stable exit codes', () => {
    expect(getExitCode(new NetworkError('connection failed'))).toBe(9);
    expect(getExitCode(new AuthenticationError('bad token'))).toBe(3);
    expect(getExitCode(new InvalidArgumentError('bad args'))).toBe(2);
  });

  it('config set rejects unknown keys and redacts token in get/list', async () => {
    const configHome = mkdtempSync(join(tmpdir(), 't49-cli-config-'));
    const token = 'tok_secret_123456';
    process.env.XDG_CONFIG_HOME = configHome;

    const unknown = await runProgram(['--json', 'config', 'set', 'unknownKey', 'value']);
    expect(unknown.status).toBe(2);
    expect(JSON.parse(unknown.stderr)).toMatchObject({
      ok: false,
      error: { code: 'USAGE_ERROR' },
    });

    const set = await runProgram(['--json', 'config', 'set', 'token', token]);
    expect(set.status).toBe(0);

    const get = await runProgram(['--json', 'config', 'get', 'token']);
    expect(get.status).toBe(0);
    expect(get.stdout).not.toContain(token);
    expect(JSON.parse(get.stdout)).toMatchObject({
      ok: true,
      data: { key: 'token', value: 'tok_...3456' },
    });

    const list = await runProgram(['--json', 'config', 'list']);
    expect(list.status).toBe(0);
    expect(list.stdout).not.toContain(token);
    expect(JSON.parse(list.stdout)).toMatchObject({
      ok: true,
      data: { token: 'tok_...3456' },
    });
  });

  it('shipments and containers list do not expose unsupported SDK filters', () => {
    const program = createProgram();
    const containers = optionLongNames(findCommand(program, ['containers', 'list']));
    const shipments = optionLongNames(findCommand(program, ['shipments', 'list']));

    expect(containers).not.toContain('--status');
    expect(containers).not.toContain('--port');
    expect(containers).not.toContain('--carrier');
    expect(containers).not.toContain('--updated-after');
    expect(shipments).not.toContain('--status');
    expect(shipments).not.toContain('--port');
    expect(shipments).not.toContain('--carrier');
    expect(shipments).not.toContain('--updated-after');
  });

  it('cliEnvelope is branded so raw JSON:API docs are not mistaken for list envelopes', async () => {
    const { cliEnvelope } = await import('../src/commands/action.js');
    const envelope = cliEnvelope([{ id: '1' }], {
      pagination: { meta: { total: 1 } },
    });
    expect(envelope.__cliEnvelope).toBe(true);
    expect(envelope.data).toEqual([{ id: '1' }]);

    // A JSON:API document has `data` but must not satisfy the branded envelope.
    const jsonApi = {
      data: {
        type: 'container',
        id: 'c1',
        attributes: { number: 'ABCD1234567' },
      },
      included: [{ type: 'terminal', id: 't1' }],
      links: { self: '/containers/c1' },
    };
    expect('__cliEnvelope' in jsonApi).toBe(false);
  });
});
