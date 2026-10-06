import assert from 'node:assert/strict';
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
