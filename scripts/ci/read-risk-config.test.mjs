import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { assessConfiguration } from './read-risk-config.mjs';

function configuration() {
  return {
    repository: { allow_auto_merge: false },
    rules: [
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 1,
          dismiss_stale_reviews_on_push: true,
          required_review_thread_resolution: true,
          require_last_push_approval: true,
          require_code_owner_review: true,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: 'Vite+ monorepo check', integration_id: 15368 },
          ],
        },
      },
    ],
    protection: null,
    rulesets: [{ bypass_actors: [] }],
  };
}

test('configuration inspection requires actual native protection and always disables eligibility', () => {
  assert.equal(
    assessConfiguration(configuration()).nativeHumanReviewConfigured,
    true,
  );
  assert.equal(assessConfiguration(configuration()).autoMergeEligible, false);
  const result = assessConfiguration({
    repository: { allow_auto_merge: false },
    rules: [],
    protection: null,
    rulesets: [],
  });
  assert.equal(result.nativeHumanReviewConfigured, false);
  assert.ok(result.reasons.some((reason) => reason.includes('human review')));
});

test('unbound source, stale review gaps, bypasses and enabled auto-merge reject setup', () => {
  for (const change of [
    (v) => {
      v.rules[0].parameters.dismiss_stale_reviews_on_push = false;
    },
    (v) => {
      v.rules[0].parameters.require_last_push_approval = false;
    },
    (v) => {
      v.rules[0].parameters.require_code_owner_review = false;
    },
    (v) => {
      v.rules[1].parameters.required_status_checks[0].integration_id = null;
    },
    (v) => {
      v.rules[1].parameters.strict_required_status_checks_policy = false;
    },
    (v) => {
      v.rulesets[0].bypass_actors.push({ actor_id: 1 });
    },
    (v) => {
      v.repository.allow_auto_merge = true;
    },
    (v) => {
      v.rules[1].parameters.required_status_checks.push({
        context: 'Advisory policy (never authorizes or merges)',
      });
    },
  ]) {
    const value = configuration();
    change(value);
    assert.equal(assessConfiguration(value).nativeHumanReviewConfigured, false);
  }
});

function legacyConfiguration() {
  const value = configuration();
  value.rules = [];
  value.protection = {
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: true,
      require_last_push_approval: true,
      require_code_owner_reviews: true,
    },
    required_status_checks: {
      strict: true,
      checks: [{ context: 'Vite+ monorepo check', app_id: 15368 }],
    },
    required_conversation_resolution: { enabled: true },
    enforce_admins: { enabled: true },
  };
  return value;
}

test('legacy protection uses its distinct stale-review and conversation fields', () => {
  const value = legacyConfiguration();
  assert.equal(assessConfiguration(value).nativeHumanReviewConfigured, true);
  value.protection.required_conversation_resolution.enabled = false;
  assert.equal(assessConfiguration(value).nativeHumanReviewConfigured, false);
});

test('symlink CLI invocation reads configuration and reports unprotected branch as failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'risk-config-cli-'));
  try {
    const gh = join(dir, 'gh');
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const endpoint = process.argv[3];
if (endpoint.endsWith('/protection')) {
  process.stderr.write('HTTP 404');
  process.exit(1);
}
process.stdout.write(JSON.stringify(endpoint.endsWith('/rules/branches/main') ? [] : { default_branch: 'main', allow_auto_merge: false }));
`,
    );
    chmodSync(gh, 0o755);
    const entry = join(dir, 'reader.mjs');
    symlinkSync(
      fileURLToPath(new URL('./read-risk-config.mjs', import.meta.url)),
      entry,
    );
    const result = spawnSync(process.execPath, [entry, 'Terminal49/API'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    });
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.nativeHumanReviewConfigured, false);
    assert.equal(report.autoMergeEligible, false);
    assert.ok(report.reasons.some((reason) => reason.includes('human review')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy user, team and App review bypasses never establish protection', () => {
  for (const group of ['users', 'teams', 'apps']) {
    const value = legacyConfiguration();
    const allowances = { users: [], teams: [], apps: [] };
    allowances[group].push({ id: 1 });
    value.protection.required_pull_request_reviews.bypass_pull_request_allowances =
      allowances;
    assert.equal(assessConfiguration(value).nativeHumanReviewConfigured, false);
  }
});

test('missing or malformed ruleset bypass evidence never establishes protection', () => {
  for (const ruleset of [{}, { bypass_actors: null }, { bypass_actors: {} }]) {
    const value = configuration();
    value.rulesets = [ruleset];
    assert.equal(assessConfiguration(value).nativeHumanReviewConfigured, false);
  }
});

test('configuration inspection consumes all effective branch-rule pages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'risk-config-pages-'));
  try {
    const gh = join(dir, 'gh');
    const rules = configuration().rules;
    writeFileSync(
      gh,
      `#!/usr/bin/env node
const endpoint = process.argv[3];
if (endpoint.endsWith('/protection')) { process.stderr.write('HTTP 404'); process.exit(1); }
if (endpoint.endsWith('/rules/branches/main')) {
 const first = Array.from({length:30},()=>({type:'update'}));
 const later = ${JSON.stringify(rules)};
 const paginated = process.argv.includes('--paginate') && process.argv.includes('--slurp');
 process.stdout.write(JSON.stringify(paginated ? [first,later] : first));
} else process.stdout.write(JSON.stringify({default_branch:'main',allow_auto_merge:false}));
`,
    );
    chmodSync(gh, 0o755);
    const result = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL('./read-risk-config.mjs', import.meta.url)),
        'Terminal49/API',
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.nativeHumanReviewConfigured, true);
    assert.equal(report.effectiveRules.length, 32);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
