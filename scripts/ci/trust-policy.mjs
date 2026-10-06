import { classifyFiles } from './classify-pr-risk.mjs';

export const CI_WORKFLOW = '.github/workflows/ci.yml';
export const CI_JOBS = [
  'Vite+ monorepo check',
  'sdk (20)',
  'sdk (22)',
  'sdk (24)',
  'sdk-tooling',
  'cli (20)',
  'cli (22)',
  'cli (24)',
  'mcp',
  ...[
    '2026-07-28',
    '2025-11-25',
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
    '2024-10-07',
  ].map((version) => `MCP protocol ${version}`),
];

const WRITER_PERMISSIONS = new Set(['write', 'maintain', 'admin']);
const REVIEW_STATES = new Set([
  'APPROVED',
  'CHANGES_REQUESTED',
  'DISMISSED',
  'COMMENTED',
  'PENDING',
]);
const SHA = /^[a-f0-9]{40}$/;

export function evaluateApproval(snapshot, risk) {
  const decisive = new Map();
  const seen = new Set();
  for (const review of [...snapshot.reviews].sort((a, b) => a.id - b.id)) {
    if (
      !Number.isSafeInteger(review.id) ||
      seen.has(review.id) ||
      !REVIEW_STATES.has(review.state)
    ) {
      throw new Error(
        'Review evidence contains an invalid state or duplicate review',
      );
    }
    seen.add(review.id);
    const { login, type } = review.user ?? {};
    if (
      !login ||
      !['User', 'Bot'].includes(type) ||
      !SHA.test(review.commit_id ?? '')
    ) {
      throw new Error('Review evidence contains an invalid reviewer or commit');
    }
    if (type !== 'User' || login === snapshot.author) continue;
    const permission = snapshot.permissions[login];
    if (typeof permission !== 'string')
      throw new Error('Reviewer permission evidence is missing');
    if (!WRITER_PERMISSIONS.has(permission)) continue;
    if (!['COMMENTED', 'PENDING'].includes(review.state))
      decisive.set(login, review);
  }
  const blockers = [...decisive]
    .filter(([, review]) => review.state === 'CHANGES_REQUESTED')
    .map(([login]) => login);
  const writers = [...decisive]
    .filter(
      ([, review]) =>
        review.state === 'APPROVED' && review.commit_id === snapshot.head,
    )
    .map(([login]) => login);
  const required = risk !== 'low';
  const passed = blockers.length === 0 && (!required || writers.length > 0);
  return { required, passed, writers, blockers };
}

export function evaluateVerification(snapshot) {
  const { ci } = snapshot;
  const reasons = [];
  if (!ci?.run)
    return { passed: false, reasons: ['Current-head CI is missing'] };
  const { run, jobs, suite, workflow } = ci;
  const association = run.pull_requests?.find(
    (pull) => pull.number === snapshot.number,
  );
  if (
    workflow.path !== CI_WORKFLOW ||
    run.workflow_id !== workflow.id ||
    !(
      run.path === CI_WORKFLOW ||
      (run.path?.startsWith(`${CI_WORKFLOW}@`) &&
        run.path.length > CI_WORKFLOW.length + 1)
    ) ||
    run.repository?.full_name !== snapshot.repository ||
    run.head_repository?.full_name !== snapshot.headRepository ||
    run.event !== 'pull_request' ||
    ![snapshot.head, snapshot.merge].includes(run.head_sha) ||
    association?.head?.sha !== snapshot.head ||
    association?.base?.sha !== snapshot.base ||
    association?.base?.ref !== snapshot.baseRef ||
    suite.id !== run.check_suite_id ||
    suite.app?.slug !== 'github-actions' ||
    ![snapshot.head, snapshot.merge].includes(suite.head_sha)
  )
    reasons.push('CI provenance or current head/base association is invalid');
  if (run.status !== 'completed' || run.conclusion !== 'success') {
    reasons.push('CI run must complete successfully');
  }
  if (
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    !Array.isArray(jobs)
  ) {
    reasons.push('CI attempt or job evidence is invalid');
    return { passed: false, reasons };
  }
  const required = [...CI_JOBS];
  if (
    snapshot.headRepository === snapshot.repository &&
    snapshot.author !== 'dependabot[bot]'
  ) {
    required.push('MCP preview 2026-07-28', 'MCP preview 2025-11-25');
  }
  for (const name of required) {
    const matches = jobs.filter((job) => job.name === name);
    const job = matches[0];
    if (
      matches.length !== 1 ||
      job.run_id !== run.id ||
      job.run_attempt !== run.run_attempt ||
      job.status !== 'completed' ||
      job.conclusion !== 'success' ||
      job.check?.name !== name ||
      job.check?.status !== 'completed' ||
      job.check?.conclusion !== 'success' ||
      job.check?.check_suite?.id !== suite.id ||
      job.check?.app?.id !== suite.app.id ||
      job.check?.app?.slug !== 'github-actions' ||
      ![snapshot.head, snapshot.merge].includes(job.check?.head_sha)
    )
      reasons.push(
        `Required CI job lacks successful current-attempt evidence: ${name}`,
      );
  }
  return {
    passed: reasons.length === 0,
    runId: run.id,
    attempt: run.run_attempt,
    reasons,
  };
}

export function evaluateTrust(snapshot) {
  const reasons = [];
  let risk = 'unknown';
  let approval = { required: true, passed: false, writers: [], blockers: [] };
  let verification = { passed: false, reasons: [] };
  try {
    if (
      !SHA.test(snapshot.head ?? '') ||
      !SHA.test(snapshot.base ?? '') ||
      !Number.isSafeInteger(snapshot.number) ||
      snapshot.number < 1 ||
      snapshot.baseRef !== snapshot.defaultBranch ||
      snapshot.state !== 'open' ||
      typeof snapshot.author !== 'string' ||
      !Array.isArray(snapshot.reviews) ||
      !Array.isArray(snapshot.sameHeadPulls) ||
      snapshot.sameHeadPulls.length !== 1 ||
      snapshot.sameHeadPulls[0] !== snapshot.number
    )
      throw new Error(
        'PR evidence is invalid, closed, targets another branch, or shares its head',
      );
    risk = classifyFiles(snapshot.files, snapshot.changedFiles).risk;
    approval = evaluateApproval(snapshot, risk);
    verification = evaluateVerification(snapshot);
    if (!approval.passed)
      reasons.push(
        approval.blockers.length
          ? 'A writer requests changes'
          : 'Current-head human writer approval is missing',
      );
    reasons.push(...verification.reasons);
    if (snapshot.draft) reasons.push('PR is a draft');
    if (snapshot.mergeable !== true || snapshot.mergeableState !== 'clean')
      reasons.push('GitHub has not confirmed a clean merge');
  } catch (error) {
    reasons.push(error.message);
  }
  const candidate =
    risk === 'low' &&
    approval.passed &&
    verification.passed &&
    reasons.length === 0;
  return {
    risk,
    approval,
    verification,
    candidate,
    autoMergeEligible: false,
    reasons: [
      ...reasons,
      'Advisory mode has no trusted App publisher or merge authority',
    ],
  };
}

export function formatTrustReport(snapshot, decision) {
  return [
    `### Trust policy advisory for PR #${snapshot.number}`,
    '',
    `Head \`${snapshot.head}\`. Base \`${snapshot.base}\`.`,
    '',
    `Path risk \`risk:${decision.risk}\`. Approval ${decision.approval.passed ? 'satisfied' : 'pending or blocked'}. CI ${decision.verification.passed ? 'verified' : 'unverified'}.`,
    '',
    `Low-risk candidate ${decision.candidate ? 'yes' : 'no'}. Auto-merge eligible **no**.`,
    decision.verification.runId
      ? `CI evidence [run ${decision.verification.runId}](https://github.com/${snapshot.repository}/actions/runs/${decision.verification.runId}), attempt ${decision.verification.attempt}.`
      : 'CI evidence is unavailable.',
    '',
    ...decision.reasons.map((reason) => `- ${reason}`),
    '',
    'This report is asynchronous advisory evidence. Native human-review protection must be configured and verified separately. Do not require this Actions job as an authorization gate.',
  ].join('\n');
}
