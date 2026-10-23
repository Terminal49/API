import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

test('third-party workflow actions use immutable commit references', () => {
  for (const file of readdirSync(new URL('.github/workflows/', root))) {
    if (!file.endsWith('.yml')) continue;
    for (const match of read(`.github/workflows/${file}`).matchAll(
      /\buses:\s*([^\s#]+)/g,
    )) {
      assert.match(
        match[1],
        /^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/,
        `${file}: ${match[1]}`,
      );
    }
  }
});

test('review marketplace loads from an independently pinned checkout', () => {
  const workflow = read('.github/workflows/claude-code-review.yml');
  assert.match(
    workflow,
    /repository: anthropics\/claude-code\n\s+ref: [a-f0-9]{40}\n\s+path: \.review-marketplace/,
  );
  assert.match(
    workflow,
    /plugin_marketplaces: ['"]\.\/\.review-marketplace['"]/,
  );
});

test('Postman pull-request validation has no repository-write credential', () => {
  const workflow = read('.github/workflows/generate_postman.yml');
  assert.match(workflow, /permissions:\n  contents: read/);
  const validation = workflow
    .split('  validate-postman-collection:')[1]
    ?.split('  publish-postman-collection:')[0];
  assert.ok(validation);
  assert.ok(!validation.includes('contents: write'));
  assert.match(validation, /persist-credentials: false/);
  assert.match(
    workflow,
    /publish-postman-collection:\n\s+if: github.event_name == 'push' && github.ref == 'refs\/heads\/main'/,
  );
});

function releaseStep(workflow) {
  const section = workflow
    .split('- name: Resolve release tag')[1]
    ?.split('- name: Checkout')[0];
  assert.ok(section);
  return section
    .split(/\brun:\s*(?:\|\n)?/)[1]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n')
    .trim();
}

for (const product of ['sdk', 'cli']) {
  test(`${product} release tags remain data rather than shell instructions`, () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 't49-release-test-'));
    try {
      const workflow = read(
        `.github/workflows/publish_typescript_${product}.yml`,
      );
      const source = releaseStep(workflow);
      const output = path.join(dir, 'output');
      const marker = path.join(dir, 'unexpected');
      function run(tag) {
        const command = source.replace(
          /\$\{\{\s*github\.event\.release\.tag_name\s*\|\|\s*inputs\.tag\s*\}\}/g,
          tag,
        );
        return spawnSync('bash', ['-e', '-c', command], {
          env: {
            PATH: process.env.PATH,
            RELEASE_TAG: tag,
            GITHUB_OUTPUT: output,
          },
          encoding: 'utf8',
        });
      }
      assert.equal(run(`${product}-v0.6.0`).status, 0);
      assert.match(
        readFileSync(output, 'utf8'),
        new RegExp(`^tag=${product}-v0.6.0\\n$`),
      );
      assert.notEqual(run(`v0.6.0$(touch ${marker})`).status, 0);
      assert.equal(existsSync(marker), false);
      assert.notEqual(run('v0.6.0\nOTHER=unexpected').status, 0);
      assert.notEqual(run('refs/heads/main').status, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
