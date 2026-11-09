#!/usr/bin/env node

import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const temporaryDirectory = mkdtempSync(join(tmpdir(), 't49-openapi-'));
const artifacts = [
  'sdks/typescript-sdk/src/generated/terminal49.ts',
  'sdks/typescript-sdk/src/generated/list-filters.ts',
  'docs/api-docs/api-reference/list-filters.mdx',
  'packages/mcp/src/generated/list-filter-schemas.ts',
];
const generators = [
  ['npm', 'run', 'generate:types', '--workspace', '@terminal49/sdk'],
  [process.execPath, 'packages/mcp/scripts/generate-list-filter-schemas.mjs'],
];

try {
  for (const source of [
    'docs/openapi.json',
    'sdks/typescript-sdk/package.json',
    'sdks/typescript-sdk/scripts/generate-filter-types.mjs',
    'packages/mcp/scripts/generate-list-filter-schemas.mjs',
    'vite.config.ts',
  ]) {
    const destination = join(temporaryDirectory, source);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(resolve(root, source), destination);
  }
  for (const artifact of artifacts) {
    mkdirSync(dirname(join(temporaryDirectory, artifact)), { recursive: true });
  }
  writeFileSync(
    join(temporaryDirectory, 'package.json'),
    JSON.stringify({ private: true, workspaces: ['sdks/typescript-sdk'] }),
  );
  symlinkSync(
    resolve(root, 'node_modules'),
    join(temporaryDirectory, 'node_modules'),
    'dir',
  );

  for (const [command, ...args] of generators) {
    const result = spawnSync(command, args, {
      cwd: temporaryDirectory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `${args.join(' ')} failed`);
    }
  }

  const stale = artifacts.filter(
    (artifact) =>
      readFileSync(resolve(root, artifact), 'utf8') !==
      readFileSync(join(temporaryDirectory, artifact), 'utf8'),
  );
  if (stale.length > 0) {
    throw new Error(
      `OpenAPI-generated artifacts are stale: ${stale.join(', ')}. Run \`npm run generate:types --workspace @terminal49/sdk\` and \`npm run generate:filters --workspace @terminal49/mcp\`.`,
    );
  }

  console.log('PASS OpenAPI SDK and MCP generation');
} catch (error) {
  console.error(
    `FAIL OpenAPI SDK and MCP generation: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
