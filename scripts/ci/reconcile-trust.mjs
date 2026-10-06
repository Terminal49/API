import {
  evaluateTrust,
  formatTrustReport,
  CI_WORKFLOW,
} from './trust-policy.mjs';

export async function collectSnapshot(
  github,
  repository,
  number,
  defaultBranch,
) {
  const [owner, repo] = repository.split('/');
  const params = { owner, repo };
  const { data: pull } = await github.rest.pulls.get({
    ...params,
    pull_number: number,
  });
  const files = await github.paginate(github.rest.pulls.listFiles, {
    ...params,
    pull_number: number,
    per_page: 100,
  });
  const reviews = await github.paginate(github.rest.pulls.listReviews, {
    ...params,
    pull_number: number,
    per_page: 100,
  });
  const permissions = {};
  for (const login of new Set(
    reviews
      .filter(
        (review) =>
          review.user?.type === 'User' && review.user.login !== pull.user.login,
      )
      .map((review) => review.user.login),
  )) {
    try {
      const { data } = await github.rest.repos.getCollaboratorPermissionLevel({
        ...params,
        username: login,
      });
      permissions[login] = data.permission;
    } catch (error) {
      if (error.status !== 404) throw error;
      permissions[login] = 'none';
    }
  }
  const openPulls = await github.paginate(github.rest.pulls.list, {
    ...params,
    state: 'open',
    per_page: 100,
  });
  const sameHeadPulls = openPulls
    .filter((item) => item.head.sha === pull.head.sha)
    .map((item) => item.number)
    .sort((a, b) => a - b);
  const { data: workflow } = await github.rest.actions.getWorkflow({
    ...params,
    workflow_id: CI_WORKFLOW,
  });
  const runs = new Map();
  for (const sha of new Set(
    [pull.head.sha, pull.merge_commit_sha].filter(Boolean),
  )) {
    for (const run of await github.paginate(
      github.rest.actions.listWorkflowRuns,
      {
        ...params,
        workflow_id: workflow.id,
        event: 'pull_request',
        head_sha: sha,
        per_page: 100,
      },
    )) {
      runs.set(run.id, run);
    }
  }
  for (const run of runs.values()) {
    if (!Number.isFinite(Date.parse(run.updated_at ?? ''))) {
      throw new Error('CI run attempt freshness is unavailable');
    }
  }
  const run = [...runs.values()].sort(
    (a, b) =>
      Date.parse(b.updated_at) - Date.parse(a.updated_at) || b.id - a.id,
  )[0];
  let ci = { workflow, run: null };
  if (run) {
    const { data: suite } = await github.rest.checks.getSuite({
      ...params,
      check_suite_id: run.check_suite_id,
    });
    const jobs = await github.paginate(
      github.rest.actions.listJobsForWorkflowRunAttempt,
      {
        ...params,
        run_id: run.id,
        attempt_number: run.run_attempt,
        per_page: 100,
      },
    );
    for (const job of jobs) {
      const id = Number(job.check_run_url?.split('/').at(-1));
      if (!Number.isSafeInteger(id) || id < 1)
        throw new Error('Actions job has no valid check-run identity');
      const { data } = await github.rest.checks.get({
        ...params,
        check_run_id: id,
      });
      job.check = {
        name: data.name,
        status: data.status,
        conclusion: data.conclusion,
        head_sha: data.head_sha,
        app: { id: data.app?.id, slug: data.app?.slug },
        check_suite: { id: data.check_suite?.id },
      };
    }
    ci = {
      workflow: { id: workflow.id, path: workflow.path },
      run: {
        id: run.id,
        workflow_id: run.workflow_id,
        path: run.path,
        repository: { full_name: run.repository?.full_name },
        head_repository: { full_name: run.head_repository?.full_name },
        event: run.event,
        head_sha: run.head_sha,
        pull_requests: (run.pull_requests ?? []).map((item) => ({
          number: item.number,
          head: { sha: item.head.sha },
          base: { sha: item.base.sha, ref: item.base.ref },
        })),
        check_suite_id: run.check_suite_id,
        status: run.status,
        conclusion: run.conclusion,
        run_attempt: run.run_attempt,
      },
      suite: {
        id: suite.id,
        app: { id: suite.app?.id, slug: suite.app?.slug },
        head_sha: suite.head_sha,
      },
      jobs: jobs.map((job) => ({
        name: job.name,
        run_id: job.run_id,
        run_attempt: job.run_attempt,
        status: job.status,
        conclusion: job.conclusion,
        check: job.check,
      })),
    };
  }
  return {
    repository,
    number,
    defaultBranch,
    head: pull.head.sha,
    headRepository: pull.head.repo?.full_name,
    base: pull.base.sha,
    baseRef: pull.base.ref,
    merge: pull.merge_commit_sha,
    state: pull.state,
    draft: pull.draft,
    mergeable: pull.mergeable,
    mergeableState: pull.mergeable_state,
    author: pull.user.login,
    changedFiles: pull.changed_files,
    files: files.map((file) => ({
      filename: file.filename,
      previous_filename: file.previous_filename,
      status: file.status,
    })),
    reviews: reviews.map((review) => ({
      id: review.id,
      state: review.state,
      commit_id: review.commit_id,
      user: { login: review.user?.login, type: review.user?.type },
    })),
    permissions,
    sameHeadPulls,
    ci,
  };
}

export async function reconcilePull({
  github,
  repository,
  number,
  defaultBranch,
  summary,
}) {
  if (!Number.isSafeInteger(number) || number < 1)
    throw new Error('A positive integer PR number is required');
  const snapshot = await collectSnapshot(
    github,
    repository,
    number,
    defaultBranch,
  );
  let decision = evaluateTrust(snapshot);
  const fresh = await collectSnapshot(
    github,
    repository,
    number,
    defaultBranch,
  );
  if (JSON.stringify(snapshot) !== JSON.stringify(fresh)) {
    decision = {
      risk: 'unknown',
      approval: { passed: false },
      verification: { passed: false },
      candidate: false,
      autoMergeEligible: false,
      reasons: [
        'PR, review permission, or CI evidence changed during reconciliation',
        'Advisory mode has no trusted App publisher or merge authority',
      ],
    };
  }
  const [owner, repo] = repository.split('/');
  const params = { owner, repo, issue_number: number };
  const definitions = {
    low: {
      color: '2DA44E',
      description: 'Advisory path risk only; no merge permission',
    },
    medium: {
      color: 'BF8700',
      description: 'Advisory path risk; current-head human review needed',
    },
    high: {
      color: 'CF222E',
      description: 'Advisory path risk; current-head human review needed',
    },
    unknown: {
      color: '6E7781',
      description:
        'Advisory evidence unavailable or changed; no merge permission',
    },
  };
  const target = `risk:${decision.risk}`;
  try {
    await github.rest.issues.getLabel({ owner, repo, name: target });
  } catch (error) {
    if (error.status !== 404) throw error;
    await github.rest.issues.createLabel({
      owner,
      repo,
      name: target,
      ...definitions[decision.risk],
    });
  }
  const labels = await github.paginate(github.rest.issues.listLabelsOnIssue, {
    ...params,
    per_page: 100,
  });
  for (const label of labels) {
    if (
      /^risk:(low|medium|high|unknown)$/.test(label.name) &&
      label.name !== target
    ) {
      await github.rest.issues.removeLabel({ ...params, name: label.name });
    }
  }
  if (!labels.some((label) => label.name === target))
    await github.rest.issues.addLabels({ ...params, labels: [target] });
  await summary
    .addRaw(formatTrustReport(fresh, decision))
    .addRaw('\n\n')
    .write();
  return decision;
}

export async function reconcileEvent({ github, context, core }) {
  const { owner, repo } = context.repo;
  const { data: repository } = await github.rest.repos.get({ owner, repo });
  const defaultBranch = repository.default_branch;
  const numbers = context.payload.pull_request
    ? [context.payload.pull_request.number]
    : context.payload.workflow_run
      ? (context.payload.workflow_run.pull_requests ?? []).map(
          (pull) => pull.number,
        )
      : context.payload.inputs?.pull_number
        ? [Number(context.payload.inputs.pull_number)]
        : (
            await github.paginate(github.rest.pulls.list, {
              owner,
              repo,
              state: 'open',
              base: defaultBranch,
              per_page: 100,
            })
          ).map((pull) => pull.number);
  if (numbers.length === 0)
    core.notice(
      'No PR association is available. Scheduled reconciliation will inspect open PRs.',
    );
  for (const number of new Set(numbers)) {
    await reconcilePull({
      github,
      repository: `${owner}/${repo}`,
      number,
      defaultBranch,
      summary: core.summary,
    });
  }
}
