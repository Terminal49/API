#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

export function assessConfiguration({
  repository,
  rules,
  protection,
  rulesets,
}) {
  const reasons = [];
  const pullRules = rules.filter((rule) => rule.type === 'pull_request');
  const parameters = pullRules.map((rule) => ({
    ...rule.parameters,
    dismiss_stale_reviews: rule.parameters?.dismiss_stale_reviews_on_push,
    resolve_conversations: rule.parameters?.required_review_thread_resolution,
  }));
  if (protection?.required_pull_request_reviews)
    parameters.push({
      ...protection.required_pull_request_reviews,
      require_code_owner_review:
        protection.required_pull_request_reviews.require_code_owner_reviews,
      resolve_conversations:
        protection.required_conversation_resolution?.enabled,
    });
  if (
    !parameters.some(
      (policy) =>
        policy?.required_approving_review_count >= 1 &&
        policy.dismiss_stale_reviews === true &&
        policy.require_last_push_approval === true &&
        policy.require_code_owner_review === true &&
        policy.resolve_conversations === true,
    )
  )
    reasons.push(
      'Required human review, stale dismissal, latest-push approval, CODEOWNERS review, and resolved conversations are not established together',
    );
  const statusRules = rules.filter(
    (rule) => rule.type === 'required_status_checks',
  );
  const checks = statusRules.flatMap(
    (rule) => rule.parameters?.required_status_checks ?? [],
  );
  for (const check of protection?.required_status_checks?.checks ?? [])
    checks.push({ context: check.context, integration_id: check.app_id });
  const strict =
    statusRules.some(
      (rule) => rule.parameters?.strict_required_status_checks_policy === true,
    ) || protection?.required_status_checks?.strict === true;
  if (!strict)
    reasons.push('Required checks do not require an up-to-date branch');
  if (
    !checks.some(
      (check) =>
        check.context === 'Vite+ monorepo check' &&
        check.integration_id === 15368,
    )
  ) {
    reasons.push('Vite+ monorepo check is not required from GitHub Actions');
  }
  if (
    checks.some((check) =>
      /Advisory|Current-head approval policy|Classify path risk/.test(
        check.context,
      ),
    )
  ) {
    reasons.push(
      'An advisory or retired Actions policy job is configured as authorization authority',
    );
  }
  if (rulesets.some((ruleset) => ruleset.bypass_actors?.length > 0))
    reasons.push('Applicable rulesets contain bypass actors');
  const legacyBypass =
    protection?.required_pull_request_reviews?.bypass_pull_request_allowances;
  if (
    legacyBypass &&
    ['users', 'teams', 'apps'].some(
      (group) =>
        !Array.isArray(legacyBypass[group]) || legacyBypass[group].length > 0,
    )
  )
    reasons.push(
      'Legacy protection contains review bypass allowances or incomplete bypass evidence',
    );
  if (protection && protection.enforce_admins?.enabled !== true)
    reasons.push('Legacy protection permits administrator bypass');
  if (repository.allow_auto_merge !== false)
    reasons.push('Repository auto-merge is enabled or its setting is unknown');
  return {
    nativeHumanReviewConfigured: reasons.length === 0,
    autoMergeEligible: false,
    reasons,
  };
}

function readApi(endpoint, optional = false) {
  try {
    return JSON.parse(
      execFileSync('gh', ['api', endpoint], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    );
  } catch (error) {
    if (optional && /HTTP 404/.test(error.stderr ?? '')) return null;
    throw new Error(`Unable to read GitHub configuration at ${endpoint}`);
  }
}

function main() {
  const repositoryName = process.argv[2];
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryName ?? ''))
    throw new Error('Usage: read-risk-config.mjs OWNER/REPO');
  const repository = readApi(`repos/${repositoryName}`);
  const branch = encodeURIComponent(repository.default_branch);
  const rules = readApi(`repos/${repositoryName}/rules/branches/${branch}`);
  const protection = readApi(
    `repos/${repositoryName}/branches/${branch}/protection`,
    true,
  );
  const rulesets = [
    ...new Set(rules.map((rule) => rule.ruleset_id).filter(Boolean)),
  ].map((id) => readApi(`repos/${repositoryName}/rulesets/${id}`));
  const decision = assessConfiguration({
    repository,
    rules,
    protection,
    rulesets,
  });
  process.stdout.write(
    `${JSON.stringify({ repository: repositoryName, branch: repository.default_branch, ...decision, effectiveRules: rules, legacyProtection: protection, applicableRulesets: rulesets }, null, 2)}\n`,
  );
  if (!decision.nativeHumanReviewConfigured) process.exitCode = 1;
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
