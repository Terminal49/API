import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

const workflow = readFileSync(
  new URL('../../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);

/** Each top-level job's YAML text, keyed by job id. */
function jobs(yaml: string): Map<string, string> {
  const body = yaml.slice(yaml.indexOf('\njobs:\n'));
  const result = new Map<string, string>();
  for (const block of body.split(/\n(?= {2}[\w-]+:\n)/).slice(1)) {
    const id = /^ {2}([\w-]+):/.exec(block)?.[1];
    if (id) result.set(id, block);
  }
  return result;
}

describe('CI sandbox write evals', () => {
  const writeJobs = [...jobs(workflow)].filter(([, text]) =>
    text.includes('MCP_EVAL_ENABLE_WRITE'),
  );

  it('run in one job only', () => {
    expect(writeJobs.map(([id]) => id)).toEqual(['mcp-sandbox-write-eval']);
  });

  it('run only on pushes to main', () => {
    expect(writeJobs[0]?.[1]).toContain(
      "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
    );
  });

  it('never run two at once against the sandbox account', () => {
    expect(writeJobs[0]?.[1]).toMatch(
      /concurrency:\n {6}group: mcp-sandbox-write-eval\n {6}cancel-in-progress: false\n/,
    );
  });

  it('wait for the production deployment of the pushed commit before running', () => {
    const text = writeJobs[0]?.[1] ?? '';
    const wait = text.indexOf(
      "- name: Wait for this commit's Vercel production deployment",
    );
    const evalStep = text.indexOf('- name: Eval MCP write tools');
    expect(wait).toBeGreaterThan(-1);
    expect(evalStep).toBeGreaterThan(wait);
    expect(text.slice(wait, evalStep)).toContain(
      'PRODUCTION_SHA: ${{ github.sha }}',
    );
  });
});
