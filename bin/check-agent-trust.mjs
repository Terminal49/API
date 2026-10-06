#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizedVersion(version) {
  return version.replace(/^=/, '');
}

function assertEqual(label, actual, expected) {
  const actualJson = JSON.stringify(sorted(actual));
  const expectedJson = JSON.stringify(sorted(expected));
  if (actualJson !== expectedJson) {
    throw new Error(
      `${label} drifted.\nExpected: ${expectedJson}\nActual:   ${actualJson}`,
    );
  }
}

function collectStrings(value) {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

export function checkSdkEntrypoints(sdkEntrypoints, sdkExports) {
  assertEqual(
    'SDK entrypoint map',
    sdkEntrypoints.map((entry) => entry.export),
    Object.keys(sdkExports),
  );
  for (const entry of sdkEntrypoints) {
    const sourcePath = entry.source.match(
      /^sdks\/typescript-sdk\/src\/(.+)\.ts$/,
    )?.[1];
    if (
      !sourcePath ||
      entry.source.endsWith('.d.ts') ||
      /[\\%#?]/.test(sourcePath) ||
      sourcePath
        .split('/')
        .some((segment) =>
          ['', '.', '..', 'node_modules'].includes(segment.toLowerCase()),
        )
    ) {
      throw new Error(
        'SDK entrypoint source must be a canonical .ts path under sdks/typescript-sdk/src',
      );
    }

    const targets = {
      types: `./dist/${sourcePath}.d.ts`,
      default: `./dist/${sourcePath}.js`,
    };
    const packageExport = sdkExports[entry.export];
    assertEqual(
      `SDK export ${entry.export} conditions`,
      Object.keys(packageExport),
      Object.keys(targets),
    );
    for (const [condition, target] of Object.entries(targets)) {
      if (packageExport[condition] !== target) {
        throw new Error(
          `SDK export ${entry.export} ${condition} must target ${target}; received ${packageExport[condition]}`,
        );
      }
    }
  }
}

function checkFeatureMap() {
  const featureMap = readJson('skills/agent-trust/feature-map.json');
  const serverSource = readFileSync(
    resolve(root, 'packages/mcp/src/server.ts'),
    'utf8',
  );
  const registeredTools = [
    ...serverSource.matchAll(/server\.registerTool\s*\(\s*'([^']+)'\s*,/g),
  ].map((match) => match[1]);
  if (
    [...serverSource.matchAll(/server\.registerTool\s*\(/g)].length !==
    registeredTools.length
  ) {
    throw new Error('MCP registrations require supported literal tool names');
  }
  assertEqual(
    'MCP feature map',
    featureMap.mcpTools.map((tool) => tool.name),
    registeredTools,
  );

  for (const tool of featureMap.mcpTools) {
    if (!existsSync(resolve(root, tool.implementation))) {
      throw new Error(`Missing MCP implementation: ${tool.implementation}`);
    }
  }

  const sdkPackage = readJson('sdks/typescript-sdk/package.json');
  checkSdkEntrypoints(featureMap.sdkEntrypoints, sdkPackage.exports);
  for (const entry of featureMap.sdkEntrypoints) {
    if (!existsSync(resolve(root, entry.source))) {
      throw new Error(`Missing SDK entrypoint source: ${entry.source}`);
    }
  }

  const docsConfig = readJson('docs/docs.json');
  const docsRoutes = collectStrings(docsConfig.navigation).filter(
    (route) =>
      route === 'api-docs/in-depth-guides/mcp' ||
      route.startsWith('mcp/') ||
      (route.startsWith('sdk/') && !route.startsWith('sdk/reference/')),
  );
  assertEqual('Docs route map', featureMap.docsRoutes, docsRoutes);
  for (const route of featureMap.docsRoutes) {
    if (!existsSync(resolve(root, `docs/${route}.mdx`))) {
      throw new Error(`Missing docs route source: docs/${route}.mdx`);
    }
  }
}

function workspaceManifests() {
  return sorted(
    globSync(
      readJson('package.json').workspaces.map(
        (workspace) => `${workspace}/package.json`,
      ),
      { cwd: root },
    ),
  );
}

function checkToolchain() {
  const rootPackage = readJson('package.json');
  const vitePlusPackage = readJson('node_modules/vite-plus/package.json');
  const expected = vitePlusPackage.dependencies;
  const workspaces = workspaceManifests();

  if (rootPackage.devDependencies['vite-plus'] !== vitePlusPackage.version) {
    throw new Error(
      'Root vite-plus version does not match the installed tool.',
    );
  }
  if (
    rootPackage.devDependencies['@oxlint/plugins'] !==
    normalizedVersion(expected['@oxlint/plugins'])
  ) {
    throw new Error('@oxlint/plugins is not coupled to vite-plus.');
  }
  if (rootPackage.overrides.vitest !== expected.vitest) {
    throw new Error('Vitest override is not coupled to vite-plus.');
  }
  if (
    rootPackage.overrides.vite !==
    `npm:@voidzero-dev/vite-plus-core@${vitePlusPackage.version}`
  ) {
    throw new Error('Vite core override is not coupled to vite-plus.');
  }

  const workspaceNames = [];
  const workspacePackages = [];
  for (const workspacePath of workspaces) {
    const workspace = readJson(workspacePath);
    workspaceNames.push(workspace.name);
    workspacePackages.push(workspace);
    if (workspace.devDependencies['vite-plus'] !== vitePlusPackage.version) {
      throw new Error(`${workspacePath} has a mismatched vite-plus version.`);
    }
    if (workspace.devDependencies['@vitest/coverage-v8'] !== expected.vitest) {
      throw new Error(
        `${workspacePath} has a mismatched Vitest coverage version.`,
      );
    }
  }
  const buildTargets = (rootPackage.scripts?.build ?? '')
    .split('&&')
    .map((command) => {
      const target = command
        .trim()
        .match(/^npm run build --workspace (\S+)$/)?.[1];
      if (!target)
        throw new Error(
          'Root build must use ordered npm workspace build commands',
        );
      return target;
    });
  assertEqual('Workspace build inventory', buildTargets, workspaceNames);
  const buildPosition = new Map(
    buildTargets.map((name, position) => [name, position]),
  );
  for (const workspace of workspacePackages) {
    const dependencies = {
      ...workspace.dependencies,
      ...workspace.devDependencies,
      ...workspace.optionalDependencies,
      ...workspace.peerDependencies,
    };
    for (const dependency of Object.keys(dependencies)) {
      if (
        buildPosition.has(dependency) &&
        buildPosition.get(dependency) >= buildPosition.get(workspace.name)
      ) {
        throw new Error(
          `Root build must build ${dependency} before ${workspace.name}`,
        );
      }
    }
  }
}

function checkConfigOwnership() {
  const sourceFiles = execFileSync(
    'git',
    [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
      '--',
      ...workspaceManifests().map(dirname),
    ],
    { cwd: root, encoding: 'utf8' },
  ).split('\0');
  const nestedConfigs = sorted(
    sourceFiles.filter((path) =>
      /(?:^|\/)vite\.config\.[cm]?[jt]s$/.test(path),
    ),
  );
  if (nestedConfigs.length > 0) {
    throw new Error(
      `Workspace Vite configs are not allowed: ${nestedConfigs.join(', ')}`,
    );
  }
}

if (import.meta.main) {
  try {
    checkFeatureMap();
    checkToolchain();
    checkConfigOwnership();
    console.log('PASS agent trust guards');
  } catch (error) {
    console.error(
      `FAIL agent trust guards: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
