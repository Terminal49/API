import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

test('environment credentials are ignored while public templates remain addable', () => {
  for (const name of [
    '.env.local',
    '.env.development',
    '.env.production',
    '.env.test',
  ]) {
    assert.equal(
      spawnSync('git', ['check-ignore', '--no-index', '-q', name], {
        cwd: root,
      }).status,
      0,
      name,
    );
  }
  for (const name of ['.env.sample', '.env.example', '.env.local.example']) {
    assert.equal(
      spawnSync('git', ['check-ignore', '--no-index', '-q', name], {
        cwd: root,
      }).status,
      1,
      name,
    );
  }
});
