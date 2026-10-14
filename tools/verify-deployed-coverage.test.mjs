import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyDeployedCoverage } from './verify-deployed-coverage.mjs';

const pairs = {
  terminals: 'terminals',
  'ocean-carriers': 'shipping-lines',
  rail: 'rail-carriers',
  'inland-rail-terminals': 'inland-rail-terminals',
};
async function fixture(url) {
  const path = new URL(url).pathname.replace('/docs/', '');
  if (path === 'llms.txt')
    return Object.keys(pairs)
      .map((page) => '/docs/coverage/' + page)
      .join('\n');
  if (path.startsWith('coverage/')) {
    const page = path.split('/').at(-1).replace(/\.md$/, '');
    const links = ['json', 'csv']
      .map(
        (extension) =>
          `[${extension}](/docs/data/coverage/${pairs[page]}.${extension})`,
      )
      .join('\n');
    return path.endsWith('.md')
      ? (
          await readFile(
            new URL('../docs/coverage/' + page + '.mdx', import.meta.url),
            'utf8',
          )
        ).replaceAll('](/data/coverage/', '](/docs/data/coverage/') +
          '\n' +
          links
      : links;
  }
  return readFile(
    new URL('../docs/' + path.replace(/\.md$/, '.mdx'), import.meta.url),
    'utf8',
  );
}
const fetchFixture =
  (transform = (body) => body) =>
  async (url) =>
    new Response(await transform(await fixture(url), String(url)));

test('checks all four pages, complete Markdown, eight downloads and agent index', async () => {
  const report = await verifyDeployedCoverage({ fetchImpl: fetchFixture() });
  assert.equal(
    report.passed,
    true,
    JSON.stringify(report.checks.filter((check) => !check.passed)),
  );
  assert.equal(report.checks.length, 21);
});

test('detects missing inland directory from the agent index', async () => {
  const report = await verifyDeployedCoverage({
    fetchImpl: fetchFixture((body, url) =>
      url.endsWith('llms.txt')
        ? body.replace('/docs/coverage/inland-rail-terminals', '')
        : body,
    ),
  });
  assert.match(
    report.checks.find((check) => !check.passed).error,
    /Agent index missing inland/,
  );
});

test('reports HTTP download failures without losing other checks', async () => {
  const report = await verifyDeployedCoverage({
    fetchImpl: async (url) =>
      String(url).endsWith('.json')
        ? new Response('', { status: 404 })
        : fetchFixture()(url),
  });
  assert.equal(report.checks.filter((check) => !check.passed).length, 4);
  assert.ok(
    report.checks
      .filter((check) => !check.passed)
      .every((check) => check.error === 'HTTP 404'),
  );
});

test('detects a changed CSV snapshot and incomplete Markdown', async () => {
  const report = await verifyDeployedCoverage({
    fetchImpl: fetchFixture((body, url) =>
      url.endsWith('terminals.csv')
        ? body.replace('supported', 'unknown')
        : url.endsWith('/coverage/rail.md')
          ? body
              .split('\n')
              .filter((line) => !line.startsWith('|'))
              .join('\n')
          : body,
    ),
  });
  assert.equal(report.passed, false);
  assert.ok(
    report.checks.some((check) =>
      check.error?.includes('CSV snapshot differs'),
    ),
  );
  assert.ok(
    report.checks.some((check) =>
      check.error?.includes('Literal feature tables differ'),
    ),
  );
});

test('preserves feature table ordering relative to carrier identities', async () => {
  const report = await verifyDeployedCoverage({
    fetchImpl: fetchFixture((body, url) => {
      if (!url.endsWith('/coverage/ocean-carriers.md')) return body;
      const lines = body.split('\n');
      const indexes = lines
        .map((line, index) =>
          line.startsWith('|') && line.includes('Supported') ? index : -1,
        )
        .filter((index) => index >= 0);
      const first = indexes[0];
      const last = indexes.at(-1);
      [lines[first], lines[last]] = [lines[last], lines[first]];
      return lines.join('\n');
    }),
  });
  assert.ok(
    report.checks.some((check) =>
      check.error?.includes('Literal feature tables differ'),
    ),
  );
});

test('checks distinct URLs for the same download type', async () => {
  const report = await verifyDeployedCoverage({
    fetchImpl: async (url) => {
      if (String(url).includes('broken.example'))
        return new Response('', { status: 404 });
      let body = await fixture(url);
      if (String(url).endsWith('/coverage/rail'))
        body += '\n[JSON](https://broken.example/rail-carriers.json)';
      return new Response(body);
    },
  });
  assert.ok(
    report.checks.some(
      (check) =>
        check.url === 'https://broken.example/rail-carriers.json' &&
        check.error === 'HTTP 404',
    ),
  );
});
