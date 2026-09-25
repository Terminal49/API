#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
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

function collectFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(path));
    } else {
      files.push(path);
    }
  }
  return files;
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

function checkFeatureMap() {
  const featureMap = readJson('skills/agent-trust/feature-map.json');
  const serverSource = readFileSync(
    resolve(root, 'packages/mcp/src/server.ts'),
    'utf8',
  );
  const registeredTools = [
    ...serverSource.matchAll(/server\.registerTool\(\s*'([^']+)'/g),
  ].map((match) => match[1]);
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
  assertEqual(
    'SDK entrypoint map',
    featureMap.sdkEntrypoints.map((entry) => entry.export),
    Object.keys(sdkPackage.exports),
  );
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

function checkToolchain() {
  const rootPackage = readJson('package.json');
  const vitePlusPackage = readJson('node_modules/vite-plus/package.json');
  const expected = vitePlusPackage.dependencies;
  const workspaces = [
    'packages/mcp/package.json',
    'sdks/typescript-sdk/package.json',
    'sdks/typescript-sdk-cli/package.json',
  ];

  if (rootPackage.devDependencies['vite-plus'] !== vitePlusPackage.version) {
    throw new Error(
      'Root vite-plus version does not match the installed tool.',
    );
  }
  if (
    rootPackage.devDependencies['@oxlint/plugins'] !==
    expected['@oxlint/plugins']
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

  for (const workspacePath of workspaces) {
    const workspace = readJson(workspacePath);
    if (workspace.devDependencies['vite-plus'] !== vitePlusPackage.version) {
      throw new Error(`${workspacePath} has a mismatched vite-plus version.`);
    }
    if (workspace.devDependencies['@vitest/coverage-v8'] !== expected.vitest) {
      throw new Error(
        `${workspacePath} has a mismatched Vitest coverage version.`,
      );
    }
  }
}

function checkConfigOwnership() {
  const nestedConfigs = ['packages', 'sdks']
    .flatMap((directory) => collectFiles(resolve(root, directory)))
    .filter((path) => /(?:^|\/)vite\.config\.[cm]?[jt]s$/.test(path))
    .map((path) => relative(root, path));
  if (nestedConfigs.length > 0) {
    throw new Error(
      `Workspace Vite configs are not allowed: ${nestedConfigs.join(', ')}`,
    );
  }
}

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
