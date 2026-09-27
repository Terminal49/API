import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyPath,
  classifyPaths,
} from './classify-pr-risk.mjs';
import {
  heuristicShadowRisk,
  mapJevScore,
} from './score-shadow-risk.mjs';

test('classifies repository control planes and public runtime surfaces as high', () => {
  const highRiskPaths = [
    '.github/workflows/ci.yml',
    'package.json',
    'package-lock.json',
    'docs/openapi.json',
    'api/mcp.ts',
    'packages/mcp/src/server.ts',
    'sdks/typescript-sdk/package.json',
    'sdks/typescript-sdk/src/index.ts',
    'scripts/ci/classify-pr-risk.mjs',
    'skills/agent-trust/feature-map.json',
    'bin/agent-verify.mjs',
    '.cursor/rules/agent-trust.mdc',
    'vercel.json',
  ];

  for (const path of highRiskPaths) {
    assert.equal(classifyPath(path), 'high', path);
  }
});

test('classifies pure docs as low but capability docs conservatively', () => {
  assert.equal(classifyPath('docs/api-docs/in-depth-guides/routing.mdx'), 'low');
  assert.equal(classifyPath('docs/updates/home.mdx'), 'low');
  assert.equal(classifyPath('docs/mcp/home.mdx'), 'medium');
  assert.equal(classifyPath('docs/sdk/quickstart.mdx'), 'medium');
});

test('classifies unrecognized paths as medium', () => {
  assert.equal(classifyPath('sdks/typescript-sdk/src/client/query.ts'), 'medium');
  assert.equal(classifyPath('README.md'), 'medium');
  assert.equal(classifyPath('packages/new-package/src/index.ts'), 'medium');
});

test('uses the highest risk across all changed paths', () => {
  const result = classifyPaths([
    'docs/updates/home.mdx',
    'README.md',
    'api/mcp.ts',
  ]);

  assert.equal(result.risk, 'high');
  assert.deepEqual(result.paths.high, ['api/mcp.ts']);
  assert.deepEqual(result.paths.medium, ['README.md']);
  assert.deepEqual(result.paths.low, ['docs/updates/home.mdx']);
});

test('fails conservatively to medium when no changed files are supplied', () => {
  assert.equal(classifyPaths([]).risk, 'medium');
});

test('maps Jev score bands and rejects malformed scores', () => {
  assert.equal(mapJevScore(0.49), 'low');
  assert.equal(mapJevScore(0.5), 'medium');
  assert.equal(mapJevScore(1.49), 'medium');
  assert.equal(mapJevScore(1.5), 'high');
  assert.throws(() => mapJevScore(Number.NaN));
  assert.throws(() => mapJevScore(3));
});

test('heuristic shadow scoring stays independent and conservative', () => {
  assert.equal(
    heuristicShadowRisk({
      title: 'Clarify a guide',
      files: [
        {
          filename: 'docs/updates/home.mdx',
          additions: 4,
          deletions: 1,
          patch: 'Clarify wording.',
        },
      ],
    }),
    'low',
  );
  assert.equal(
    heuristicShadowRisk({
      title: 'Refactor client behavior',
      files: [
        {
          filename: 'sdks/typescript-sdk/src/client/query.ts',
          additions: 20,
          deletions: 10,
        },
      ],
    }),
    'medium',
  );
  assert.equal(
    heuristicShadowRisk({
      title: 'Adjust OAuth token validation',
      files: [
        {
          filename: 'notes.md',
          additions: 2,
          deletions: 1,
        },
      ],
    }),
    'high',
  );
});
