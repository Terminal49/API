import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyPath, classifyPaths } from './classify-pr-risk.mjs';
import { heuristicShadowRisk, mapJevScore } from './score-shadow-risk.mjs';

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
    'sdks/typescript-sdk/src/generated/terminal49.ts',
    'sdks/typescript-sdk/src/types/models.ts',
    'sdks/typescript-sdk/src/client/managers/containers.ts',
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
  assert.equal(
    classifyPath('docs/api-docs/in-depth-guides/routing.mdx'),
    'low',
  );
  assert.equal(classifyPath('docs/updates/home.mdx'), 'low');
  assert.equal(classifyPath('docs/mcp/home.mdx'), 'medium');
  assert.equal(classifyPath('docs/sdk/quickstart.mdx'), 'medium');
});

test('classifies unrecognized paths as medium', () => {
  assert.equal(
    classifyPath('sdks/typescript-sdk/src/client/query.ts'),
    'medium',
  );
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

test('publicly re-exported SDK errors have high risk and explicit ownership', async () => {
  const path = 'sdks/typescript-sdk/src/client/errors.ts';
  assert.equal(classifyPath(path), 'high');
  const { readFile } = await import('node:fs/promises');
  const owners = await readFile(
    new URL('../../.github/CODEOWNERS', import.meta.url),
    'utf8',
  );
  assert.ok(owners.split('\n').some((line) => line.startsWith(`/${path} `)));
});

test('shadow labels converge from current GitHub state rather than queued event labels', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(
    new URL('../../.github/workflows/shadow-risk.yml', import.meta.url),
    'utf8',
  );
  const step = source.split(
    '- name: Apply shadow label and sticky comparison',
  )[1];
  const block = step
    .split('          script: |\n')[1]
    .split('\n      - name:')[0];
  const script = block
    .split('\n')
    .map((line) => (line.startsWith('            ') ? line.slice(12) : line))
    .join('\n');
  const changes = [];
  const github = {
    paginate: async (endpoint) =>
      endpoint === 'labels' ? [{ name: 'risk-shadow:high' }] : [],
    rest: {
      issues: {
        getLabel: async () => ({}),
        listLabelsOnIssue: 'labels',
        listComments: 'comments',
        removeLabel: async (args) => changes.push(['remove', args.name]),
        addLabels: async (args) => changes.push(['add', args.labels]),
        createComment: async () => ({}),
      },
    },
  };
  const context = {
    repo: { owner: 'Terminal49', repo: 'API' },
    payload: {
      pull_request: { number: 10, labels: [{ name: 'risk-shadow:low' }] },
    },
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction('github', 'context', 'process', script)(
    github,
    context,
    {
      env: {
        SHADOW_RISK: 'low',
        PATH_RISK: 'low',
        SHADOW_SOURCE: 'heuristic fallback',
      },
    },
  );
  assert.deepEqual(changes, [
    ['remove', 'risk-shadow:high'],
    ['add', ['risk-shadow:low']],
  ]);
});
