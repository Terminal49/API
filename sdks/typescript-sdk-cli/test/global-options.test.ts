import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { resetApiStub, runProgram, stubApi } from './helpers.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

afterEach(resetApiStub);

describe('global options', () => {
  it('--max-retries 0 sends a failing request once', async () => {
    const requests = stubApi(
      () =>
        new Response(JSON.stringify({ errors: [{ title: 'Unavailable' }] }), {
          status: 503,
          headers: { 'Content-Type': 'application/vnd.api+json' },
        }),
    );

    const result = await runProgram([
      '--json',
      '--max-retries',
      '0',
      'containers',
      'list',
    ]);

    expect(result.status).toBe(8);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(result.stderr).error.code).toBe('UPSTREAM_ERROR');
  });

  it('prints a usage error on stderr as JSON and nothing else', async () => {
    stubApi(() => ({ data: [] }));

    const result = await runProgram([
      '--json',
      '--max-retries',
      'abc',
      'containers',
      'list',
    ]);

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: {
        code: 'USAGE_ERROR',
        message:
          "error: option '--max-retries <n>' argument 'abc' is invalid. --max-retries must be a non-negative integer",
      },
    });
  });

  it('adds the --help hint only to human-readable usage errors', async () => {
    stubApi(() => ({ data: [] }));
    const originalIsTTY = process.stderr.isTTY;
    process.stderr.isTTY = true;
    try {
      const result = await runProgram([
        '--max-retries',
        '-1',
        'containers',
        'list',
      ]);

      expect(result.status).toBe(2);
      expect(result.stderr).toBe(
        "USAGE_ERROR: error: option '--max-retries <n>' argument '-1' is invalid. --max-retries must be a non-negative integer\n(run --help for usage)\n",
      );
    } finally {
      process.stderr.isTTY = originalIsTTY;
    }
  });

  it('leaves the --help hint off human-readable API errors', async () => {
    stubApi(
      () =>
        new Response(JSON.stringify({ errors: [{ title: 'Unavailable' }] }), {
          status: 503,
          headers: { 'Content-Type': 'application/vnd.api+json' },
        }),
    );
    const originalIsTTY = process.stderr.isTTY;
    process.stderr.isTTY = true;
    try {
      const result = await runProgram([
        '--max-retries',
        '0',
        'containers',
        'list',
      ]);

      expect(result.status).toBe(8);
      expect(result.stderr).toBe('UPSTREAM_ERROR: Unavailable\n');
    } finally {
      process.stderr.isTTY = originalIsTTY;
    }
  });

  it.each(['--help', 'help', 'help shipments', 'shipments --help'])(
    't49 %s prints help on stdout and exits 0',
    async (args) => {
      const result = await runProgram(args.split(' '));

      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^Usage: t49 /);
      expect(result.stderr).toBe('');
    },
  );

  it('--version prints the package version and exits 0', async () => {
    const result = await runProgram(['--version']);

    expect(result).toEqual({ status: 0, stdout: `${version}\n`, stderr: '' });
  });

  it('reports a group without its subcommand as a JSON usage error only', async () => {
    const result = await runProgram(['--json', 'shipments']);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      ok: false,
      error: { code: 'USAGE_ERROR', message: 'error: missing subcommand' },
    });
  });

  it('shows a terminal the group help before the usage error', async () => {
    const originalIsTTY = process.stderr.isTTY;
    process.stderr.isTTY = true;
    try {
      const result = await runProgram(['shipments']);

      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/^Usage: t49 shipments /);
      expect(result.stderr).toMatch(
        /\nUSAGE_ERROR: error: missing subcommand\n\(run --help for usage\)\n$/,
      );
    } finally {
      process.stderr.isTTY = originalIsTTY;
    }
  });
});
