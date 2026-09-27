#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const LEVEL = { low: 0, medium: 1, high: 2 };

const ROOT_HIGH_RISK_FILES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'tsconfig.json',
  'vercel.json',
  'vite.config.ts',
]);

const SDK_PUBLIC_SURFACE_FILES = new Set([
  'sdks/typescript-sdk/package.json',
  'sdks/typescript-sdk/src/client.ts',
  'sdks/typescript-sdk/src/index.ts',
]);

const SDK_PUBLIC_SURFACE_PREFIXES = [
  'sdks/typescript-sdk/src/client/jsonapi.',
  'sdks/typescript-sdk/src/client/managers/',
  'sdks/typescript-sdk/src/client/mappers.',
  'sdks/typescript-sdk/src/client/transport.',
  'sdks/typescript-sdk/src/generated/',
  'sdks/typescript-sdk/src/types/',
];

const AGENT_TRUST_FILES = new Set([
  '.cursor/rules/agent-trust.mdc',
  'bin/agent-verify.mjs',
  'bin/check-agent-trust.mjs',
  'bin/check-openapi-types.mjs',
]);

const normalizePath = (filePath) =>
  filePath.replaceAll('\\', '/').replace(/^\.?\//, '');

export function classifyPath(filePath) {
  const path = normalizePath(filePath);

  if (
    path.startsWith('.github/') ||
    path.startsWith('api/') ||
    path.startsWith('packages/mcp/') ||
    path.startsWith('scripts/ci/') ||
    path.startsWith('skills/agent-trust/') ||
    ROOT_HIGH_RISK_FILES.has(path) ||
    SDK_PUBLIC_SURFACE_FILES.has(path) ||
    SDK_PUBLIC_SURFACE_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    AGENT_TRUST_FILES.has(path) ||
    path === 'docs/openapi.json'
  ) {
    return 'high';
  }

  if (
    path.startsWith('docs/') &&
    !path.startsWith('docs/mcp/') &&
    !path.startsWith('docs/sdk/')
  ) {
    return 'low';
  }

  return 'medium';
}

export function classifyPaths(filePaths) {
  if (filePaths.length === 0) {
    return { risk: 'medium', paths: { low: [], medium: [], high: [] } };
  }

  const paths = { low: [], medium: [], high: [] };
  let risk = 'low';

  for (const filePath of filePaths) {
    const normalizedPath = normalizePath(filePath);
    const pathRisk = classifyPath(normalizedPath);
    paths[pathRisk].push(normalizedPath);
    if (LEVEL[pathRisk] > LEVEL[risk]) {
      risk = pathRisk;
    }
  }

  return { risk, paths };
}

async function readPaths(args) {
  const jsonIndex = args.indexOf('--json');
  if (jsonIndex !== -1) {
    const jsonPath = args.at(jsonIndex + 1);
    if (!jsonPath) {
      throw new Error('--json requires a file path');
    }
    const value = JSON.parse(await readFile(jsonPath, 'utf8'));
    if (
      !Array.isArray(value) ||
      value.some((path) => typeof path !== 'string')
    ) {
      throw new Error('The JSON input must be an array of file paths');
    }
    return value;
  }

  return args.filter((arg) => arg !== '--github-output');
}

async function main() {
  const args = process.argv.slice(2);
  const result = classifyPaths(await readPaths(args));

  if (args.includes('--github-output')) {
    process.stdout.write(`risk=${result.risk}\n`);
    process.stdout.write(`details=${JSON.stringify(result.paths)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
