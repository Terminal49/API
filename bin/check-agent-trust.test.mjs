import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkSdkEntrypoints } from './check-agent-trust.mjs';

const sdkEntrypoints = [
  { export: '.', source: 'sdks/typescript-sdk/src/index.ts' },
  { export: './client', source: 'sdks/typescript-sdk/src/client.ts' },
];
const sdkExports = {
  '.': { types: './dist/index.d.ts', default: './dist/index.js' },
  './client': { types: './dist/client.d.ts', default: './dist/client.js' },
};

test('accepts SDK exports that publish their mapped source outputs', () => {
  assert.doesNotThrow(() => checkSdkEntrypoints(sdkEntrypoints, sdkExports));
});

test('accepts a nested SDK source without flattening its output path', () => {
  assert.doesNotThrow(() =>
    checkSdkEntrypoints(
      [
        {
          export: './shipments',
          source: 'sdks/typescript-sdk/src/managers/shipments.ts',
        },
      ],
      {
        './shipments': {
          types: './dist/managers/shipments.d.ts',
          default: './dist/managers/shipments.js',
        },
      },
    ),
  );
});

test('rejects a client JavaScript export redirected to the root entrypoint', () => {
  const redirectedExports = structuredClone(sdkExports);
  redirectedExports['./client'].default = './dist/index.js';

  assert.throws(
    () => checkSdkEntrypoints(sdkEntrypoints, redirectedExports),
    /SDK export \.\/client default must target \.\/dist\/client\.js/,
  );
});

test('rejects declarations redirected independently of JavaScript', () => {
  const redirectedExports = structuredClone(sdkExports);
  redirectedExports['./client'].types = './dist/index.d.ts';

  assert.throws(
    () => checkSdkEntrypoints(sdkEntrypoints, redirectedExports),
    /SDK export \.\/client types must target \.\/dist\/client\.d\.ts/,
  );
});

test('rejects a mapped source that exists but does not produce the export', () => {
  const incorrectEntrypoints = structuredClone(sdkEntrypoints);
  incorrectEntrypoints[1].source = 'sdks/typescript-sdk/src/index.ts';

  assert.throws(
    () => checkSdkEntrypoints(incorrectEntrypoints, sdkExports),
    /SDK export \.\/client types must target \.\/dist\/index\.d\.ts/,
  );
});

test('rejects a conditional export that overrides the checked default', () => {
  const conditionalExports = structuredClone(sdkExports);
  conditionalExports['./client'] = {
    import: './dist/index.js',
    ...conditionalExports['./client'],
  };

  assert.throws(
    () => checkSdkEntrypoints(sdkEntrypoints, conditionalExports),
    /SDK export \.\/client conditions drifted/,
  );
});

test('rejects missing declaration output mapping', () => {
  const incompleteExports = structuredClone(sdkExports);
  delete incompleteExports['./client'].types;

  assert.throws(
    () => checkSdkEntrypoints(sdkEntrypoints, incompleteExports),
    /SDK export \.\/client conditions drifted/,
  );
});

test('rejects package exports absent from the feature map', () => {
  assert.throws(
    () => checkSdkEntrypoints(sdkEntrypoints.slice(0, 1), sdkExports),
    /SDK entrypoint map drifted/,
  );
});

test('rejects a mapped SDK export absent from the package', () => {
  assert.throws(
    () => checkSdkEntrypoints(sdkEntrypoints, { '.': sdkExports['.'] }),
    /SDK entrypoint map drifted/,
  );
});

test('rejects a source outside the SDK compiler source directory', () => {
  assert.throws(
    () =>
      checkSdkEntrypoints(
        [{ export: '.', source: 'packages/mcp/src/index.ts' }],
        { '.': sdkExports['.'] },
      ),
    /SDK entrypoint source must be a canonical \.ts path under sdks\/typescript-sdk\/src/,
  );
});

test('rejects a declaration source that TypeScript does not emit', () => {
  assert.throws(
    () =>
      checkSdkEntrypoints(
        [
          {
            export: './client',
            source: 'sdks/typescript-sdk/src/client.d.ts',
          },
        ],
        {
          './client': {
            types: './dist/client.d.d.ts',
            default: './dist/client.d.js',
          },
        },
      ),
    /SDK entrypoint source must/,
  );
});

for (const sourcePath of [
  '../src/client',
  './client',
  'managers//client',
  'managers\\client',
  'node_modules/client',
  'NODE_MODULES/client',
]) {
  test(`rejects a noncanonical SDK source ${sourcePath}`, () => {
    assert.throws(
      () =>
        checkSdkEntrypoints(
          [
            {
              export: './client',
              source: `sdks/typescript-sdk/src/${sourcePath}.ts`,
            },
          ],
          {
            './client': {
              types: `./dist/${sourcePath}.d.ts`,
              default: `./dist/${sourcePath}.js`,
            },
          },
        ),
      /SDK entrypoint source must/,
    );
  });
}

test('rejects SDK source names interpreted as URL encoding, fragments, or queries', () => {
  for (const sourcePath of ['client%2e', 'client#other', 'client?other']) {
    assert.throws(
      () =>
        checkSdkEntrypoints(
          [
            {
              export: './client',
              source: `sdks/typescript-sdk/src/${sourcePath}.ts`,
            },
          ],
          {
            './client': {
              types: `./dist/${sourcePath}.d.ts`,
              default: `./dist/${sourcePath}.js`,
            },
          },
        ),
      /SDK entrypoint source must/,
      sourcePath,
    );
  }
});

function writeJson(repository, path, value) {
  const destination = join(repository, path);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(value));
}

function createGuardRepository(t) {
  const repository = mkdtempSync(join(tmpdir(), 'agent-trust-guard-'));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  writeJson(repository, 'package.json', {
    workspaces: ['packages/*', 'sdks/*'],
    scripts: {
      build:
        'npm run build --workspace @terminal49/sdk && npm run build --workspace @terminal49/mcp && npm run build --workspace @terminal49/cli',
    },
    devDependencies: { 'vite-plus': '0.3.3', '@oxlint/plugins': '1.79.0' },
    overrides: {
      vite: 'npm:@voidzero-dev/vite-plus-core@0.3.3',
      vitest: '4.1.11',
    },
  });
  writeJson(repository, 'node_modules/vite-plus/package.json', {
    version: '0.3.3',
    dependencies: { '@oxlint/plugins': '=1.79.0', vitest: '4.1.11' },
  });
  for (const workspace of [
    'packages/mcp',
    'sdks/typescript-sdk',
    'sdks/typescript-sdk-cli',
  ]) {
    writeJson(repository, `${workspace}/package.json`, {
      name:
        workspace === 'packages/mcp'
          ? '@terminal49/mcp'
          : workspace === 'sdks/typescript-sdk'
            ? '@terminal49/sdk'
            : '@terminal49/cli',
      devDependencies: {
        'vite-plus': '0.3.3',
        '@vitest/coverage-v8': '4.1.11',
      },
      exports: {},
    });
  }
  writeJson(repository, 'skills/agent-trust/feature-map.json', {
    mcpTools: [],
    sdkEntrypoints: [],
    docsRoutes: [],
  });
  writeJson(repository, 'docs/docs.json', { navigation: {} });
  mkdirSync(join(repository, 'packages/mcp/src'), { recursive: true });
  writeFileSync(join(repository, 'packages/mcp/src/server.ts'), '');
  mkdirSync(join(repository, 'bin'));
  copyFileSync(
    new URL('./check-agent-trust.mjs', import.meta.url),
    join(repository, 'bin/check-agent-trust.mjs'),
  );
  copyFileSync(
    new URL('../.gitignore', import.meta.url),
    join(repository, '.gitignore'),
  );
  const init = spawnSync('git', ['init', '--quiet'], {
    cwd: repository,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  return repository;
}

function runGuard(repository) {
  return spawnSync(process.execPath, ['bin/check-agent-trust.mjs'], {
    cwd: repository,
    encoding: 'utf8',
  });
}

test('accepts a new workspace with coupled toolchain versions', (t) => {
  const repository = createGuardRepository(t);
  const rootPackage = JSON.parse(
    readFileSync(join(repository, 'package.json'), 'utf8'),
  );
  rootPackage.scripts.build +=
    ' && npm run build --workspace @terminal49/new-workspace';
  writeJson(repository, 'package.json', rootPackage);
  writeJson(repository, 'packages/new-workspace/package.json', {
    name: '@terminal49/new-workspace',
    devDependencies: { 'vite-plus': '0.3.3', '@vitest/coverage-v8': '4.1.11' },
  });

  const result = runGuard(repository);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS agent trust guards/);
});

for (const [dependency, version, failure] of [
  [
    'vite-plus',
    '0.3.2',
    /packages\/new-workspace\/package\.json has a mismatched vite-plus version/,
  ],
  [
    '@vitest/coverage-v8',
    '4.1.10',
    /packages\/new-workspace\/package\.json has a mismatched Vitest coverage version/,
  ],
]) {
  test(`rejects ${dependency} version drift in a newly added workspace`, (t) => {
    const repository = createGuardRepository(t);
    writeJson(repository, 'packages/new-workspace/package.json', {
      devDependencies: {
        'vite-plus': '0.3.3',
        '@vitest/coverage-v8': '4.1.11',
        [dependency]: version,
      },
    });

    const result = runGuard(repository);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, failure);
  });
}

test('discovers workspace globs from the root manifest', (t) => {
  const repository = createGuardRepository(t);
  const rootPackage = JSON.parse(
    readFileSync(join(repository, 'package.json'), 'utf8'),
  );
  rootPackage.workspaces.push('extensions/*');
  writeJson(repository, 'package.json', rootPackage);
  writeJson(repository, 'extensions/new-workspace/package.json', {
    devDependencies: { 'vite-plus': '0.3.2', '@vitest/coverage-v8': '4.1.11' },
  });

  const result = runGuard(repository);
  assert.equal(result.status, 1, result.stderr);
  assert.match(
    result.stderr,
    /extensions\/new-workspace\/package\.json has a mismatched vite-plus version/,
  );
});

test('ignores third-party and build-output Vite configs excluded by Git', (t) => {
  const repository = createGuardRepository(t);
  for (const path of [
    'packages/mcp/node_modules/third-party/vite.config.ts',
    'sdks/typescript-sdk/node_modules/third-party/vite.config.js',
    'packages/mcp/dist/vite.config.mjs',
    'sdks/typescript-sdk/dist/vite.config.cjs',
  ]) {
    const destination = join(repository, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, 'export default {};');
  }

  const result = runGuard(repository);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS agent trust guards/);
});

for (const tracked of [false, true]) {
  test(`rejects ${tracked ? 'tracked' : 'untracked'} workspace source Vite config`, (t) => {
    const repository = createGuardRepository(t);
    const path = 'packages/mcp/vite.config.ts';
    writeFileSync(join(repository, path), 'export default {};');
    if (tracked) {
      const added = spawnSync('git', ['add', path], {
        cwd: repository,
        encoding: 'utf8',
      });
      assert.equal(added.status, 0, added.stderr);
    }

    const result = runGuard(repository);
    assert.equal(result.status, 1, result.stderr);
    assert.match(
      result.stderr,
      /Workspace Vite configs are not allowed: packages\/mcp\/vite\.config\.ts/,
    );
  });
}

test('a coupled new workspace must be represented in the ordered build task', (t) => {
  const repository = createGuardRepository(t);
  writeJson(repository, 'packages/new-workspace/package.json', {
    name: '@terminal49/new-workspace',
    devDependencies: { 'vite-plus': '0.3.3', '@vitest/coverage-v8': '4.1.11' },
  });
  const result = runGuard(repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Workspace build inventory drifted/);
});
