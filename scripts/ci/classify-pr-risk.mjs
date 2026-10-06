#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

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

const CAPABILITY_GUIDES = new Set([
  'docs/api-docs/in-depth-guides/mcp.mdx',
  'docs/api-docs/getting-started/sdk-quickstart.mdx',
]);

const AGENT_TRUST_FILES = new Set([
  '.cursor/rules/agent-trust.mdc',
  'bin/agent-verify.mjs',
  'bin/check-agent-trust.mjs',
  'bin/check-agent-trust.test.mjs',
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
    path === 'docs/openapi.json' ||
    path === 'docs/risk-gates.md' ||
    path === 'docs/risk-gates-trial.md'
  ) {
    return 'high';
  }

  if (
    path.startsWith('docs/') &&
    !path.startsWith('docs/mcp/') &&
    !path.startsWith('docs/sdk/') &&
    !CAPABILITY_GUIDES.has(path)
  ) {
    return 'low';
  }

  return 'medium';
}

export function classifyFiles(files, expectedCount) {
  if (
    !Array.isArray(files) ||
    !Number.isInteger(expectedCount) ||
    expectedCount < 1 ||
    expectedCount >= 3000 ||
    files.length !== expectedCount
  ) {
    throw new Error(
      'Changed-file evidence is empty, incomplete, or reaches the REST limit',
    );
  }
  const paths = [];
  const seen = new Set();
  const validPath = (path) =>
    typeof path === 'string' &&
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.includes('\\') &&
    !path.split('/').some((part) => ['', '.', '..'].includes(part)) &&
    !/[\x00-\x1f\x7f]/.test(path);
  for (const file of files) {
    if (
      !validPath(file.filename) ||
      seen.has(file.filename) ||
      ![
        'added',
        'removed',
        'modified',
        'renamed',
        'copied',
        'changed',
        'unchanged',
      ].includes(file.status)
    ) {
      throw new Error(
        'Changed-file evidence contains an invalid or duplicate record',
      );
    }
    seen.add(file.filename);
    paths.push(file.filename);
    if (file.status === 'renamed' || file.status === 'copied') {
      if (
        !validPath(file.previous_filename) ||
        file.previous_filename === file.filename
      ) {
        throw new Error('Changed-file evidence lacks a valid rename source');
      }
      paths.push(file.previous_filename);
    }
  }
  return classifyPaths([...new Set(paths)]);
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

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
