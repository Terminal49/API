import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const generatedArtifacts = [
  'sdks/typescript-sdk/src/generated/terminal49.ts',
  'sdks/typescript-sdk/src/generated/list-filters.ts',
  'docs/api-docs/api-reference/list-filters.mdx',
  'packages/mcp/src/generated/list-filter-schemas.ts',
];

function createRepository(t) {
  const repository = mkdtempSync(join(tmpdir(), 'sdk-generation-check-'));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  for (const path of [
    'bin/check-openapi-types.mjs',
    'docs/openapi.json',
    'sdks/typescript-sdk/package.json',
    'sdks/typescript-sdk/scripts/generate-filter-types.mjs',
    'packages/mcp/scripts/generate-list-filter-schemas.mjs',
    'vite.config.ts',
    ...generatedArtifacts,
  ]) {
    const destination = join(repository, path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(root, path), destination);
  }
  writeFileSync(
    join(repository, 'package.json'),
    JSON.stringify({ private: true, workspaces: ['sdks/typescript-sdk'] }),
  );
  symlinkSync(
    join(root, 'node_modules'),
    join(repository, 'node_modules'),
    'dir',
  );
  for (const [command, ...args] of [
    ['npm', 'run', 'generate:types', '--workspace', '@terminal49/sdk'],
    [process.execPath, 'packages/mcp/scripts/generate-list-filter-schemas.mjs'],
  ]) {
    const generated = spawnSync(command, args, {
      cwd: repository,
      encoding: 'utf8',
    });
    assert.equal(generated.status, 0, generated.stderr);
  }
  return repository;
}

function verify(repository) {
  return spawnSync(process.execPath, ['bin/check-openapi-types.mjs'], {
    cwd: repository,
    encoding: 'utf8',
  });
}

test('accepts the complete canonical SDK and MCP generation without modifying tracked outputs', (t) => {
  const repository = createRepository(t);
  const before = generatedArtifacts.map((path) =>
    readFileSync(join(repository, path), 'utf8'),
  );

  const result = verify(repository);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    generatedArtifacts.map((path) =>
      readFileSync(join(repository, path), 'utf8'),
    ),
    before,
  );
});

for (const path of generatedArtifacts) {
  test(`rejects drift in ${path}`, (t) => {
    const repository = createRepository(t);
    const destination = join(repository, path);
    writeFileSync(
      destination,
      readFileSync(destination, 'utf8') + '\nSTALE OUTPUT\n',
    );

    const result = verify(repository);

    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /generated.*stale/i);
    assert.ok(result.stderr.includes(path), result.stderr);
  });
}
