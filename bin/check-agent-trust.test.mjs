import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  checkSdkEntrypoints,
  collectDocsRoutes,
} from './check-agent-trust.mjs';

const sdkRequire = createRequire(
  new URL('../sdks/typescript-sdk/package.json', import.meta.url),
);

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
  mkdirSync(join(repository, 'node_modules'), { recursive: true });
  symlinkSync(
    dirname(sdkRequire.resolve('typescript/package.json')),
    join(repository, 'node_modules/typescript'),
    'dir',
  );
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
      dependencies:
        workspace === 'sdks/typescript-sdk'
          ? {}
          : { '@terminal49/sdk': 'workspace:*' },
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

test('recursive workspace globs skip installed dependency manifests like npm', (t) => {
  const repository = createGuardRepository(t);
  const rootPackage = JSON.parse(
    readFileSync(join(repository, 'package.json'), 'utf8'),
  );
  rootPackage.workspaces = ['packages/*', 'sdks/**'];
  writeJson(repository, 'package.json', rootPackage);
  writeJson(
    repository,
    'sdks/typescript-sdk/node_modules/openapi-fetch/package.json',
    { name: 'openapi-fetch', version: '0.17.0' },
  );

  const result = runGuard(repository);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS agent trust guards/);
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

test('ordered build inventory cannot place SDK after its workspace dependents', (t) => {
  const repository = createGuardRepository(t);
  const rootPackage = JSON.parse(
    readFileSync(join(repository, 'package.json'), 'utf8'),
  );
  rootPackage.scripts.build =
    'npm run build --workspace @terminal49/mcp && npm run build --workspace @terminal49/cli && npm run build --workspace @terminal49/sdk';
  writeJson(repository, 'package.json', rootPackage);
  const result = runGuard(repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /must build @terminal49\/sdk before/);
});

test('configuration ownership covers workspaces from an added root glob', (t) => {
  const repository = createGuardRepository(t);
  const rootPackage = JSON.parse(
    readFileSync(join(repository, 'package.json'), 'utf8'),
  );
  rootPackage.workspaces.push('extensions/*');
  rootPackage.scripts.build +=
    ' && npm run build --workspace @terminal49/extension';
  writeJson(repository, 'package.json', rootPackage);
  writeJson(repository, 'extensions/new-workspace/package.json', {
    name: '@terminal49/extension',
    devDependencies: { 'vite-plus': '0.3.3', '@vitest/coverage-v8': '4.1.11' },
  });
  writeFileSync(
    join(repository, 'extensions/new-workspace/vite.config.ts'),
    'export default {};',
  );
  const result = runGuard(repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /extensions\/new-workspace\/vite.config.ts/);
});

test('unsupported nonliteral MCP registration cannot silently escape the feature map', (t) => {
  const repository = createGuardRepository(t);
  writeFileSync(
    join(repository, 'packages/mcp/src/server.ts'),
    'const toolName = "new_tool"; server.registerTool(toolName, {});',
  );
  const result = runGuard(repository);
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /MCP registrations require supported literal tool names/,
  );
});

for (const call of [
  "server.registerTool /* comment */ ('new_tool', {});",
  "server . registerTool('new_tool', {});",
  "server['registerTool']('new_tool', {});",
]) {
  test(`syntax-aware inventory detects an unlisted tool in ${call}`, (t) => {
    const repository = createGuardRepository(t);
    writeFileSync(join(repository, 'packages/mcp/src/server.ts'), call);
    const result = runGuard(repository);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /MCP feature map drifted/);
  });
}

for (const [form, registration] of [
  [
    'an alias',
    "const alias = server;\nalias.registerTool('new_tool', {}, () => executeNew());",
  ],
  [
    'a reassigned receiver',
    "let target;\ntarget = server;\ntarget.registerTool('new_tool', {}, () => executeNew());",
  ],
]) {
  test(`registration through ${form} is held to the feature map`, (t) => {
    const repository = createGuardRepository(t);
    const toolPath = 'packages/mcp/src/tools/new-tool.ts';
    mkdirSync(dirname(join(repository, toolPath)), { recursive: true });
    writeFileSync(
      join(repository, toolPath),
      'export function executeNew() {}',
    );
    writeFileSync(
      join(repository, 'packages/mcp/src/server.ts'),
      `import { executeNew } from './tools/new-tool.js';\n${registration}`,
    );
    const unmapped = runGuard(repository);
    assert.equal(unmapped.status, 1, unmapped.stdout);
    assert.match(unmapped.stderr, /MCP feature map drifted/);
    assert.match(unmapped.stderr, /new_tool/);

    writeJson(repository, 'skills/agent-trust/feature-map.json', {
      mcpTools: [{ name: 'new_tool', implementation: toolPath }],
      sdkEntrypoints: [],
      docsRoutes: [],
    });
    const mapped = runGuard(repository);
    assert.equal(mapped.status, 0, mapped.stderr);
  });
}

for (const source of [
  "const { registerTool } = server;\nregisterTool('new_tool', {});",
  "const register = server.registerTool.bind(server);\nregister('new_tool', {});",
  "const method = 'registerTool';\nserver[method]('new_tool', {});",
]) {
  test(`rejects the unsupported registration form ${JSON.stringify(source)}`, (t) => {
    const repository = createGuardRepository(t);
    writeFileSync(join(repository, 'packages/mcp/src/server.ts'), source);
    const result = runGuard(repository);
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stderr,
      /Unsupported MCP registerTool form at packages\/mcp\/src\/server\.ts:1;/,
    );
  });
}

test('tracks MCP pages outside the mcp prefix through nested navigation', () => {
  assert.deepEqual(
    collectDocsRoutes({
      tabs: [
        {
          tab: 'MCP',
          icon: 'plug',
          groups: [
            {
              group: 'Setup',
              pages: [
                'mcp/home',
                {
                  group: 'More',
                  pages: ['api-docs/in-depth-guides/new-connector'],
                },
              ],
            },
          ],
        },
        {
          tab: 'SDK Docs',
          groups: [{ pages: ['sdk/quickstart', 'sdk/reference/index'] }],
        },
        { tab: 'API', groups: [{ pages: ['api-docs/unrelated'] }] },
      ],
    }),
    ['mcp/home', 'api-docs/in-depth-guides/new-connector', 'sdk/quickstart'],
  );
});

test('the CLI rejects an unmapped MCP page outside the mcp prefix', (t) => {
  const repository = createGuardRepository(t);
  writeJson(repository, 'docs/docs.json', {
    navigation: {
      tabs: [
        {
          tab: 'MCP',
          groups: [
            {
              group: 'Guides',
              pages: ['api-docs/in-depth-guides/new-connector'],
            },
          ],
        },
      ],
    },
  });
  const result = runGuard(repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Docs route map drifted/);
  assert.match(result.stderr, /api-docs\/in-depth-guides\/new-connector/);
});

test('the CLI binds a tool registration to the imported implementation', (t) => {
  const repository = createGuardRepository(t);
  mkdirSync(join(repository, 'packages/mcp/src/tools'));
  writeFileSync(
    join(repository, 'packages/mcp/src/tools/tool-a.ts'),
    'export function executeA() {}',
  );
  writeFileSync(
    join(repository, 'packages/mcp/src/tools/tool-b.ts'),
    'export function executeB() {}',
  );
  writeFileSync(
    join(repository, 'packages/mcp/src/server.ts'),
    `
import { executeA } from './tools/tool-a.js';
server.registerTool('tool_a', {}, wrapTool('tool_a', () => executeA()));
`,
  );
  const featureMap = {
    mcpTools: [
      { name: 'tool_a', implementation: 'packages/mcp/src/tools/tool-a.ts' },
    ],
    sdkEntrypoints: [],
    docsRoutes: [],
  };
  writeJson(repository, 'skills/agent-trust/feature-map.json', featureMap);
  assert.equal(runGuard(repository).status, 0);
  featureMap.mcpTools[0].implementation = 'packages/mcp/src/tools/tool-b.ts';
  writeJson(repository, 'skills/agent-trust/feature-map.json', featureMap);
  const result = runGuard(repository);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /MCP implementation for tool_a drifted/);
});

for (const localHandler of [
  "() => { const executeA = () => 'different implementation'; return executeA(); }",
  '(executeA) => executeA()',
]) {
  test(`the CLI rejects a shadowed tool handler in ${localHandler}`, (t) => {
    const repository = createGuardRepository(t);
    const toolPath = 'packages/mcp/src/tools/tool-a.ts';
    mkdirSync(dirname(join(repository, toolPath)), { recursive: true });
    writeFileSync(join(repository, toolPath), 'export function executeA() {}');
    writeFileSync(
      join(repository, 'packages/mcp/src/server.ts'),
      `import { executeA } from './tools/tool-a.js';\nserver.registerTool('tool_a', {}, ${localHandler});`,
    );
    writeJson(repository, 'skills/agent-trust/feature-map.json', {
      mcpTools: [{ name: 'tool_a', implementation: toolPath }],
      sdkEntrypoints: [],
      docsRoutes: [],
    });

    const result = runGuard(repository);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, /MCP implementation for tool_a drifted/);
  });
}

function addSdkOutputFixture(
  repository,
  compilerOptions = {},
  excludeSecondary = false,
) {
  const sdkPath = 'sdks/typescript-sdk';
  writeJson(repository, `${sdkPath}/tsconfig.json`, {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      rootDir: './src',
      outDir: './dist',
      declaration: true,
      ...compilerOptions,
    },
    include: excludeSecondary ? ['src/index.ts'] : ['src/**/*.ts'],
  });
  mkdirSync(join(repository, sdkPath, 'src'), { recursive: true });
  writeFileSync(
    join(repository, sdkPath, 'src/index.ts'),
    'export const root = true;',
  );
  writeFileSync(
    join(repository, sdkPath, 'src/secondary.ts'),
    'export const secondary = true;',
  );
  const entrypoints = [
    { export: '.', source: `${sdkPath}/src/index.ts` },
    { export: './secondary', source: `${sdkPath}/src/secondary.ts` },
  ];
  const exports = Object.fromEntries(
    entrypoints.map((entry) => {
      const name = entry.source.split('/').at(-1).slice(0, -3);
      return [
        entry.export,
        { types: `./dist/${name}.d.ts`, default: `./dist/${name}.js` },
      ];
    }),
  );
  const manifest = JSON.parse(
    readFileSync(join(repository, sdkPath, 'package.json'), 'utf8'),
  );
  writeJson(repository, `${sdkPath}/package.json`, { ...manifest, exports });
  writeJson(repository, 'skills/agent-trust/feature-map.json', {
    mcpTools: [],
    sdkEntrypoints: entrypoints,
    docsRoutes: [],
  });
  mkdirSync(join(repository, sdkPath, 'dist'));
  for (const name of [
    'index.js',
    'index.d.ts',
    'secondary.js',
    'secondary.d.ts',
  ]) {
    writeFileSync(
      join(repository, sdkPath, 'dist', name),
      'stale output must not prove emission',
    );
  }
}

test('checks SDK exports against a clean compiler run without changing existing outputs', (t) => {
  const repository = createGuardRepository(t);
  addSdkOutputFixture(repository);
  const result = runGuard(repository);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    readFileSync(join(repository, 'sdks/typescript-sdk/dist/index.js'), 'utf8'),
    'stale output must not prove emission',
  );
});

for (const [name, options, excluded] of [
  ['wrong output directory', { outDir: './lib' }, false],
  ['missing output directory', { outDir: undefined }, false],
  ['excluded secondary entrypoint', {}, true],
  ['disabled JavaScript emission', { emitDeclarationOnly: true }, false],
  ['disabled declarations', { declaration: false }, false],
  ['all emission disabled', { noEmit: true }, false],
]) {
  test(`rejects ${name} even when stale package outputs exist`, (t) => {
    const repository = createGuardRepository(t);
    addSdkOutputFixture(repository, options, excluded);
    const result = runGuard(repository);
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stderr,
      /SDK export .* (was not emitted|require compiler outDir)/,
    );
  });
}

test('verifies SDK self-imports on a clean start without published artifacts', (t) => {
  const repository = createGuardRepository(t);
  addSdkOutputFixture(repository);
  rmSync(join(repository, 'sdks/typescript-sdk/dist'), { recursive: true });
  writeFileSync(
    join(repository, 'sdks/typescript-sdk/src/secondary.ts'),
    "import { root } from '@terminal49/sdk'; export const secondary = root;",
  );
  const result = runGuard(repository);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(repository, 'sdks/typescript-sdk/dist')), false);
});

for (const option of ['incremental', 'composite']) {
  test(`accepts ${option} SDK builds whose build info stays out of dist`, (t) => {
    const repository = createGuardRepository(t);
    addSdkOutputFixture(repository, { [option]: true });
    const result = runGuard(repository);
    assert.equal(result.status, 0, result.stderr);
  });
}

const forwardingRegistrar =
  'server.registerTool(definition.name, spec, wrapTool(definition.name, handler));';

const registryServer = ({
  handlers = '  tool_a: tool({}, async () => executeA()),',
  registrar = forwardingRegistrar,
  dispatch = 'for (const definition of selected) {\n  tools[definition.name](definition);\n}',
  extra = '',
} = {}) => `
import { executeA } from './tools/tool-a.js';
import { executeB } from './tools/tool-b.js';
const tool =
  (spec, handler) =>
  (definition) => {
    ${registrar}
  };
const tools = {
${handlers}
} satisfies Record<ToolName, ToolRegistrar>;
${dispatch}
${extra}
`;

const readToolHelper = `function readTool(name, title, toolset = 'core') {
  return {
    name,
    title,
    toolset,
    tier: 'read',
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  };
}`;

function createRegistryRepository(
  t,
  {
    registry = "readTool('tool_a', 'Tool A')",
    readTool = readToolHelper,
    server = registryServer(),
  } = {},
) {
  const repository = createGuardRepository(t);
  mkdirSync(join(repository, 'packages/mcp/src/tools'));
  for (const [file, name] of [
    ['tool-a.ts', 'executeA'],
    ['tool-b.ts', 'executeB'],
  ]) {
    writeFileSync(
      join(repository, 'packages/mcp/src/tools', file),
      `export function ${name}() {}`,
    );
  }
  writeFileSync(
    join(repository, 'packages/mcp/src/tools/registry.ts'),
    `export const TOOL_REGISTRY = [\n  ${registry},\n] as const satisfies readonly ToolDefinition[];\n${readTool}\n`,
  );
  writeFileSync(join(repository, 'packages/mcp/src/server.ts'), server);
  writeJson(repository, 'skills/agent-trust/feature-map.json', {
    mcpTools: [
      { name: 'tool_a', implementation: 'packages/mcp/src/tools/tool-a.ts' },
    ],
    sdkEntrypoints: [],
    docsRoutes: [],
  });
  return repository;
}

test('accepts tools registered from the registry through the handler map', (t) => {
  const result = runGuard(createRegistryRepository(t));
  assert.equal(result.status, 0, result.stderr);
});

test('a tool added to the registry and handler map must be in the feature map', (t) => {
  const repository = createRegistryRepository(t, {
    registry:
      "readTool('tool_a', 'Tool A'),\n  { name: 'tool_b', title: 'Tool B', toolset: 'core' }",
    server: registryServer({
      handlers:
        "  tool_a: tool({}, async () => executeA()),\n  'tool_b': tool({}, async (args) => executeB(args)),",
    }),
  });
  const result = runGuard(repository);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /MCP feature map drifted/);
  assert.match(result.stderr, /"tool_b"/);
});

test('binds a registry tool to the implementation its handler calls', (t) => {
  const repository = createRegistryRepository(t, {
    server: registryServer({
      handlers: '  tool_a: tool({}, async () => executeB()),',
    }),
  });
  const result = runGuard(repository);
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /MCP implementation for tool_a drifted/);
});

test('rejects a registry entry with no handler', (t) => {
  const repository = createRegistryRepository(t, {
    registry: "readTool('tool_a', 'Tool A'),\n  readTool('tool_b', 'Tool B')",
  });
  const result = runGuard(repository);
  assert.equal(result.status, 1, result.stdout);
  assert.match(
    result.stderr,
    /MCP tool registry against the server handler map drifted/,
  );
});

for (const registry of [
  'readTool(toolName, "Tool A")',
  "{ name: `tool_${suffix}`, title: 'Tool A' }",
  "{ ...base, name: 'tool_a' }",
  '...moreTools',
]) {
  test(`rejects the nonliteral registry entry ${registry}`, (t) => {
    const result = runGuard(createRegistryRepository(t, { registry }));
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stderr,
      /Unsupported MCP tool registry entry at packages\/mcp\/src\/tools\/registry\.ts:2;/,
    );
  });
}

for (const [form, server, message] of [
  [
    'a computed handler map key',
    registryServer({
      handlers: '  [toolName]: tool({}, async () => executeA()),',
    }),
    /must only be called as a literal-keyed property value of one const handler map/,
  ],
  [
    'a registrar escaping the handler map',
    registryServer({
      extra:
        "const hidden = tool({}, async () => executeB());\nhidden({ name: 'tool_x' });",
    }),
    /must only be called as a literal-keyed property value of one const handler map/,
  ],
  [
    'a handler map entry that is not a registrar call',
    registryServer({
      handlers:
        "  tool_a: tool({}, async () => executeA()),\n  tool_b: (definition) => server.registerTool('tool_b', {}, () => executeB()),",
    }),
    /MCP handler map entry at packages\/mcp\/src\/server\.ts:\d+ must be/,
  ],
  [
    'dispatch with a fabricated definition',
    registryServer({
      dispatch: "tools.tool_a({ name: 'tool_x' });",
    }),
    /MCP handler map tools at packages\/mcp\/src\/server\.ts:\d+ must only be dispatched as tools\[definition\.name\]\(definition\)/,
  ],
  [
    'dispatch under a different key than the definition',
    registryServer({
      dispatch:
        "for (const definition of selected) tools['tool_a'](definition);",
    }),
    /must only be dispatched as tools\[definition\.name\]\(definition\)/,
  ],
  [
    'a dynamic name outside a registrar factory',
    registryServer({
      extra:
        'for (const definition of selected) server.registerTool(definition.name, {});',
    }),
    /MCP registrations require supported literal tool names at packages\/mcp\/src\/server\.ts:\d+/,
  ],
]) {
  test(`rejects ${form}`, (t) => {
    const result = runGuard(createRegistryRepository(t, { server }));
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stderr, message);
  });
}

function mapTools(repository, tools) {
  writeJson(repository, 'skills/agent-trust/feature-map.json', {
    mcpTools: Object.entries(tools).map(([name, file]) => ({
      name,
      implementation: `packages/mcp/src/tools/${file}`,
    })),
    sdkEntrypoints: [],
    docsRoutes: [],
  });
}

for (const [placement, server] of [
  [
    'after',
    registryServer({
      extra: "server.registerTool('extra', {}, () => executeB());",
    }),
  ],
  [
    'before',
    `server.registerTool('extra', {}, () => executeB());\n${registryServer()}`,
  ],
]) {
  test(`rejects a literal registration ${placement} the registry registrar`, (t) => {
    const repository = createRegistryRepository(t, { server });
    mapTools(repository, { tool_a: 'tool-a.ts', extra: 'tool-b.ts' });
    const result = runGuard(repository);
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stderr,
      /MCP tool extra at packages\/mcp\/src\/server\.ts:\d+ bypasses TOOL_REGISTRY; register every tool through the registry handler map/,
    );
  });
}

for (const [form, options] of [
  [
    'a call to a helper other than readTool',
    { registry: "otherTool('tool_a', 'Tool A')" },
  ],
  [
    'a computed property that can replace the name',
    {
      registry: "{ ['na' + 'me']: 'tool_x', name: 'tool_a', title: 'Tool A' }",
    },
  ],
  ['a shorthand name property', { registry: "{ name, title: 'Tool A' }" }],
]) {
  test(`rejects a registry entry using ${form}`, (t) => {
    const result = runGuard(createRegistryRepository(t, options));
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stderr,
      /Unsupported MCP tool registry entry at packages\/mcp\/src\/tools\/registry\.ts:2;/,
    );
  });
}

for (const [form, readTool] of [
  [
    'returns a name other than its first argument',
    "function readTool(name, title) {\n  return { name: 'tool_x', title };\n}",
  ],
  [
    'lets a later property replace the name',
    'function readTool(name, title, extra) {\n  return { name, title, ...extra };\n}',
  ],
  [
    'lets a computed property replace the name',
    "function readTool(name, title) {\n  return { name, title, ['na' + 'me']: 'tool_x' };\n}",
  ],
  ['is missing', ''],
]) {
  test(`rejects a readTool helper that ${form}`, (t) => {
    const result = runGuard(createRegistryRepository(t, { readTool }));
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stderr,
      /packages\/mcp\/src\/tools\/registry\.ts must declare function readTool\(name, \.\.\.\) once, returning an object literal whose only name property is name/,
    );
  });
}

for (const [form, registrar] of [
  [
    'replaces the handler',
    'server.registerTool(definition.name, spec, wrapTool(definition.name, () => executeB()));',
  ],
  [
    'calls an implementation besides the handler',
    'server.registerTool(definition.name, spec, wrapTool(definition.name, pick(handler, () => executeB())));',
  ],
  [
    'only conditionally uses the handler',
    'server.registerTool(definition.name, spec, wrapTool(definition.name, handler ? other : handler));',
  ],
  [
    'uses the handler outside the registered callback',
    'void handler;\n    server.registerTool(definition.name, spec, wrapTool(definition.name, other));',
  ],
  ['registers no callback', 'server.registerTool(definition.name, spec);'],
]) {
  test(`rejects a registrar that ${form}`, (t) => {
    const result = runGuard(
      createRegistryRepository(t, { server: registryServer({ registrar }) }),
    );
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stderr,
      /MCP tool registrar tool at packages\/mcp\/src\/server\.ts:\d+ must pass its handler parameter, and no tool implementation, to registerTool's callback/,
    );
  });
}

for (const [form, dispatch] of [
  ['no dispatch', ''],
  [
    'a dispatch outside a for...of loop over the definition',
    'const definition = selected[0];\ntools[definition.name](definition);',
  ],
]) {
  test(`rejects a handler map with ${form}`, (t) => {
    const result = runGuard(
      createRegistryRepository(t, { server: registryServer({ dispatch }) }),
    );
    assert.equal(result.status, 1, result.stdout);
    assert.match(
      result.stderr,
      /MCP handler map tools must be dispatched as for \(const definition of \.\.\.\) tools\[definition\.name\]\(definition\)/,
    );
  });
}

test('accepts a registrar that builds the tool context from ./tools/context', (t) => {
  const repository = createRegistryRepository(t, {
    server: `import { createToolContext } from './tools/context.js';\n${registryServer(
      {
        registrar:
          'server.registerTool(definition.name, spec, wrapTool(definition.name, (args) => handler(args, createToolContext(client))));',
      },
    )}`,
  });
  writeFileSync(
    join(repository, 'packages/mcp/src/tools/context.ts'),
    'export function createToolContext() {}',
  );
  const result = runGuard(repository);
  assert.equal(result.status, 0, result.stderr);
});
