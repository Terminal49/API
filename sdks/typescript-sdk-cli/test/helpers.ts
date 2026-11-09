import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vite-plus/test';
import { main } from '../src/index.js';

export type RunResult = { status: number; stdout: string; stderr: string };

/** Runs the CLI the way bin/t49.ts does, capturing stdout, stderr, and the exit code. */
export async function runProgram(args: string[]): Promise<RunResult> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalWrite = process.stdout.write;
  const originalErrorWrite = process.stderr.write;
  process.stdout.write = ((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    await main(['node', 't49', ...args]);
    const status = Number(process.exitCode ?? 0);
    return { status, stdout: stdout.join(''), stderr: stderr.join('') };
  } finally {
    process.exitCode = undefined;
    process.stdout.write = originalWrite;
    process.stderr.write = originalErrorWrite;
  }
}

export type RecordedRequest = { method: string; url: URL; body: unknown };

/**
 * Points the CLI at a fake API: `respond` answers every request with a JSON
 * body or a whole `Response`, and each request is recorded with its parsed
 * JSON body.
 */
export function stubApi(
  respond: (request: RecordedRequest) => unknown,
): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal('fetch', async (input: Request | URL | string) => {
    const request = input instanceof Request ? input : new Request(input);
    const text = await request.text();
    const recorded = {
      method: request.method,
      url: new URL(request.url),
      body: text ? JSON.parse(text) : undefined,
    };
    requests.push(recorded);
    const answer = respond(recorded);
    if (answer instanceof Response) return answer;
    return new Response(JSON.stringify(answer), {
      status: 200,
      headers: { 'Content-Type': 'application/vnd.api+json' },
    });
  });
  process.env.T49_API_TOKEN = 'token-123';
  process.env.T49_API_BASE_URL = 'https://api.test/v2';
  process.env.XDG_CONFIG_HOME = mkdtempSync(join(tmpdir(), 't49-cli-'));
  return requests;
}

const originalEnv = {
  T49_API_TOKEN: process.env.T49_API_TOKEN,
  T49_API_BASE_URL: process.env.T49_API_BASE_URL,
  XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
};

/** Undo `stubApi`: restore `fetch` and the environment it changed. */
export function resetApiStub(): void {
  vi.unstubAllGlobals();
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}
