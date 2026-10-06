#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), 't49-openapi-'));
const generatedPath = join(temporaryDirectory, 'terminal49.ts');

try {
  const result = spawnSync(
    'npx',
    [
      '--no-install',
      'openapi-typescript',
      'docs/openapi.json',
      '-o',
      generatedPath,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'openapi-typescript failed');
  }

  const expected = readFileSync(
    resolve(root, 'sdks/typescript-sdk/src/generated/terminal49.ts'),
    'utf8',
  );
  const actual = readFileSync(generatedPath, 'utf8');
  if (actual !== expected) {
    throw new Error(
      'OpenAPI-generated SDK types are stale. Run `npm run generate:types --workspace @terminal49/sdk`.',
    );
  }

  console.log('PASS OpenAPI SDK type generation');
} catch (error) {
  console.error(
    `FAIL OpenAPI SDK type generation: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
