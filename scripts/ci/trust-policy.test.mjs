import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { classifyFiles } from './classify-pr-risk.mjs';
import { collectSnapshot, reconcilePull } from './reconcile-trust.mjs';
import { CI_JOBS, CI_WORKFLOW, evaluateTrust } from './trust-policy.mjs';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const MERGE = 'c'.repeat(40);
const APP = { id: 15368, slug: 'github-actions' };

function snapshot(path = 'docs/updates/home.mdx') {
  const run = {
    id: 100,
    updated_at: '2026-10-06T05:00:00Z',
    workflow_id: 7,
    path: CI_WORKFLOW,
    repository: { full_name: 'Terminal49/API' },
    head_repository: { full_name: 'Terminal49/API' },
    event: 'pull_request',
    head_sha: HEAD,
    pull_requests: [
      { number: 10, head: { sha: HEAD }, base: { sha: BASE, ref: 'main' } },
    ],
    check_suite_id: 11,
    run_attempt: 2,
    status: 'completed',
    conclusion: 'success',
  };
  return {
    repository: 'Terminal49/API',
    number: 10,
    defaultBranch: 'main',
    head: HEAD,
    headRepository: 'Terminal49/API',
    base: BASE,
    baseRef: 'main',
    merge: MERGE,
    state: 'open',
    draft: false,
    mergeable: true,
    mergeableState: 'clean',
    author: 'author',
    changedFiles: 1,
    files: [{ filename: path, status: 'modified' }],
    reviews: [],
    permissions: { writer: 'write' },
    sameHeadPulls: [10],
    ci: {
      workflow: { id: 7, path: CI_WORKFLOW },
      run,
      suite: { id: 11, app: APP, head_sha: MERGE },
      jobs: [
        ...CI_JOBS,
        'MCP preview 2026-07-28',
        'MCP preview 2025-11-25',
      ].map((name) => ({
        name,
        run_id: 100,
        run_attempt: 2,
        status: 'completed',
        conclusion: 'success',
        check: {
          name,
          status: 'completed',
          conclusion: 'success',
          check_suite: { id: 11 },
          app: APP,
          head_sha: MERGE,
        },
      })),
    },
  };
}

const review = (id, state, commit = HEAD, login = 'writer', type = 'User') => ({
  id,
  state,
  commit_id: commit,
  user: { login, type },
});

function assertBlocked(value, reason) {
  const result = evaluateTrust(value);
  assert.equal(result.candidate, false);
  assert.equal(result.autoMergeEligible, false);
  if (reason)
    assert.ok(
      result.reasons.some((item) => item.includes(reason)),
      result.reasons.join('\n'),
    );
  return result;
}

test('low risk is only an advisory candidate and labels grant no authority', () => {
  const value = snapshot();
  value.labels = ['risk:low', 'risk:high'];
  assert.equal(evaluateTrust(value).candidate, true);
  assert.equal(evaluateTrust(value).autoMergeEligible, false);
  value.files[0].filename = 'api/mcp.ts';
  const result = assertBlocked(value, 'approval is missing');
  assert.equal(result.risk, 'high');
});

test('both rename paths classify and incomplete or invalid file evidence blocks', () => {
  const files = [
    {
      filename: 'docs/codeowners.mdx',
      previous_filename: '.github/CODEOWNERS',
      status: 'renamed',
    },
  ];
  assert.equal(classifyFiles(files, 1).risk, 'high');
  assert.equal(
    classifyFiles(
      [
        {
          filename: '.github/CODEOWNERS',
          previous_filename: 'docs/x.mdx',
          status: 'renamed',
        },
      ],
      1,
    ).risk,
    'high',
  );
  for (const [records, count] of [
    [[], 0],
    [files, 2],
    [files, 3000],
    [[...files, ...files].flat(), 2],
    [[{ filename: 'docs/x.mdx', status: 'renamed' }], 1],
    [[{ filename: '../docs/x.mdx', status: 'modified' }], 1],
  ]) {
    assert.throws(() => classifyFiles(records, count));
  }
});

test('capability guides and policy documentation require review', () => {
  for (const path of [
    'docs/mcp/home.mdx',
    'docs/sdk/quickstart.mdx',
    'docs/api-docs/in-depth-guides/mcp.mdx',
    'docs/api-docs/getting-started/sdk-quickstart.mdx',
  ]) {
    const result = assertBlocked(snapshot(path), 'approval is missing');
    assert.equal(result.risk, 'medium', path);
  }
  assert.equal(evaluateTrust(snapshot('docs/risk-gates.md')).risk, 'high');
});

test('medium and high require a current-head nonauthor human writer', () => {
  for (const path of ['README.md', 'api/mcp.ts']) {
    const value = snapshot(path);
    assertBlocked(value, 'approval is missing');
    for (const invalid of [
      review(1, 'APPROVED', BASE),
      review(1, 'APPROVED', HEAD, 'author'),
      review(1, 'APPROVED', HEAD, 'writer', 'Bot'),
    ]) {
      value.reviews = [invalid];
      assert.equal(evaluateTrust(value).approval.passed, false);
    }
    for (const permission of ['read', 'triage', 'none']) {
      value.reviews = [review(1, 'APPROVED')];
      value.permissions.writer = permission;
      assert.equal(evaluateTrust(value).approval.passed, false);
    }
    value.permissions.writer = 'write';
    assert.equal(evaluateTrust(value).approval.passed, true);
    assert.equal(evaluateTrust(value).candidate, false);
  }
});

test('COMMENTED is transparent while dismissal and changes requested revoke', () => {
  const value = snapshot('README.md');
  value.reviews = [review(1, 'APPROVED'), review(2, 'COMMENTED')];
  assert.equal(evaluateTrust(value).approval.passed, true);
  value.reviews.push(review(3, 'DISMISSED'));
  assert.equal(evaluateTrust(value).approval.passed, false);
  value.reviews.push(review(4, 'APPROVED'));
  assert.equal(evaluateTrust(value).approval.passed, true);
  value.reviews.push(review(5, 'CHANGES_REQUESTED'));
  assertBlocked(value, 'requests changes');
  value.reviews.push(review(6, 'COMMENTED'));
  assertBlocked(value, 'requests changes');
  value.reviews.push(review(7, 'APPROVED'));
  assert.equal(evaluateTrust(value).approval.passed, true);
  value.head = 'd'.repeat(40);
  assert.equal(evaluateTrust(value).approval.passed, false);
});

test('another writer approval does not overrule unresolved changes', () => {
  const value = snapshot();
  value.reviews = [
    review(1, 'CHANGES_REQUESTED', BASE),
    review(2, 'APPROVED', HEAD, 'other'),
  ];
  value.permissions.other = 'maintain';
  assertBlocked(value, 'requests changes');
  delete value.permissions.other;
  assertBlocked(value, 'permission evidence is missing');
});

test('skipped, neutral, missing, stale and forged CI evidence all block', () => {
  const mutations = [
    (v) => {
      v.ci.run.conclusion = 'skipped';
    },
    (v) => {
      v.ci.run.conclusion = 'neutral';
    },
    (v) => {
      v.ci.run.status = 'in_progress';
    },
    (v) => {
      v.ci.run = null;
    },
    (v) => {
      v.ci.jobs[0].conclusion = 'skipped';
    },
    (v) => {
      v.ci.jobs[0].check.conclusion = 'neutral';
    },
    (v) => {
      v.ci.jobs.shift();
    },
    (v) => {
      v.ci.jobs.push(v.ci.jobs[0]);
    },
    (v) => {
      v.ci.jobs[0].run_attempt = 1;
    },
    (v) => {
      v.ci.jobs[0].check.head_sha = BASE;
    },
    (v) => {
      v.ci.jobs[0].check.app = { id: 1, slug: 'attacker' };
    },
    (v) => {
      v.ci.run.head_sha = BASE;
    },
    (v) => {
      v.ci.run.workflow_id = 999;
    },
    (v) => {
      v.ci.run.path = '.github/workflows/fake.yml';
    },
    (v) => {
      v.ci.run.event = 'workflow_dispatch';
    },
    (v) => {
      v.ci.run.repository.full_name = 'attacker/API';
    },
    (v) => {
      v.ci.run.pull_requests[0].base.sha = 'd'.repeat(40);
    },
    (v) => {
      v.ci.run.pull_requests[0].head.sha = BASE;
    },
    (v) => {
      v.ci.run.pull_requests = [];
    },
  ];
  for (const mutate of mutations) {
    const value = snapshot();
    mutate(value);
    assertBlocked(value);
  }
});

test('draft, merge conflict, wrong base and shared SHA never become candidates', () => {
  for (const mutate of [
    (v) => {
      v.draft = true;
    },
    (v) => {
      v.mergeable = null;
    },
    (v) => {
      v.mergeableState = 'dirty';
    },
    (v) => {
      v.baseRef = 'other';
    },
    (v) => {
      v.sameHeadPulls = [10, 11];
    },
    (v) => {
      v.sameHeadPulls = [];
    },
    (v) => {
      v.files = [];
    },
  ]) {
    const value = snapshot();
    mutate(value);
    assertBlocked(value);
  }
});

test('fork and Dependabot use offline CI evidence without requiring credentialed previews', () => {
  for (const fork of [true, false]) {
    const value = snapshot();
    if (fork) {
      value.headRepository = 'contributor/API';
      value.ci.run.head_repository.full_name = value.headRepository;
    } else value.author = 'dependabot[bot]';
    value.ci.jobs = value.ci.jobs.filter(
      (job) => !job.name.startsWith('MCP preview'),
    );
    assert.equal(evaluateTrust(value).candidate, true);
    assert.equal(evaluateTrust(value).autoMergeEligible, false);
  }
});

function fakeGithub(value, change = () => {}) {
  let reads = 0;
  const writes = [];
  const endpoints = {};
  const marker = (name) => (endpoints[name] = name);
  const github = {
    paginate: async (endpoint) => {
      if (endpoint === 'files') return structuredClone(value.files);
      if (endpoint === 'reviews') return structuredClone(value.reviews);
      if (endpoint === 'pulls')
        return value.sameHeadPulls.map((number) => ({
          number,
          head: { sha: value.head },
        }));
      if (endpoint === 'runs')
        return value.ci.run ? [structuredClone(value.ci.run)] : [];
      if (endpoint === 'jobs')
        return value.ci.jobs.map((job, index) => ({
          ...structuredClone(job),
          check_run_url: `https://api.github.com/repos/Terminal49/API/check-runs/${index + 1}`,
        }));
      if (endpoint === 'labels')
        return [{ name: 'risk:low' }, { name: 'risk:high' }];
      throw new Error(`Unexpected endpoint ${endpoint}`);
    },
    rest: {
      pulls: {
        listFiles: marker('files'),
        listReviews: marker('reviews'),
        list: marker('pulls'),
        get: async () => {
          if (++reads === 2) change(value);
          return {
            data: {
              head: {
                sha: value.head,
                repo: { full_name: value.headRepository },
              },
              base: { sha: value.base, ref: value.baseRef },
              user: { login: value.author },
              merge_commit_sha: value.merge,
              state: value.state,
              draft: value.draft,
              mergeable: value.mergeable,
              mergeable_state: value.mergeableState,
              changed_files: value.changedFiles,
            },
          };
        },
      },
      repos: {
        getCollaboratorPermissionLevel: async ({ username }) => ({
          data: { permission: value.permissions[username] },
        }),
      },
      actions: {
        getWorkflow: async () => ({ data: value.ci.workflow }),
        listWorkflowRuns: marker('runs'),
        listJobsForWorkflowRunAttempt: marker('jobs'),
      },
      checks: {
        getSuite: async () => ({ data: value.ci.suite }),
        get: async ({ check_run_id }) => ({
          data: value.ci.jobs[check_run_id - 1].check,
        }),
      },
      issues: {
        getLabel: async () => ({}),
        listLabelsOnIssue: marker('labels'),
        createLabel: async (args) => writes.push(['create', args]),
        removeLabel: async (args) => writes.push(['remove', args]),
        addLabels: async (args) => writes.push(['add', args]),
      },
    },
  };
  const summary = { addRaw: () => summary, write: async () => {} };
  return { github, writes, summary };
}

test('reconciler fetches authoritative evidence, converges labels and cannot merge', async () => {
  const value = snapshot();
  const { github, writes, summary } = fakeGithub(value);
  const args = {
    github,
    summary,
    repository: value.repository,
    number: 10,
    defaultBranch: 'main',
  };
  const result = await reconcilePull(args);
  assert.equal(result.candidate, true);
  assert.equal(result.autoMergeEligible, false);
  assert.deepEqual(
    writes.map(([kind, args]) => [kind, args.name]),
    [['remove', 'risk:high']],
  );
  assert.equal((await reconcilePull(args)).candidate, true);
});

test('latest pending CI run cannot fall back to earlier success without a PR association', async () => {
  const value = snapshot();
  const { github, summary } = fakeGithub(value);
  const paginate = github.paginate;
  github.paginate = async (endpoint) =>
    endpoint === 'runs'
      ? [
          value.ci.run,
          {
            ...value.ci.run,
            id: 101,
            status: 'queued',
            conclusion: null,
            pull_requests: [],
          },
        ]
      : paginate(endpoint);
  const result = await reconcilePull({
    github,
    summary,
    repository: value.repository,
    number: 10,
    defaultBranch: 'main',
  });
  assert.equal(result.candidate, false);
  assert.ok(
    result.reasons.some((reason) => reason.includes('CI run must complete')),
  );
  assert.ok(result.reasons.some((reason) => reason.includes('provenance')));
});

test('head, review, permission or CI mutation during collection withholds candidate', async () => {
  for (const mutate of [
    (v) => {
      v.head = 'd'.repeat(40);
    },
    (v) => {
      v.reviews[0].state = 'DISMISSED';
    },
    (v) => {
      v.permissions.writer = 'read';
    },
    (v) => {
      v.ci.run.run_attempt = 3;
    },
  ]) {
    const value = snapshot();
    value.reviews = [review(1, 'APPROVED')];
    const { github, summary, writes } = fakeGithub(value, mutate);
    const result = await reconcilePull({
      github,
      summary,
      repository: value.repository,
      number: 10,
      defaultBranch: 'main',
    });
    assert.equal(result.candidate, false);
    assert.equal(result.risk, 'unknown');
    assert.ok(
      writes.some(
        ([kind, args]) => kind === 'add' && args.labels[0] === 'risk:unknown',
      ),
    );
  }
});

test('GitHub read and label publication failures propagate without reporting success', async () => {
  const value = snapshot();
  value.reviews = [review(1, 'APPROVED')];
  const failure = fakeGithub(value);
  failure.github.rest.repos.getCollaboratorPermissionLevel = async () => {
    throw new Error('permission API unavailable');
  };
  await assert.rejects(
    collectSnapshot(failure.github, value.repository, 10, 'main'),
    /permission API unavailable/,
  );
  assert.equal(failure.writes.length, 0);
  const publishFailure = fakeGithub(snapshot());
  publishFailure.github.rest.issues.removeLabel = async () => {
    throw new Error('label API unavailable');
  };
  await assert.rejects(
    reconcilePull({
      ...publishFailure,
      repository: value.repository,
      number: 10,
      defaultBranch: 'main',
    }),
    /label API unavailable/,
  );
});

test('workflow boundary uses immutable default code with no PR execution or merge credentials', () => {
  const controller = readFileSync(
    new URL('../../.github/workflows/trust-policy.yml', import.meta.url),
    'utf8',
  );
  assert.match(controller, /pull_request_target:/);
  assert.doesNotMatch(controller, /pull_request_review:/);
  assert.match(controller, /ref: \$\{\{ steps\.trusted\.outputs\.sha \}\}/);
  assert.match(controller, /persist-credentials: false/);
  assert.match(controller, /cancel-in-progress: false/);
  assert.match(controller, /schedule:/);
  assert.match(controller, /workflow_dispatch:/);
  assert.doesNotMatch(
    controller,
    /secrets\.|npm ci|download-artifact|cache:|pull-requests: write|checks: write|gh pr merge|enablePullRequestAutoMerge/,
  );
  const uses = controller.matchAll(/uses: ([^\n]+)/g);
  for (const [, action] of uses) assert.match(action, /@[a-f0-9]{40}$/);
  const signal = readFileSync(
    new URL('../../.github/workflows/trust-review-signal.yml', import.meta.url),
    'utf8',
  );
  assert.match(signal, /permissions: \{\}/);
  assert.doesNotMatch(signal, /checkout|secrets\.|github-script|node /);
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  assert.match(manifest.scripts.test, /test:risk-policy/);
  assert.match(
    readFileSync(
      new URL('../../bin/agent-verify.mjs', import.meta.url),
      'utf8',
    ),
    /command: \['npm', 'test'\]/,
  );
});

test('an older CI run rerun recently cannot be replaced by an earlier success', async () => {
  const value = snapshot();
  const { github, summary } = fakeGithub(value);
  const paginate = github.paginate;
  github.paginate = async (endpoint, args) =>
    endpoint === 'runs'
      ? [
          value.ci.run,
          {
            ...value.ci.run,
            id: 99,
            run_attempt: 3,
            updated_at: '2026-10-06T06:00:00Z',
            status: 'in_progress',
            conclusion: null,
          },
        ]
      : paginate(endpoint, args);
  const result = await reconcilePull({
    github,
    summary,
    repository: value.repository,
    number: 10,
    defaultBranch: 'main',
  });
  assert.equal(result.candidate, false);
  assert.equal(result.verification.runId, 99);
  assert.ok(
    result.reasons.some((reason) =>
      reason.includes('CI run must complete successfully'),
    ),
  );
});

test('controller consumes Octokit normalized paginated response arrays', async () => {
  const value = snapshot();
  const { github, summary } = fakeGithub(value);
  const paginate = github.paginate;
  github.paginate = async (endpoint, args, mapResponse) => {
    const data = await paginate(endpoint, args);
    return mapResponse ? mapResponse({ data }) : data;
  };
  const result = await reconcilePull({
    github,
    summary,
    repository: value.repository,
    number: 10,
    defaultBranch: 'main',
  });
  assert.equal(result.verification.passed, true);
  assert.equal(result.verification.runId, 100);
});
